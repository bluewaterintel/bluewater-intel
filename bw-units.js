// Bluewater Intel — display units (depth + distance). Internal math stays m / nm.
(function (root) {
  const NM_TO_STATUTE_MI = 1.15078;
  const M_PER_FATHOM = 1.8288;
  const FT_PER_M = 3.280839895;

  function normalizeDepthUnit(unit) {
    return unit === "fathoms" ? "fathoms" : "feet";
  }

  function normalizeDistanceUnit(unit) {
    return unit === "sm" || unit === "mi" || unit === "statute" ? "sm" : "nm";
  }

  function roundDisplay(n, decimals) {
    if (!isFinite(n)) return "—";
    if (n >= 100) return String(Math.round(n));
    const d = decimals != null ? decimals : (n >= 10 ? 0 : 1);
    const s = n.toFixed(d);
    return d > 0 ? s.replace(/\.0$/, "") : s;
  }

  function distanceSuffix(unit) {
    return normalizeDistanceUnit(unit) === "sm" ? "mi" : "nm";
  }

  /** Format great-circle distance already in nautical miles. */
  function formatDistanceNm(nm, unit) {
    if (nm == null || !isFinite(nm)) return "—";
    const u = normalizeDistanceUnit(unit);
    if (u === "sm") {
      const mi = nm * NM_TO_STATUTE_MI;
      return `${roundDisplay(mi, 1)} mi`;
    }
    return `${roundDisplay(nm, 1)} nm`;
  }

  function formatDistanceNmParts(nm, unit) {
    if (nm == null || !isFinite(nm)) return { value: null, suffix: distanceSuffix(unit) };
    const u = normalizeDistanceUnit(unit);
    if (u === "sm") {
      return { value: roundDisplay(nm * NM_TO_STATUTE_MI, 1), suffix: "mi" };
    }
    return { value: roundDisplay(nm, 1), suffix: "nm" };
  }

  function formatDepthFromMeters(m, unit) {
    if (m == null || !isFinite(m) || m <= 0) return "—";
    const u = normalizeDepthUnit(unit);
    if (u === "fathoms") {
      const fm = m / M_PER_FATHOM;
      return `${roundDisplay(fm, fm >= 10 ? 0 : 1)} fm`;
    }
    const ft = m * FT_PER_M;
    return `${roundDisplay(ft, ft >= 10 ? 0 : 1)} ft`;
  }

  function formatDepthFromFeet(ft, unit) {
    if (ft == null || !isFinite(ft) || ft <= 0) return "—";
    return formatDepthFromMeters(ft / FT_PER_M, unit);
  }

  root.BW_UNITS = {
    NM_TO_STATUTE_MI,
    M_PER_FATHOM,
    FT_PER_M,
    normalizeDepthUnit,
    normalizeDistanceUnit,
    distanceSuffix,
    formatDistanceNm,
    formatDistanceNmParts,
    formatDepthFromMeters,
    formatDepthFromFeet,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
