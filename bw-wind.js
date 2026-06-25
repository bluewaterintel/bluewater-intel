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

  function interpolateWind(samples, lat, lng, maxNm = 220) {
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

  function colorForSpeed(kts, alphaScale = 1) {
    if (!finite(kts) || kts < 5) return "rgba(0,0,0,0)";
    const stops = [
      [5, [38, 139, 192], 0.10],
      [10, [63, 194, 120], 0.18],
      [15, [232, 214, 90], 0.28],
      [22, [232, 133, 46], 0.40],
      [30, [200, 53, 32], 0.52],
      [45, [145, 32, 82], 0.62],
    ];
    let lo = stops[0];
    let hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (kts >= stops[i][0] && kts <= stops[i + 1][0]) {
        lo = stops[i];
        hi = stops[i + 1];
        break;
      }
    }
    const t = Math.max(0, Math.min(1, (kts - lo[0]) / ((hi[0] - lo[0]) || 1)));
    const c = lo[1].map((v, i) => Math.round(lerp(v, hi[1][i], t)));
    const a = Math.max(0, Math.min(0.75, lerp(lo[2], hi[2], t) * alphaScale));
    return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
  }

  const api = { KTS_TO_MPS, nmBetween, vectorFromObservation, interpolateWind, colorForSpeed };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BW_WIND = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
