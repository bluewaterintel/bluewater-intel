/* ============================================================================
   Bluewater Intel — Milestone 4: data freshness + confidence model
   ----------------------------------------------------------------------------
   Pure, dependency-free logic. Runs in the browser (app) AND in tests (Node).
   No synthetic data lives here — this module only REASONS about real data and
   its age. It never invents a value.

   THE MODEL (per product direction):
     • Every real input arrives as { value, observedAt, source } where observedAt
       is the real observation time from the feed (NDBC/ERDDAP/etc).
     • Each variable has freshness tiers tuned to how fast it changes in nature:
         - "fresh"  : recent enough to use silently
         - "aging"  : older, but still physically meaningful → USE IT, but LABEL it
         - "stale"  : too old to trust → DROP it from the algorithm entirely
     • The algorithm ALWAYS returns a best spot from whatever valid inputs remain.
       It never shows a gap.
     • Confidence reflects BOTH coverage (how many inputs present) AND freshness
       (aging inputs contribute less). Dropped/aging inputs are annotated so the
       user understands exactly what pulled confidence down.

   Thresholds are oceanographically motivated and centralised here so they are
   easy to review and tune. Times are in HOURS.
   ============================================================================ */

(function (root) {
  // ── Per-variable freshness thresholds (hours) ──────────────────────────────
  // fresh  : age <= freshH                      → weightFactor 1.0
  // aging  : freshH < age <= staleH             → weightFactor decays 1.0→agingFloor
  // stale  : age > staleH                       → dropped (weightFactor 0)
  //
  // Rationale:
  //  • SST & chlorophyll change slowly; satellite products are often multi-day
  //    composites, so a couple of days old is still informative.
  //  • Wind & waves change fast; a half-day-old reading is nearly useless for
  //    deciding today's run.
  //  • Pressure trend is a slope over ~24h; tolerant but not multi-day.
  //  • Bathymetry is static — never stale.
  const FRESHNESS = {
    sst:        { freshH: 24,  staleH: 72,  agingFloor: 0.6, label: "SST" },
    chlor:      { freshH: 48,  staleH: 168, agingFloor: 0.6, label: "Chlorophyll" }, // 7d composite-friendly
    wind:       { freshH: 3,   staleH: 9,   agingFloor: 0.4, label: "Wind" },
    waves:      { freshH: 3,   staleH: 6,   agingFloor: 0.4, label: "Sea state" },
    waterTemp:  { freshH: 6,   staleH: 24,  agingFloor: 0.5, label: "Water temp (buoy)" },
    pressure:   { freshH: 6,   staleH: 24,  agingFloor: 0.5, label: "Pressure trend" },
    depth:      { freshH: Infinity, staleH: Infinity, agingFloor: 1.0, label: "Depth/structure" }, // static
  };

  // tier + a 0..1 weight factor that decays linearly across the aging band.
  function freshnessOf(variable, observedAtMs, nowMs) {
    const cfg = FRESHNESS[variable];
    if (!cfg) return { tier: "unknown", weightFactor: 1, ageH: null };
    if (observedAtMs == null) return { tier: "missing", weightFactor: 0, ageH: null };
    const ageH = Math.max(0, (nowMs - observedAtMs) / 3600000);
    if (ageH <= cfg.freshH) return { tier: "fresh", weightFactor: 1, ageH };
    if (ageH > cfg.staleH)  return { tier: "stale", weightFactor: 0, ageH };
    // aging: linear decay from 1.0 at freshH down to agingFloor at staleH
    const t = (ageH - cfg.freshH) / (cfg.staleH - cfg.freshH); // 0..1
    const weightFactor = 1 - t * (1 - cfg.agingFloor);
    return { tier: "aging", weightFactor, ageH };
  }

  // ── Confidence + weight redistribution ──────────────────────────────────────
  // Inputs:
  //   factors: [{ key, variable, baseWeight, score (0..1), observedAtMs|null }]
  //            - "variable" maps to FRESHNESS; factors with no env data (solunar,
  //              tide, moon, season) pass variable:null and are always full-weight
  //              (they're computed from date/location, not a feed).
  //   nowMs
  // Returns:
  //   { finalScore (0..1), confidence (0..100), usedFactors, annotations[] }
  //
  // Weight handling: each factor's EFFECTIVE weight = baseWeight * weightFactor.
  // Dropped (stale/missing) env factors contribute 0 and their base weight is
  // redistributed across the surviving factors (so the score stays on 0..1 and
  // isn't artificially depressed just because a feed went down). Confidence,
  // separately, takes the hit.
  function combine(factors, nowMs) {
    const annotations = [];
    const enriched = factors.map((f) => {
      if (!f.variable) return { ...f, tier: "static-or-astro", weightFactor: 1, ageH: null, effWeight: f.baseWeight };
      const fr = freshnessOf(f.variable, f.observedAtMs, nowMs);
      return { ...f, ...fr, effWeight: f.baseWeight * fr.weightFactor };
    });

    const totalEff = enriched.reduce((s, f) => s + f.effWeight, 0) || 1;

    // Score = effective-weighted mean of factor scores (renormalised to survivors)
    const finalScore = enriched.reduce((s, f) => s + f.score * (f.effWeight / totalEff), 0);

    // ── Confidence ────────────────────────────────────────────────────────────
    // Start from coverage: fraction of intended ENV weight that survived fresh.
    const envFactors = enriched.filter((f) => f.variable);
    const intendedEnvWeight = envFactors.reduce((s, f) => s + f.baseWeight, 0) || 1;
    const survivingEnvWeight = envFactors.reduce((s, f) => s + f.effWeight, 0);
    const coverage = survivingEnvWeight / intendedEnvWeight; // 0..1

    // Signal strength: how many surviving factors actually scored strong.
    const strong = enriched.filter((f) => f.effWeight > 0 && f.score > 0.7).length;
    const strongBonus = Math.min(0.25, strong * 0.04);

    // Confidence band: coverage dominates, signal adds a little. Floor is low (not
    // zero) because we still return a real structure/season-based pick.
    let confidence = Math.round(Math.max(10, Math.min(95, (coverage * 0.75 + strongBonus) * 100)));

    // ── Annotations: explain exactly what hurt confidence ──────────────────────
    for (const f of envFactors) {
      if (f.tier === "stale" || f.tier === "missing") {
        const pctPts = Math.round((f.baseWeight / intendedEnvWeight) * 75);
        annotations.push({
          variable: f.variable, label: FRESHNESS[f.variable]?.label || f.variable,
          tier: f.tier,
          message: f.tier === "missing"
            ? `${FRESHNESS[f.variable]?.label || f.variable} unavailable — excluded (−${pctPts}% confidence)`
            : `${FRESHNESS[f.variable]?.label || f.variable} too old (>${FRESHNESS[f.variable].staleH}h) — excluded (−${pctPts}% confidence)`,
          ageH: f.ageH == null ? null : Math.round(f.ageH),
        });
      } else if (f.tier === "aging") {
        const lostPts = Math.round(((f.baseWeight * (1 - f.weightFactor)) / intendedEnvWeight) * 75);
        annotations.push({
          variable: f.variable, label: FRESHNESS[f.variable]?.label || f.variable,
          tier: "aging",
          message: `${FRESHNESS[f.variable]?.label || f.variable} aging (${Math.round(f.ageH)}h old) — reduced weight${lostPts ? ` (−${lostPts}% confidence)` : ""}`,
          ageH: Math.round(f.ageH),
        });
      }
    }

    return {
      finalScore: Math.max(0, Math.min(1, finalScore)),
      confidence,
      usedFactors: enriched.filter((f) => f.effWeight > 0),
      droppedFactors: enriched.filter((f) => f.variable && f.effWeight === 0),
      annotations,
      coverage,
    };
  }

  const api = { FRESHNESS, freshnessOf, combine };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BW_FRESHNESS = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
