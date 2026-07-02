/* Bluewater Intel — Milestone 4: ocean data source (real feeds via Edge Function) */
(function (root) {
  const cfgCandidates = [root.BW_SUPABASE_CONFIG, root.BW_DATA_CONFIG].filter(Boolean);
  const cfg = cfgCandidates.find((c) => c.supabaseUrl || c.url) || {};
  const configuredBase = (cfg.supabaseUrl || cfg.url || "").replace(/\/$/, "");
  const BASE = (!configuredBase || configuredBase.includes("YOURPROJECT"))
    ? "https://mealpzwbjamkjdrsszqe.supabase.co"
    : configuredBase;
  const ANON = cfg.supabaseAnonKey || cfg.anonKey || "";
  const cache = new Map();
  const TTL = 20 * 60 * 1000;

  function normalizeHours(v) {
    const h = Number(v);
    if (!isFinite(h) || h <= 0) return 0;
    return Math.round(Math.min(96, h) / 3) * 3;
  }

  function parseFetchOpts(forecastHourOrOpts) {
    if (typeof forecastHourOrOpts === "object" && forecastHourOrOpts !== null) {
      return {
        mode: forecastHourOrOpts.mode,
        hours: normalizeHours(forecastHourOrOpts.hours ?? 0),
      };
    }
    return { hours: normalizeHours(forecastHourOrOpts) };
  }

  const keyOf = (lat, lng, opts = {}) =>
    `${lat.toFixed(2)},${lng.toFixed(2)},${opts.mode || "ocean"},${opts.hours ?? 0}`;

  // ── Last-known-good (best available REAL data) ─────────────────────────────
  const FIELDS = ["sst", "chlor", "wind", "waves", "waterTemp", "airTemp", "pressure", "barometer", "tide"];
  const FORECAST_FIELDS = new Set(["wind", "waves", "waterTemp", "airTemp", "pressure", "barometer"]);
  const lastGood = new Map();

  function mergeBestAvailable(k, payload, opts = {}) {
    if (!payload) return payload;
    const forecast = (opts.hours ?? 0) > 0;
    const store = lastGood.get(k) || {};
    let usedFallback = false;
    for (const f of FIELDS) {
      const cur = payload[f];
      if (cur && cur.value != null) {
        store[f] = { ...cur };
      } else if (!forecast && store[f] && store[f].value != null) {
        payload[f] = { ...store[f], _stale: true };
        usedFallback = true;
      } else if (forecast && FORECAST_FIELDS.has(f)) {
        // Never back-fill forecast slots with stale current observations.
        payload[f] = cur ?? { value: null, observedAtMs: null };
      }
    }
    lastGood.set(k, store);
    if (usedFallback && !payload._cache) payload._cache = "last-known-good";
    return payload;
  }

  async function fetchOcean(lat, lng, forecastHourOrOpts = 0) {
    const opts = parseFetchOpts(forecastHourOrOpts);
    const k = keyOf(lat, lng, opts);
    const hit = cache.get(k);
    if (hit && Date.now() - hit.atMs < TTL) return mergeBestAvailable(k, { ...hit.payload, _cache: "fresh-cache" }, opts);
    try {
      const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
      if (opts.mode) params.set("mode", opts.mode);
      if (opts.hours > 0) params.set("hours", String(opts.hours));
      const res = await fetch(`${BASE}/functions/v1/ocean?${params.toString()}`, {
        headers: ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`ocean ${res.status}`);
      const payload = await res.json();
      cache.set(k, { payload, atMs: Date.now() });
      return mergeBestAvailable(k, payload, opts);
    } catch (e) {
      if (hit) return mergeBestAvailable(k, { ...hit.payload, _cache: "stale-cache" }, opts);
      return mergeBestAvailable(k, {
        point: { lat, lng }, fetchedAtMs: Date.now(),
        ...(opts.hours > 0 ? { forecastHour: opts.hours } : {}),
        sst: { value: null, observedAtMs: null },
        chlor: { value: null, observedAtMs: null },
        wind: { value: null, observedAtMs: null },
        waves: { value: null, observedAtMs: null },
        waterTemp: { value: null, observedAtMs: null },
        airTemp: { value: null, observedAtMs: null },
        pressure: { value: null, observedAtMs: null },
        barometer: { value: null, observedAtMs: null },
        sources: {}, _cache: "unavailable",
      }, opts);
    }
  }

  const bathyCache = new Map();
  async function fetchBathy(latMin, latMax, lngMin, lngMax) {
    const k = `${latMin.toFixed(2)},${latMax.toFixed(2)},${lngMin.toFixed(2)},${lngMax.toFixed(2)}`;
    const hit = bathyCache.get(k);
    if (hit) return hit;
    try {
      const params = new URLSearchParams({
        mode: "bathy",
        latMin: String(latMin), latMax: String(latMax),
        lngMin: String(lngMin), lngMax: String(lngMax),
      });
      const res = await fetch(`${BASE}/functions/v1/ocean?${params.toString()}`, {
        headers: ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !Array.isArray(data.rows) || !data.rows.length) return null;
      bathyCache.set(k, data);
      return data;
    } catch (e) {
      return null;
    }
  }

  const chlorGridCache = new Map();
  async function fetchChlorGrid(latMin, latMax, lngMin, lngMax) {
    const k = `${latMin.toFixed(2)},${latMax.toFixed(2)},${lngMin.toFixed(2)},${lngMax.toFixed(2)}`;
    const hit = chlorGridCache.get(k);
    if (hit) return hit;
    try {
      const params = new URLSearchParams({
        mode: "chlorgrid",
        latMin: String(latMin), latMax: String(latMax),
        lngMin: String(lngMin), lngMax: String(lngMax),
      });
      const res = await fetch(`${BASE}/functions/v1/ocean?${params.toString()}`, {
        headers: ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
        signal: AbortSignal.timeout(22000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !Array.isArray(data.rows) || !data.rows.length) return null;
      chlorGridCache.set(k, data);
      return data;
    } catch (e) {
      return null;
    }
  }

  const predictInputsCache = new Map();
  async function fetchPredictInputs(latMin, latMax, lngMin, lngMax, maxPoints, forecastHour = 0) {
    const hours = normalizeHours(forecastHour);
    const k = `${latMin.toFixed(2)},${latMax.toFixed(2)},${lngMin.toFixed(2)},${lngMax.toFixed(2)},${maxPoints || 90},${hours}`;
    const hit = predictInputsCache.get(k);
    if (hit) return hit;
    try {
      const params = new URLSearchParams({
        mode: "predictinputs",
        latMin: String(latMin), latMax: String(latMax),
        lngMin: String(lngMin), lngMax: String(lngMax),
        maxPoints: String(maxPoints || 90),
      });
      if (hours > 0) params.set("hours", String(hours));
      const res = await fetch(`${BASE}/functions/v1/ocean?${params.toString()}`, {
        headers: ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
        signal: AbortSignal.timeout(35000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !Array.isArray(data.field)) return null;
      predictInputsCache.set(k, data);
      return data;
    } catch (e) {
      return null;
    }
  }

  const windGridCache = new Map();
  async function fetchWindGrid(latMin, latMax, lngMin, lngMax, hours) {
    const h = normalizeHours(hours);
    const k = `${latMin.toFixed(2)},${latMax.toFixed(2)},${lngMin.toFixed(2)},${lngMax.toFixed(2)},${h}`;
    const hit = windGridCache.get(k);
    if (hit && Date.now() - hit.atMs < 20 * 60 * 1000) return hit.data;
    try {
      const params = new URLSearchParams({
        mode: "windgrid",
        latMin: String(latMin), latMax: String(latMax),
        lngMin: String(lngMin), lngMax: String(lngMax),
        hours: String(h),
      });
      const res = await fetch(`${BASE}/functions/v1/ocean?${params.toString()}`, {
        headers: ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !Array.isArray(data.rows) || !data.rows.length) return null;
      windGridCache.set(k, { data, atMs: Date.now() });
      return data;
    } catch (e) {
      return null;
    }
  }

  root.BW_OCEAN = { fetchOcean, fetchBathy, fetchChlorGrid, fetchPredictInputs, fetchWindGrid };
})(typeof globalThis !== "undefined" ? globalThis : this);
