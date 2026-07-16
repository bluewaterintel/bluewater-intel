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

  function fetchTimeout(ms) {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      return AbortSignal.timeout(ms);
    }
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  }

  async function fetchWithRetry(url, opts, retries = 2) {
    let lastErr = null;
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(url, opts);
        return res;
      } catch (e) {
        lastErr = e;
        if (i < retries) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    throw lastErr;
  }

  function normalizeHours(v) {
    const h = Number(v);
    if (!isFinite(h) || h <= 0) return 0;
    return Math.round(Math.min(96, h) / 3) * 3;
  }

  // Ocean-model forecast (SST/SSH for bite map) — capped at +24 h in 12 h steps.
  function normalizeOceanHours(v) {
    const h = Number(v);
    if (!isFinite(h) || h <= 0) return 0;
    const r = Math.max(0, Math.min(24, Math.round(h)));
    if (r <= 6) return 0;
    if (r <= 18) return 12;
    return 24;
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
  const FORECAST_FIELDS = new Set(["wind", "waves", "waterTemp", "airTemp", "pressure", "barometer", "tide"]);
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
    const doFetch = async (fetchOpts) => {
      const fk = keyOf(lat, lng, fetchOpts);
      const fhit = fetchOpts === opts ? hit : cache.get(fk);
      const timeoutMs = fetchOpts.mode === "conditions" ? 15000 : 45000;
      const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
      if (fetchOpts.mode) params.set("mode", fetchOpts.mode);
      if (fetchOpts.hours > 0) params.set("hours", String(fetchOpts.hours));
      const res = await fetchWithRetry(`${BASE}/functions/v1/ocean?${params.toString()}`, {
        headers: ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
        signal: fetchTimeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`ocean ${res.status}`);
      const payload = await res.json();
      cache.set(fk, { payload, atMs: Date.now() });
      return mergeBestAvailable(fk, payload, fetchOpts);
    };
    try {
      return await doFetch(opts);
    } catch (e) {
      // Pre-deploy servers ignore mode=conditions and still run the slow full
      // assembly (~25s). Fall back once to the default ocean call with a longer
      // timeout so the header isn't left blank.
      if (opts.mode === "conditions") {
        try {
          const fallback = await doFetch({ hours: opts.hours });
          cache.set(k, { payload: fallback, atMs: Date.now() });
          return mergeBestAvailable(k, fallback, opts);
        } catch (e2) { /* fall through to stale / empty */ }
      }
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
        current: null,
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
      const res = await fetchWithRetry(`${BASE}/functions/v1/ocean?${params.toString()}`, {
        headers: ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
        signal: fetchTimeout(15000),
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
      const res = await fetchWithRetry(`${BASE}/functions/v1/ocean?${params.toString()}`, {
        headers: ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
        signal: fetchTimeout(22000),
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

  function predictInputsUsable(data) {
    if (!data || !Array.isArray(data.field) || !data.field.length) return false;
    const sstRows = Array.isArray(data.sst?.rows) ? data.sst.rows.filter((r) => r && r[2] != null).length : 0;
    const windPts = data.field.filter((f) => f?.p?.wind?.value != null).length;
    // Need both the SST grid and buoy/model wind field — without these the bite
    // map reads 99% from depth/season alone (exactly the "all unavailable" bug).
    return sstRows > 0 && windPts > 0;
  }

  const predictInputsCache = new Map();
  function clearPredictInputsCache() { predictInputsCache.clear(); }

  async function fetchPredictInputs(latMin, latMax, lngMin, lngMax, maxPoints, forecastHour = 0) {
    const hours = normalizeOceanHours(forecastHour);
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
      const res = await fetchWithRetry(`${BASE}/functions/v1/ocean?${params.toString()}`, {
        headers: ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
        signal: fetchTimeout(50000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      // Keep the payload when bathy/SST grids are present even if the wind field
      // is thin — buildPredictInputs applies partial data instead of depth-only scoring.
      const hasBathy = Array.isArray(data?.bathy?.rows) && data.bathy.rows.length > 0;
      const hasSst = Array.isArray(data?.sst?.rows) && data.sst.rows.filter((r) => r && r[2] != null).length > 0;
      if (!predictInputsUsable(data) && !hasBathy && !hasSst) return null;
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
      const res = await fetchWithRetry(`${BASE}/functions/v1/ocean?${params.toString()}`, {
        headers: ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
        signal: fetchTimeout(20000),
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

  const currentGridCache = new Map();
  async function fetchCurrentGrid(latMin, latMax, lngMin, lngMax, hours = 0) {
    const h = normalizeOceanHours(hours);
    const k = `${latMin.toFixed(2)},${latMax.toFixed(2)},${lngMin.toFixed(2)},${lngMax.toFixed(2)},${h}`;
    const hit = currentGridCache.get(k);
    if (hit && Date.now() - hit.atMs < 2 * 60 * 60 * 1000) return hit.data;
    try {
      const params = new URLSearchParams({
        mode: "currentgrid",
        latMin: String(latMin), latMax: String(latMax),
        lngMin: String(lngMin), lngMax: String(lngMax),
      });
      if (h > 0) params.set("hours", String(h));
      const res = await fetchWithRetry(`${BASE}/functions/v1/ocean?${params.toString()}`, {
        headers: ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
        signal: fetchTimeout(30000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !Array.isArray(data.u) || !Array.isArray(data.v) || !data.nLat || !data.nLng) return null;
      currentGridCache.set(k, { data, atMs: Date.now() });
      return data;
    } catch (e) {
      return null;
    }
  }

  const altimetryGridCache = new Map();
  async function fetchAltimetryGrid(latMin, latMax, lngMin, lngMax, daysBack = 0, hours = 0) {
    const fh = normalizeOceanHours(hours);
    const back = Math.max(0, Math.min(6, daysBack | 0));
    const k = `${latMin.toFixed(2)},${latMax.toFixed(2)},${lngMin.toFixed(2)},${lngMax.toFixed(2)}:${back}:${fh}`;
    const hit = altimetryGridCache.get(k);
    if (hit && Date.now() - hit.atMs < 6 * 60 * 60 * 1000) return hit.data;
    try {
      const params = new URLSearchParams({
        mode: "altimetrygrid",
        latMin: String(latMin), latMax: String(latMax),
        lngMin: String(lngMin), lngMax: String(lngMax),
      });
      if (fh > 0) params.set("hours", String(fh));
      else params.set("daysBack", String(back));
      const res = await fetchWithRetry(`${BASE}/functions/v1/ocean?${params.toString()}`, {
        headers: ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
        signal: fetchTimeout(20000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !Array.isArray(data.rows) || !data.rows.length) return null;
      altimetryGridCache.set(k, { data, atMs: Date.now() });
      return data;
    } catch (e) {
      return null;
    }
  }

  const sstGridCache = new Map();
  async function fetchSstGrid(latMin, latMax, lngMin, lngMax, hours = 0) {
    const fh = normalizeOceanHours(hours);
    const k = `${latMin.toFixed(2)},${latMax.toFixed(2)},${lngMin.toFixed(2)},${lngMax.toFixed(2)}:${fh}`;
    const hit = sstGridCache.get(k);
    if (hit && Date.now() - hit.atMs < 2 * 60 * 60 * 1000) return hit.data;
    try {
      const params = new URLSearchParams({
        mode: "sstgrid",
        latMin: String(latMin), latMax: String(latMax),
        lngMin: String(lngMin), lngMax: String(lngMax),
        hours: String(fh),
      });
      const res = await fetchWithRetry(`${BASE}/functions/v1/ocean?${params.toString()}`, {
        headers: ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
        signal: fetchTimeout(30000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !Array.isArray(data.rows) || !data.rows.length) return null;
      sstGridCache.set(k, { data, atMs: Date.now() });
      return data;
    } catch (e) {
      return null;
    }
  }

  root.BW_OCEAN = {
    fetchOcean, fetchBathy, fetchChlorGrid, fetchPredictInputs, clearPredictInputsCache,
    fetchWindGrid, fetchCurrentGrid, fetchAltimetryGrid, fetchSstGrid,
    // After deploying the ocean edge function, pass { mode: "conditions" } for
    // fast header / tide-station resolution (~3–8 s vs 25 s+ full assembly).
    fetchConditions: (lat, lng, hours = 0) => fetchOcean(lat, lng, { mode: "conditions", hours }),
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
