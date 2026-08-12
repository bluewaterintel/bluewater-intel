/* ============================================================================
   Bluewater Intel — break detection + convergence scoring (M4 extension)
   ----------------------------------------------------------------------------
   Pure logic, no I/O, no synthetic data. Reasons over REAL gridded SST and
   chlorophyll values (with their real observedAt) to find EDGES — and, most
   importantly, where an SST temperature break and a chlorophyll color edge
   COINCIDE. That convergence is the classic offshore spot (a temp break sitting
   on a color change) that an experienced angler picks by eye, and which the old
   additive scoring under-rewarded because it scored the two edges separately.

   Runs in the browser (app) and in Node (tests). Mirrors the gradient method
   already used by thermalBreakReal() so the two are consistent.

   GRADIENT UNITS:
     • SST break:   °F per 10 nm   (same as thermalBreakReal)
     • Chlor break: mg/m³ per 10 nm
   ============================================================================ */

(function (root) {

  // Haversine nm — provided by the host app as nmBetween; fall back to a local
  // copy so the module is self-contained for tests.
  function _nm(la1, lo1, la2, lo2){
    if (typeof root.nmBetween === "function") return root.nmBetween(la1, lo1, la2, lo2);
    const R = 3440.065, toR = d => d*Math.PI/180;
    const dLa = toR(la2-la1), dLo = toR(lo2-lo1);
    const a = Math.sin(dLa/2)**2 + Math.cos(toR(la1))*Math.cos(toR(la2))*Math.sin(dLo/2)**2;
    return 2*R*Math.asin(Math.sqrt(a));
  }

  // Local gradient at a point from scattered {la,ln,v} samples, in <unit> per
  // 10 nm. Distance-weighted least-squares fit of a plane v ≈ v0 + a·x + b·y
  // over the samples within radiusNm; the gradient magnitude is hypot(a, b).
  //
  // This replaced a max-over-all-pairs scan. That scan answered "the sharpest
  // edge anywhere in the disc", so every point within radiusNm of a front
  // reported the same peak — a whole band read identically instead of falling
  // off — and it cost O(n²) haversines per query. A plane fit is O(n) and
  // genuinely local: it decays as you move off the front.
  function localGradientPer10nm(samples, lat, lng, radiusNm){
    const cosLat = Math.max(0.2, Math.cos(lat * Math.PI / 180));
    let sw = 0, sx = 0, sy = 0, sv = 0, n = 0;
    const near = [];
    for (const s of samples){
      if (s.v == null) continue;
      const d = _nm(lat, lng, s.la, s.ln);
      if (d > radiusNm) continue;
      // Local tangent-plane offsets in nm, east/north positive.
      const x = (s.ln - lng) * 60 * cosLat;
      const y = (s.la - lat) * 60;
      // Nearer samples describe the gradient here; far ones only steady the fit.
      const w = 1 - (d / radiusNm) * 0.75;
      near.push({ x, y, v: s.v, w });
      sw += w; sx += w * x; sy += w * y; sv += w * s.v; n++;
    }
    if (n < 3 || sw <= 0) return 0;
    const mx = sx / sw, my = sy / sw, mv = sv / sw;
    let Sxx = 0, Sxy = 0, Syy = 0, Sxv = 0, Syv = 0;
    for (const p of near){
      const dx = p.x - mx, dy = p.y - my, dv = p.v - mv;
      Sxx += p.w * dx * dx; Sxy += p.w * dx * dy; Syy += p.w * dy * dy;
      Sxv += p.w * dx * dv; Syv += p.w * dy * dv;
    }
    const det = Sxx * Syy - Sxy * Sxy;
    // Degenerate when the samples are collinear (or a single row) — no plane to
    // fit, so fall back to whichever axis carries spread.
    if (Math.abs(det) < 1e-9){
      if (Sxx > 1e-9) return Math.abs(Sxv / Sxx) * 10;
      if (Syy > 1e-9) return Math.abs(Syv / Syy) * 10;
      return 0;
    }
    const a = (Syy * Sxv - Sxy * Syv) / det;
    const b = (Sxx * Syv - Sxy * Sxv) / det;
    return Math.hypot(a, b) * 10;
  }

  // Pull {la,ln,v} for a given field key out of OCEAN_FIELD-style samples
  // ([{la,ln,p:{sst:{value},chlor:{value}}}]).
  function extract(samples, key){
    const out = [];
    for (const s of samples){
      const f = s && s.p && s.p[key];
      if (f && f.value != null) out.push({ la: s.la, ln: s.ln, v: f.value });
    }
    return out;
  }

  // Chlorophyll break = local chlorophyll gradient at a point, mg/m³ /10nm.
  function chlorBreak(samples, lat, lng, radiusNm){
    return localGradientPer10nm(extract(samples, "chlor"), lat, lng, radiusNm);
  }
  // SST break (provided for parity / tests; the app already has thermalBreakReal).
  function sstBreak(samples, lat, lng, radiusNm){
    return localGradientPer10nm(extract(samples, "sst"), lat, lng, radiusNm);
  }

  // Normalize each break to 0..1 "edge strength".
  //
  // These were four-step ladders that hit 1.0 at thresholds the Gulf Stream wall
  // routinely exceeds (4°F/10nm, 0.30 mg/m³/10nm), so every cell on a front
  // pegged at the top and the factor stopped discriminating. They are now
  // piecewise-linear ramps through the same calibration points, continuing to a
  // genuinely exceptional value before reaching 1.0 — same shape and ordering,
  // but a sharper front still outscores a merely strong one.
  function _ramp(v, anchors){
    if (!(v > 0)) return 0;
    for (let i = 1; i < anchors.length; i++){
      if (v <= anchors[i][0]){
        const [x0, y0] = anchors[i-1], [x1, y1] = anchors[i];
        return y0 + (y1 - y0) * ((v - x0) / (x1 - x0));
      }
    }
    return 1;
  }
  //   SST:   ~2°F/10nm a solid break, ~4 serious, ~8 the Gulf Stream wall itself
  const _SST_EDGE   = [[0,0],[0.5,0.15],[1.0,0.35],[2.0,0.60],[4.0,0.82],[8.0,1.0]];
  //   Chlor: ~0.15 a real color change, ~0.30 a strong front, ~0.60 exceptional
  const _CHLOR_EDGE = [[0,0],[0.04,0.15],[0.08,0.35],[0.15,0.60],[0.30,0.82],[0.60,1.0]];
  function sstEdgeStrength(tBreakPer10nm){ return _ramp(tBreakPer10nm, _SST_EDGE); }
  function chlorEdgeStrength(cBreakPer10nm){ return _ramp(cBreakPer10nm, _CHLOR_EDGE); }

  // CONVERGENCE: reward where BOTH edges are strong at the same place. A product
  // (geometric-style) is deliberate — a strong temp break with no color edge, or
  // vice-versa, should NOT score as a convergence. Only their coincidence does.
  //   conv = sqrt(sstStrength * chlorStrength)   → 0..1
  // sqrt keeps a "both moderate" spot meaningfully rewarded rather than crushed.
  // A small bonus tips spots where both are simultaneously very strong. That
  // bonus takes a share of the REMAINING headroom rather than adding a flat
  // 0.1 — a flat add pushed anything above 0.9 into the 1.0 clamp, which is how
  // distinct spots ended up reported as an identical 100%.
  function convergenceScore(tBreakPer10nm, cBreakPer10nm){
    const s = sstEdgeStrength(tBreakPer10nm);
    const c = chlorEdgeStrength(cBreakPer10nm);
    if (s <= 0 || c <= 0) return 0;          // not a convergence unless BOTH present
    let conv = Math.sqrt(s * c);
    if (s >= 0.7 && c >= 0.7) conv += (1 - conv) * 0.1;   // both strong → tip up
    return Math.max(0, Math.min(1, conv));
  }

  // ── MULTI-SENSOR FRONT FUSION (offshore pelagics) ─────────────────────────
  // SST imagery is frequently cloud-masked and lags 1–3 days. Satellite
  // ALTIMETRY (sea-surface-height gradient) and surface-CURRENT shear see the
  // same Gulf Stream wall / eddy rim through clouds and in real time, so we fold
  // them into the two front factors rather than adding correlated duplicate rows.

  // SSH-anomaly gradient (m per 10 nm) → 0..1 edge strength. Grounded in
  // geostrophy: a ~0.16 m/10nm surface slope ≈ a ~2 kt geostrophic jet (the
  // Gulf Stream wall); eddy rims run ~0.045–0.09 m/10nm.
  const _SSH_EDGE = [[0,0],[0.02,0.15],[0.045,0.35],[0.09,0.60],[0.16,0.82],[0.30,1.0]];
  function sshEdgeStrength(sshPer10nm){ return _ramp(sshPer10nm, _SSH_EDGE); }
  // Surface-current SHEAR (kt per 10 nm) → 0..1. A sharp change in flow speed
  // marks the current edge/drift line where bait and weed stack; a calm interior
  // shows none. Tuned to RTOFS-scale gradients across the Stream wall / eddy rims.
  const _CUR_EDGE = [[0,0],[0.2,0.15],[0.4,0.35],[0.8,0.60],[1.5,0.82],[3.0,1.0]];
  function currentEdgeStrength(shearKtPer10nm){ return _ramp(shearKtPer10nm, _CUR_EDGE); }
  // Fuse the biological convergence (SST edge × chlor edge) with the dynamic
  // front signals (SSH edge, current shear). The biological coincidence is the
  // strongest signal; the dynamic terms CONFIRM it (tip up when they agree) and,
  // when SST/chlor are cloud-masked (bioConv == 0), register a discounted
  // dynamic-only convergence so a real, satellite-confirmed front still scores.
  function frontConvergence(bioConv, sshEdge, curEdge){
    const dyn = Math.max(sshEdge || 0, curEdge || 0);
    if (dyn <= 0) return Math.max(0, Math.min(1, bioConv || 0));
    // Confirmation claims a share of the headroom left above the biological
    // score, so agreement always helps but can never saturate a spot to 100%.
    if (bioConv > 0) return Math.max(0, Math.min(1, bioConv + (1 - bioConv) * 0.15 * dyn));
    return Math.max(0, Math.min(1, 0.6 * dyn));   // dynamic-only, discounted
  }

  // Convenience: compute everything for a point from OCEAN_FIELD samples.
  // radiusNm defaults to ~2.2x the field spacing (same heuristic as the app).
  function analyze(samples, lat, lng, spacingNm){
    const radiusNm = (spacingNm ? spacingNm * 2.2 : 35);
    const tB = sstBreak(samples, lat, lng, radiusNm);
    const cB = chlorBreak(samples, lat, lng, radiusNm);
    return {
      sstBreakPer10nm: tB,
      chlorBreakPer10nm: cB,
      sstStrength: sstEdgeStrength(tB),
      chlorStrength: chlorEdgeStrength(cB),
      convergence: convergenceScore(tB, cB),
    };
  }

  const api = { chlorBreak, sstBreak, sstEdgeStrength, chlorEdgeStrength, convergenceScore, analyze, localGradientPer10nm,
    sshEdgeStrength, currentEdgeStrength, frontConvergence };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BW_BREAKS = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
