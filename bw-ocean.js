/* Bluewater Intel — Milestone 4: ocean data source (real feeds via Edge Function) */
(function (root) {
  const cfg = root.BW_SUPABASE_CONFIG || root.BW_DATA_CONFIG || {};
  const BASE = (cfg.supabaseUrl || cfg.url || "").replace(/\/$/, "");
  const ANON = cfg.supabaseAnonKey || cfg.anonKey || "";
  const cache = new Map();
  const TTL = 20 * 60 * 1000;
  const keyOf = (lat, lng) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

  async function fetchOcean(lat, lng) {
    const k = keyOf(lat, lng);
    const hit = cache.get(k);
    if (hit && Date.now() - hit.atMs < TTL) return { ...hit.payload, _cache: "fresh-cache" };
    try {
      const res = await fetch(`${BASE}/functions/v1/ocean?lat=${lat}&lng=${lng}`, {
        headers: ANON ? { apikey: ANON, Authorization: `Bearer ${ANON}` } : {},
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`ocean ${res.status}`);
      const payload = await res.json();
      cache.set(k, { payload, atMs: Date.now() });
      return payload;
    } catch (e) {
      if (hit) return { ...hit.payload, _cache: "stale-cache" };
      return {
        point: { lat, lng }, fetchedAtMs: Date.now(),
        sst: { value: null, observedAtMs: null },
        chlor: { value: null, observedAtMs: null },
        wind: { value: null, observedAtMs: null },
        waves: { value: null, observedAtMs: null },
        waterTemp: { value: null, observedAtMs: null },
        pressure: { value: null, observedAtMs: null },
        sources: {}, _cache: "unavailable",
      };
    }
  }

  root.BW_OCEAN = { fetchOcean };
})(typeof globalThis !== "undefined" ? globalThis : this);
