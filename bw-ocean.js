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
  const keyOf = (lat, lng, opts = {}) => `${lat.toFixed(2)},${lng.toFixed(2)},${opts.mode || "ocean"},${opts.hours ?? 0}`;

  // ── Last-known-good (best available REAL data) ─────────────────────────────
  // GOVERNING PRINCIPLE: real data or an honest absence — never synthetic. The
  // backend already returns the most recent cloud-free observation per pixel, but
  // a field can still come back null (a transient request failure, or a pixel that
  // has been clouded for the whole lookback window). Rather than let the algorithm
  // drop that variable to zero, we remember the last REAL value we ever received
  // for each point+field and reuse it when the current response has none. The value
  // keeps its ORIGINAL observedAt, so the freshness model ages/labels it honestly
  // and confidence reflects the staleness. We never invent a number; we only ever
  // reuse one that was actually measured.
  const FIELDS = ["sst", "chlor", "wind", "waves", "waterTemp", "airTemp", "pressure", "barometer", "tide"];
  const lastGood = new Map(); // key -> { field: {value, observedAtMs, ...} }

  function mergeBestAvailable(k, payload) {
    if (!payload) return payload;
    const store = lastGood.get(k) || {};
    let usedFallback = false;
    for (const f of FIELDS) {
      const cur = payload[f];
      if (cur && cur.value != null) {
        store[f] = { ...cur };                 // remember this real observation
      } else if (store[f] && store[f].value != null) {
        payload[f] = { ...store[f], _stale: true }; // reuse last real value (honestly aged)
        usedFallback = true;
      }
    }
    lastGood.set(k, store);
    if (usedFallback && !payload._cache) payload._cache = "last-known-good";
    return payload;
  }

  async function fetchOcean(lat, lng, opts = {}) {
    const k = keyOf(lat, lng, opts);
    const hit = cache.get(k);
    if (hit && Date.now() - hit.atMs < TTL) return mergeBestAvailable(k, { ...hit.payload, _cache: "fresh-cache" });
    try {
      const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
      if (opts.mode) params.set("mode", opts.mode);
      if (opts.hours != null) params.set("hours", String(opts.hours));
      const res = await fetch(`${BASE}/functions/v1/ocean?${params.toString()}`, {
        headers: ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`ocean ${res.status}`);
      const payload = await res.json();
      cache.set(k, { payload, atMs: Date.now() });
      return mergeBestAvailable(k, payload);
    } catch (e) {
      if (hit) return mergeBestAvailable(k, { ...hit.payload, _cache: "stale-cache" });
      return mergeBestAvailable(k, {
        point: { lat, lng }, fetchedAtMs: Date.now(),
        sst: { value: null, observedAtMs: null },
        chlor: { value: null, observedAtMs: null },
        wind: { value: null, observedAtMs: null },
        waves: { value: null, observedAtMs: null },
        waterTemp: { value: null, observedAtMs: null },
        airTemp: { value: null, observedAtMs: null },
        pressure: { value: null, observedAtMs: null },
        barometer: { value: null, observedAtMs: null },
        sources: {}, _cache: "unavailable",
      });
    }
  }

  root.BW_OCEAN = { fetchOcean };
})(typeof globalThis !== "undefined" ? globalThis : this);
