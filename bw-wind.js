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

  // Continuous wind-speed color ramp (kt → rgb). One smooth stop list so colors
  // blend cleanly across the whole range. Each hue holds across its band and then
  // cross-fades to the next over ~1 kt (the paired stops 1 kt apart):
  //   0-10 blue → light blue · 10 dark green · 15 light green · 16 yellow
  //   23 dark yellow · 24 light orange · 30 dark orange · 31-35 red · 36+ pink
  const WIND_STOPS = [
    [0,  [ 30,  95, 215]], // blue
    [9,  [115, 180, 250]], // light blue (kept clearly blue, not teal)
    [10, [ 20, 120,  50]], // dark green (green starts at 10 kt)
    [15, [130, 225, 120]], // light green
    [16, [235, 230,  80]], // yellow
    [23, [200, 175,  25]], // darker yellow
    [24, [248, 185,  95]], // light orange
    [30, [228, 110,  25]], // dark orange
    [31, [220,  50,  40]], // red
    [35, [185,  25,  30]], // deep red
    [36, [240,  95, 175]], // pink
    [45, [228,  40, 140]], // deep pink
  ];

  function windRGB(kts) {
    const s = WIND_STOPS;
    if (kts <= s[0][0]) return s[0][1].slice();
    for (let i = 0; i < s.length - 1; i++) {
      if (kts >= s[i][0] && kts <= s[i + 1][0]) {
        const t = (kts - s[i][0]) / ((s[i + 1][0] - s[i][0]) || 1);
        return s[i][1].map((v, k) => Math.round(lerp(v, s[i + 1][1][k], t)));
      }
    }
    return s[s.length - 1][1].slice();
  }

  function colorForSpeed(kts, alphaScale = 1) {
    // Truly calm (<2 kt) shows no color.
    if (!finite(kts) || kts < 2) return "rgba(0,0,0,0)";
    const c = windRGB(kts);
    // Faint for light wind, ramping bold for strong wind so the speed reads clearly.
    const a = Math.max(0, Math.min(0.95, (0.16 + (kts / 35) * 0.8) * alphaScale));
    return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
  }

  // Solid (opaque) ramp color for the legend bar, so the legend always matches
  // the map colors exactly.
  function legendColor(kts) {
    const c = windRGB(kts);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  // CSS linear-gradient string for a 0..maxKt legend, sampled from the same ramp.
  function legendGradient(maxKt) {
    const mx = maxKt || 40;
    const stops = [];
    // Sample at 1-kt resolution so each hue holds across its band and only the
    // intended ~1-kt cross-fades (e.g. blue→green right at 10 kt) show blending.
    for (let k = 0; k <= mx; k += 1) {
      stops.push(`${legendColor(k)} ${((k / mx) * 100).toFixed(2)}%`);
    }
    return `linear-gradient(90deg, ${stops.join(",")})`;
  }

  const api = { KTS_TO_MPS, nmBetween, vectorFromObservation, interpolateWind, colorForSpeed, legendColor, legendGradient };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BW_WIND = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
