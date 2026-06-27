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

  // Generic max-gradient over a set of {la,ln,v} samples within radiusNm of a
  // point. Returns gradient in <unit> per 10 nm. Mirrors thermalBreakReal.
  function maxGradientPer10nm(samples, lat, lng, radiusNm){
    const near = [];
    for (const s of samples){
      if (s.v == null) continue;
      const d = _nm(lat, lng, s.la, s.ln);
      if (d <= radiusNm) near.push(s);
    }
    if (near.length < 2) return 0;
    let maxGrad = 0; // per nm
    for (let i = 0; i < near.length; i++){
      for (let j = i+1; j < near.length; j++){
        const dNm = _nm(near[i].la, near[i].ln, near[j].la, near[j].ln);
        if (dNm < 1) continue;
        const g = Math.abs(near[i].v - near[j].v) / dNm;
        if (g > maxGrad) maxGrad = g;
      }
    }
    return maxGrad * 10;
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

  // Chlorophyll break = strongest chlorophyll gradient near a point, mg/m³ /10nm.
  function chlorBreak(samples, lat, lng, radiusNm){
    return maxGradientPer10nm(extract(samples, "chlor"), lat, lng, radiusNm);
  }
  // SST break (provided for parity / tests; the app already has thermalBreakReal).
  function sstBreak(samples, lat, lng, radiusNm){
    return maxGradientPer10nm(extract(samples, "sst"), lat, lng, radiusNm);
  }

  // Normalize each break to 0..1 "edge strength" using thresholds tuned to what
  // matters on the water. These mirror the app's existing breakScore tiers for
  // SST, and use sensible chlorophyll-front thresholds.
  //   SST:   ~4°F/10nm = a serious break (1.0);  ~1°F/10nm = weak (≈0.25)
  //   Chlor: ~0.30 mg/m³/10nm = a strong color front (1.0); ~0.08 = weak
  function sstEdgeStrength(tBreakPer10nm){
    const t = tBreakPer10nm;
    if (t >= 4.0) return 1.0;
    if (t >= 2.0) return 0.7;
    if (t >= 1.0) return 0.4;
    if (t >= 0.5) return 0.2;
    return 0.0;
  }
  function chlorEdgeStrength(cBreakPer10nm){
    const c = cBreakPer10nm;
    if (c >= 0.30) return 1.0;
    if (c >= 0.15) return 0.7;
    if (c >= 0.08) return 0.4;
    if (c >= 0.04) return 0.2;
    return 0.0;
  }

  // CONVERGENCE: reward where BOTH edges are strong at the same place. A product
  // (geometric-style) is deliberate — a strong temp break with no color edge, or
  // vice-versa, should NOT score as a convergence. Only their coincidence does.
  //   conv = sqrt(sstStrength * chlorStrength)   → 0..1
  // sqrt keeps a "both moderate" spot meaningfully rewarded rather than crushed.
  // A small bonus tips spots where both are simultaneously very strong.
  function convergenceScore(tBreakPer10nm, cBreakPer10nm){
    const s = sstEdgeStrength(tBreakPer10nm);
    const c = chlorEdgeStrength(cBreakPer10nm);
    if (s <= 0 || c <= 0) return 0;          // not a convergence unless BOTH present
    let conv = Math.sqrt(s * c);
    if (s >= 0.7 && c >= 0.7) conv = Math.min(1, conv + 0.1); // both strong → tip up
    return Math.max(0, Math.min(1, conv));
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

  const api = { chlorBreak, sstBreak, sstEdgeStrength, chlorEdgeStrength, convergenceScore, analyze, maxGradientPer10nm };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BW_BREAKS = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
