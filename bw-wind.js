/* Bluewater Intel — real wind map helpers
   Pure utilities used by the animated wind layer and tests. */
(function (root) {
  const KTS_TO_MPS = 0.514444;

  function finite(n) {
    return typeof n === "number" && isFinite(n);
  }

  function norm360(deg) {
    return ((deg % 360) + 360) % 360;
  }

  function nmBetween(la1, lo1, la2, lo2) {
    const R = 3440.065;
    const toR = (d) => (d * Math.PI) / 180;
    const dLa = toR(la2 - la1);
    const dLo = toR(lo2 - lo1);
    const a = Math.sin(dLa / 2) ** 2
      + Math.cos(toR(la1)) * Math.cos(toR(la2)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function vectorFromObservation(wind) {
    if (!wind) return null;
    if (wind.value == null || wind.dir == null) return null;
    const speedKts = Number(wind.value);
    const dirDeg = Number(wind.dir);
    if (!finite(speedKts) || speedKts < 0 || !finite(dirDeg)) return null;
    const dirFrom = norm360(dirDeg);
    const dirTo = norm360(dirFrom + 180);
    const speedMs = speedKts * KTS_TO_MPS;
    const rad = (dirTo * Math.PI) / 180;
    return {
      u: speedMs * Math.sin(rad),
      v: speedMs * Math.cos(rad),
      speedKts,
      dirDeg: dirFrom,
      observedAtMs: wind.observedAtMs ?? null,
    };
  }

  function sampleVector(sample) {
    if (!sample) return null;
    if (sample.vector) return sample.vector;
    return vectorFromObservation(sample.wind || sample.p?.wind);
  }

  function interpolateWind(samples, lat, lng, maxNm = 600) {
    if (!Array.isArray(samples) || !samples.length) return null;
    let sumW = 0;
    let sumU = 0;
    let sumV = 0;
    let sumSpeed = 0;
    let nearest = null;
    for (const sample of samples) {
      const la = sample.lat ?? sample.la;
      const ln = sample.lng ?? sample.ln;
      const vector = sampleVector(sample);
      if (!finite(la) || !finite(ln) || !vector) continue;
      const d = nmBetween(lat, lng, la, ln);
      if (d > maxNm) continue;
      if (d < 0.05) return { ...vector, sources: 1 };
      const w = 1 / Math.max(1, d * d);
      sumW += w;
      sumU += vector.u * w;
      sumV += vector.v * w;
      sumSpeed += vector.speedKts * w;
      if (!nearest || d < nearest.d) nearest = { d, vector };
    }
    if (!sumW) return null;
    const u = sumU / sumW;
    const v = sumV / sumW;
    const speedKts = sumSpeed / sumW;
    const dirTo = norm360((Math.atan2(u, v) * 180) / Math.PI);
    return {
      u,
      v,
      speedKts,
      dirDeg: norm360(dirTo + 180),
      observedAtMs: nearest?.vector?.observedAtMs ?? null,
      sources: Math.round(sumW),
    };
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Wind-speed color bands (kt). Each band shades light→dark within ONE hue so
  // you read "shades of blue/green/yellow/…" exactly as the marine scale expects:
  //   0-10 blue · 10-15 green · 15-20 yellow · 20-25 orange · 25-30 red · >30 pink
  const WIND_BANDS = [
    { min: 0,  max: 10, lo: [150, 200, 245], hi: [ 38, 120, 205] }, // blue
    { min: 10, max: 15, lo: [120, 225, 140], hi: [ 30, 160,  70] }, // green
    { min: 15, max: 20, lo: [245, 235, 120], hi: [228, 205,  40] }, // yellow
    { min: 20, max: 25, lo: [245, 180,  90], hi: [232, 120,  30] }, // orange
    { min: 25, max: 30, lo: [235,  90,  70], hi: [205,  30,  30] }, // red
    { min: 30, max: 50, lo: [240, 110, 185], hi: [226,  40, 140] }, // pink
  ];

  function colorForSpeed(kts, alphaScale = 1) {
    if (!finite(kts) || kts < 0) return "rgba(0,0,0,0)";
    let b = WIND_BANDS[WIND_BANDS.length - 1];
    for (const cand of WIND_BANDS) { if (kts >= cand.min && kts < cand.max) { b = cand; break; } }
    const t = Math.max(0, Math.min(1, (kts - b.min) / ((b.max - b.min) || 1)));
    const c = b.lo.map((v, i) => Math.round(lerp(v, b.hi[i], t)));
    // Calm (≤5 kt) is faint; opacity ramps up with speed so windy water is bold.
    const a = Math.max(0, Math.min(0.95, (0.18 + (kts / 35) * 0.8) * alphaScale));
    return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
  }

  const api = { KTS_TO_MPS, nmBetween, vectorFromObservation, interpolateWind, colorForSpeed };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BW_WIND = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
