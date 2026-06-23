/* ============================================================================
   Bluewater Intel — Milestone 1 client wiring: waypoint/ramp DataSource
   ----------------------------------------------------------------------------
   Drop this <script> BEFORE the main app script. It introduces a thin data
   layer (window.BW_DATA) that the app's waypoint/ramp accessors call instead of
   reading the inlined window.BW_WAYPOINTS / window.BW_RAMPS directly.

   GOVERNING PRINCIPLE — real data or an honest absence of data:
     • ONLINE  → query Supabase PostGIS (ST_DWithin) for points within N nm of
                 the active port. This is the source of truth.
     • CACHED  → if a query fails but we have a prior successful result for the
                 SAME (port, radius, types), reuse it and LABEL it as cached so
                 the user knows it may be stale.
     • OFFLINE → if there is no cache and no network, WITHHOLD and label. We do
                 NOT fabricate and we do NOT silently show nothing with no signal.

   OFFLINE FALLBACK MODE (BW_DATA_CONFIG.embeddedFallback):
     • false (DEFAULT, recommended for the website / always-connected use):
         remove the inlined BW_WAYPOINTS/BW_RAMPS from the HTML entirely. The app
         is backend-backed; offline shows the withhold-and-label state.
     • true (recommended for the native iOS/Android apps, which must work at sea
         with no signal): keep the inlined dataset as a DELIBERATE on-device cache.
         On query failure the app falls back to the embedded data and labels it
         "offline data". This is the ONE honest use of the embedded blob — it is
         real, static reference geography, clearly labeled when used offline.

   Either way, the prediction engine and AI brief are untouched by this milestone.
   ============================================================================ */

// Config is injected by bw-config.js (generated from .env). Fallback for local file:// preview.
window.BW_DATA_CONFIG = window.BW_DATA_CONFIG || {
  supabaseUrl:  "https://YOURPROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_KEY",
  embeddedFallback: false,
  queryTimeoutMs: 8000,
};

(function () {
  const cfg = window.BW_DATA_CONFIG;

  // Last-good cache keyed by port+radius+types, plus a freshness flag the UI reads.
  const cache = new Map();
  const keyOf = (lat, lng, nm, types) =>
    `${lat.toFixed(4)},${lng.toFixed(4)},${nm},${types ? [...types].sort().join("|") : "*"}`;

  // status: "live" | "cached" | "offline-embedded" | "unavailable"
  let lastStatus = "unavailable";
  const setStatus = (s) => { lastStatus = s; window.dispatchEvent(new CustomEvent("bw-data-status", { detail: s })); };
  const getStatus = () => lastStatus;

  // ── Supabase RPC via plain fetch (no SDK dependency in the client) ──────────
  async function rpc(fn, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.queryTimeoutMs);
    try {
      const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: cfg.supabaseAnonKey,
          Authorization: `Bearer ${cfg.supabaseAnonKey}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`RPC ${fn} HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Embedded fallback readers (only used when embeddedFallback === true) ─────
  // These mirror the original client-side haversine filter over the inlined data.
  function nmBetweenLocal(la1, lo1, la2, lo2) {
    const R = 3440.065; // nautical miles
    const toR = (d) => (d * Math.PI) / 180;
    const dLa = toR(la2 - la1), dLo = toR(lo2 - lo1);
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(toR(la1)) * Math.cos(toR(la2)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function embeddedWaypoints(lat, lng, nm, types) {
    const src = (window.BW_WAYPOINTS && window.BW_WAYPOINTS.wp) || [];
    const out = [];
    for (const [name, wlat, wlng, t] of src) {
      if (types && !types.has(t)) continue;
      const d = nmBetweenLocal(lat, lng, wlat, wlng);
      if (d <= nm) out.push({ name, lat: wlat, lng: wlng, t, nm: d });
    }
    return out.sort((a, b) => a.nm - b.nm);
  }
  function embeddedRamps(lat, lng, nm) {
    const src = (window.BW_RAMPS && window.BW_RAMPS.rp) || [];
    const out = [];
    for (const [name, rlat, rlng] of src) {
      const d = nmBetweenLocal(lat, lng, rlat, rlng);
      if (d <= nm) out.push({ name, lat: rlat, lng: rlng, nm: d });
    }
    return out.sort((a, b) => a.nm - b.nm);
  }

  // ── Public API: async, resolves to { rows, status } ─────────────────────────
  async function waypointsWithin(lat, lng, nm, typesSet) {
    const types = typesSet && typesSet.size ? typesSet : null;
    const k = keyOf(lat, lng, nm, types);
    try {
      const rows = await rpc("waypoints_within", {
        p_lat: lat, p_lng: lng, p_radius_nm: nm,
        p_types: types ? [...types] : null,
      });
      const mapped = rows.map((r) => ({ name: r.name, lat: r.lat, lng: r.lng, t: r.type_code, nm: r.nm }));
      cache.set(k, mapped);
      setStatus("live");
      return { rows: mapped, status: "live" };
    } catch (e) {
      if (cache.has(k)) { setStatus("cached"); return { rows: cache.get(k), status: "cached" }; }
      if (cfg.embeddedFallback && window.BW_WAYPOINTS) {
        const rows = embeddedWaypoints(lat, lng, nm, types);
        setStatus("offline-embedded");
        return { rows, status: "offline-embedded" };
      }
      setStatus("unavailable");
      return { rows: [], status: "unavailable" };
    }
  }

  async function rampsWithin(lat, lng, nm) {
    const k = "ramp:" + keyOf(lat, lng, nm, null);
    try {
      const rows = await rpc("ramps_within", { p_lat: lat, p_lng: lng, p_radius_nm: nm });
      const mapped = rows.map((r) => ({ name: r.name, lat: r.lat, lng: r.lng, nm: r.nm }));
      cache.set(k, mapped);
      setStatus("live");
      return { rows: mapped, status: "live" };
    } catch (e) {
      if (cache.has(k)) { setStatus("cached"); return { rows: cache.get(k), status: "cached" }; }
      if (cfg.embeddedFallback && window.BW_RAMPS) {
        setStatus("offline-embedded");
        return { rows: embeddedRamps(lat, lng, nm), status: "offline-embedded" };
      }
      setStatus("unavailable");
      return { rows: [], status: "unavailable" };
    }
  }

  window.BW_DATA = { waypointsWithin, rampsWithin, getStatus };
})();
