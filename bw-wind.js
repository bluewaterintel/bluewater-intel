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

  // Wind-speed color bands (kt). Each band shades light→dark (or dark→light)
  // within ONE hue family per the marine scale:
  //   0-10  none → blue → light blue
  //   10-15 dark green → light green
  //   15-23 yellow → darker yellow
  //   23-30 light orange → dark orange
  //   30-35 red
  //   35+   pink
  const WIND_BANDS = [
    { min: 0,  max: 10, lo: [ 40, 110, 210], hi: [150, 205, 245] }, // blue → light blue
    { min: 10, max: 15, lo: [ 20, 120,  50], hi: [130, 225, 120] }, // dark green → light green
    { min: 15, max: 23, lo: [235, 230,  80], hi: [200, 175,  25] }, // yellow → darker yellow
    { min: 23, max: 30, lo: [248, 185,  95], hi: [228, 110,  25] }, // light orange → dark orange
    { min: 30, max: 35, lo: [225,  55,  40], hi: [190,  25,  30] }, // red
    { min: 35, max: 55, lo: [240,  95, 175], hi: [228,  40, 140] }, // pink
  ];

  function colorForSpeed(kts, alphaScale = 1) {
    // Truly calm (<2 kt) shows no color.
    if (!finite(kts) || kts < 2) return "rgba(0,0,0,0)";
    let b = WIND_BANDS[WIND_BANDS.length - 1];
    for (const cand of WIND_BANDS) { if (kts >= cand.min && kts < cand.max) { b = cand; break; } }
    const t = Math.max(0, Math.min(1, (kts - b.min) / ((b.max - b.min) || 1)));
    const c = b.lo.map((v, i) => Math.round(lerp(v, b.hi[i], t)));
    // Faint for light wind, ramping bold for strong wind so the band reads clearly.
    const a = Math.max(0, Math.min(0.95, (0.16 + (kts / 35) * 0.8) * alphaScale));
    return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
  }

  const api = { KTS_TO_MPS, nmBetween, vectorFromObservation, interpolateWind, colorForSpeed };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BW_WIND = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
