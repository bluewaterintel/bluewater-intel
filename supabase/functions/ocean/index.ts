// ============================================================================
// Bluewater Intel — Milestone 4: ocean data proxy
// Supabase Edge Function (Deno). Deploy: supabase functions deploy ocean
//
// PURPOSE: fetch REAL ocean data from FREE government sources, normalize it to a
// common shape WITH the real observation timestamp, and cache it. The browser
// can't call these sources directly (CORS, rate limits), so this proxy does.
//
// GOVERNING PRINCIPLE: this returns only real values with their real observedAt
// time. It NEVER fabricates a value. If a source has no data for a point/time,
// the field is returned as null with observedAt null — the client's freshness
// model decides what to do (use/aging/drop) and the algorithm degrades
// gracefully. No synthetic fallback anywhere.
//
// SOURCES (all free):
//   • NDBC buoys (point obs: wind, waves, water temp, pressure) via the
//     real-time .txt feeds. Nearest buoy to the requested point is used.
//   • NOAA CoastWatch ERDDAP (gridded SST, chlorophyll) via griddap .json.
//   • Bathymetry is handled client-side (static) — not proxied here.
//
// NOTE: dataset IDs and station lists are configured below and WILL need
// verification/tuning against live ERDDAP when you deploy (dataset IDs change,
// and you may prefer a different SST product). Marked clearly.
// ============================================================================

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGINS") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ── Config (VERIFY dataset IDs against live ERDDAP before production) ─────────
// Per-dataset ERDDAP base URLs: NOAA hosts these products on different ERDDAP
// servers, and the old coastwatch.pfeg.noaa.gov entries now 302-redirect to
// coastwatch.noaa.gov for some products. Point each dataset at its canonical host
// directly so we don't depend on redirects.
const SST_ERDDAP = Deno.env.get("SST_ERDDAP") ?? "https://coastwatch.pfeg.noaa.gov/erddap/griddap";
const CHL_ERDDAP = Deno.env.get("CHL_ERDDAP") ?? "https://coastwatch.noaa.gov/erddap/griddap";
// A conventional User-Agent — some NOAA hosts 403 the default Deno UA.
const ERDDAP_HEADERS = { "User-Agent": "BluewaterIntel/1.0 (+https://bluewaterintel.com; ocean data proxy)" };
// SST: JPL MUR, daily, global ~1km — reliable coverage, ~1-day latency.
// (The previous default, nesdisGeoPolarSSTN5SQNRT, has been retired from CoastWatch
// ERDDAP and now 404s, which returned null SST for every point and left the heat
// map empty.) Override with the SST_DATASET/SST_VAR secrets if you prefer another
// product; verify the dataset id + var name on the ERDDAP dataset page on deploy.
const SST_DATASET = Deno.env.get("SST_DATASET") ?? "jplMURSST41";
const SST_VAR = Deno.env.get("SST_VAR") ?? "analysed_sst"; // verify exact var name on the dataset page
// MUR SST is gridded by [time][lat][lng] — no altitude dimension.
const SST_HAS_ALTITUDE = (Deno.env.get("SST_HAS_ALTITUDE") ?? "false") === "true";
// Chlorophyll: NOAA CoastWatch VIIRS SNPP science-quality daily, real observed
// chlor_a. (The previous default, noaacwNPPVIIRSchlaDaily, has been retired from
// ERDDAP and now 404s, so chlorophyll came back null and contributed nothing to
// scoring.) This product is gridded by [time][altitude][lat][lng], so the point
// query MUST include an altitude index. Cloud-gap pixels return null and are
// covered by the client's last-known-good fallback (best available REAL value —
// never synthetic). Override via the CHL_DATASET/CHL_VAR/CHL_HAS_ALTITUDE secrets.
const CHL_DATASET = Deno.env.get("CHL_DATASET") ?? "noaacwNPPVIIRSSQchlaDaily";
const CHL_VAR = Deno.env.get("CHL_VAR") ?? "chlor_a";
const CHL_HAS_ALTITUDE = (Deno.env.get("CHL_HAS_ALTITUDE") ?? "true") === "true";

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && isFinite(n) ? n : null;
};

// ── NDBC: nearest active buoy point observation ──────────────────────────────
// Real-time per-station feed: https://www.ndbc.noaa.gov/data/realtime2/<ID>.txt
// First two lines are headers; the first data row is the latest observation.
// Columns (stdmet): YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP ...
// A configurable station list keyed by rough region keeps us to buoys that exist.
// VERIFY/EXPAND this list for your coverage area before production.
const BUOYS: { id: string; lat: number; lng: number }[] = [
  { id: "44025", lat: 40.25, lng: -73.16 }, // Long Island
  { id: "44065", lat: 40.37, lng: -73.70 }, // NY Harbor entrance
  { id: "44009", lat: 38.46, lng: -74.70 }, // Delaware Bay
  { id: "44014", lat: 36.61, lng: -74.84 }, // Virginia Beach
  { id: "41001", lat: 34.72, lng: -72.32 }, // E of Cape Hatteras
  { id: "41002", lat: 31.76, lng: -74.84 }, // S Hatteras
  { id: "41008", lat: 31.40, lng: -80.87 }, // Grays Reef GA
  { id: "41009", lat: 28.52, lng: -80.18 }, // Canaveral FL
  { id: "41010", lat: 28.88, lng: -78.49 }, // Canaveral East
  { id: "42036", lat: 28.50, lng: -84.52 }, // W Florida shelf
  { id: "42013", lat: 27.17, lng: -82.92 }, // Tampa/Venice nearshore
];

function nmBetween(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 3440.065, toR = (d: number) => (d * Math.PI) / 180;
  const dLa = toR(la2 - la1), dLo = toR(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(toR(la1)) * Math.cos(toR(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function fetchBuoy(lat: number, lng: number) {
  const sorted = [...BUOYS].sort((a, b) => nmBetween(lat, lng, a.lat, a.lng) - nmBetween(lat, lng, b.lat, b.lng));
  for (const b of sorted.slice(0, 3)) { // try the 3 nearest; some may be offline
    try {
      const r = await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${b.id}.txt`, { signal: AbortSignal.timeout(8000), headers: ERDDAP_HEADERS });
      if (!r.ok) continue;
      const text = await r.text();
      const lines = text.split("\n").filter((l) => l && !l.startsWith("#"));
      if (!lines.length) continue;
      const c = lines[0].trim().split(/\s+/);
      // indices per stdmet header
      const [YY, MM, DD, hh, mm] = [c[0], c[1], c[2], c[3], c[4]].map((x) => parseInt(x, 10));
      const observedAtMs = Date.UTC(YY, MM - 1, DD, hh, mm);
      const mps = num(c[6]); // WSPD m/s
      const wvhtM = num(c[8]); // WVHT m
      const dpd = num(c[9]); // dominant period s
      const pres = num(c[12]); // hPa
      const wtmpC = num(c[14]); // water temp C
      const wdir = num(c[5]); // wind dir deg
      return {
        buoyId: b.id, buoyNm: Math.round(nmBetween(lat, lng, b.lat, b.lng)),
        observedAtMs,
        wind: mps != null ? { value: Math.round(mps * 1.943844 * 10) / 10, dir: wdir, observedAtMs } : { value: null, observedAtMs: null }, // kt
        waves: wvhtM != null ? { value: Math.round(wvhtM * 3.28084 * 10) / 10, periodS: dpd, observedAtMs } : { value: null, observedAtMs: null }, // ft
        waterTemp: wtmpC != null ? { value: Math.round((wtmpC * 9 / 5 + 32) * 10) / 10, observedAtMs } : { value: null, observedAtMs: null }, // F
        pressure: pres != null ? { value: pres, observedAtMs } : { value: null, observedAtMs: null },
      };
    } catch { /* try next buoy */ }
  }
  return null;
}

// ── ERDDAP: latest gridded value at a point ──────────────────────────────────
// griddap lets you ask for the most recent time slice nearest a lat/lng. We use
// the "last" time index and the nearest grid cell, returning value + the time.
async function fetchGridPoint(
  base: string,
  dataset: string,
  varName: string,
  lat: number,
  lng: number,
  hasAltitude = false,
  lookbackSteps = 0,
) {
  // Query the nearest cell. .json returns {table:{columnNames,rows}}.
  // Time index:
  //   • lookbackSteps === 0 → just the latest slice:  <var>[(last)]...
  //   • lookbackSteps  >  0 → the last N+1 slices:     <var>[last-N:last]...
  // We then walk newest→oldest and return the most recent NON-NULL real
  // observation. This is the "best available real data" rule: satellite pixels
  // are frequently cloud-gapped (null) on any single day, so for slow-changing
  // variables (SST, chlorophyll) we fall back to the most recent cloud-free
  // observation at that pixel instead of dropping the variable. The returned
  // observedAt is the REAL time of that observation, so the freshness model can
  // age/label it correctly. Nothing is invented — only real measurements are used.
  //
  // Altitude: surface-layer datasets (e.g. VIIRS chlorophyll) carry an altitude
  // dimension that must be indexed or ERDDAP errors with "wrong number of dimensions".
  const altIdx = hasAltitude ? "%5B(0.0)%5D" : "";
  const timeIdx = lookbackSteps > 0 ? `%5Blast-${lookbackSteps}:last%5D` : "%5B(last)%5D";
  const url = `${base}/${dataset}.json?${varName}${timeIdx}${altIdx}%5B(${lat})%5D%5B(${lng})%5D`;
  try {
    // Some NOAA ERDDAP hosts (e.g. coastwatch.noaa.gov) reject requests that lack
    // a conventional User-Agent (the default Deno UA gets a 403), so set one.
    const r = await fetch(url, { signal: AbortSignal.timeout(9000), headers: ERDDAP_HEADERS });
    if (!r.ok) return { value: null, observedAtMs: null };
    const d = await r.json();
    const cols: string[] = d?.table?.columnNames ?? [];
    const rows: unknown[][] = d?.table?.rows ?? [];
    const ti = cols.indexOf("time");
    const vi = cols.indexOf(varName);
    for (let i = rows.length - 1; i >= 0; i--) {
      const value = num(rows[i][vi]);
      if (value != null) {
        const observedAtMs = ti >= 0 && typeof rows[i][ti] === "string" ? Date.parse(rows[i][ti] as string) : null;
        return { value, observedAtMs };
      }
    }
    return { value: null, observedAtMs: null };
  } catch {
    return { value: null, observedAtMs: null };
  }
}

// ── NOAA CO-OPS tide (real harmonic predictions) ─────────────────────────────
// Tide "stage" = how hard the water is moving (0 = slack, 1 = peak flood/ebb),
// which is what drives the inshore/nearshore bite. We derive it from the rate of
// change of the official NOAA water-level PREDICTION curve at the nearest tide
// station: find the nearest station, pull a few hours of 6-minute predictions
// around now, and take |dWater/dt| normalised by the window's peak slope. These
// are real, published astronomical predictions — nothing synthetic.
const COOPS_MD = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions";
const COOPS_PRED = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
// Singleton promise so concurrent cold-start requests share ONE stations fetch.
let _stationsPromise: Promise<{ id: string; lat: number; lng: number }[]> | null = null;
function ensureTideStations() {
  if (!_stationsPromise) {
    _stationsPromise = (async () => {
      try {
        const r = await fetch(COOPS_MD, { signal: AbortSignal.timeout(9000), headers: ERDDAP_HEADERS });
        if (!r.ok) return [];
        const d = await r.json();
        return (d?.stations ?? [])
          // Only REFERENCE stations (type "R") return harmonic predictions via the
          // datagetter; subordinate stations ("S") return "No Predictions data".
          .filter((s: Record<string, unknown>) => String(s.type) === "R")
          .map((s: Record<string, unknown>) => ({ id: String(s.id), lat: Number(s.lat), lng: Number(s.lng) }))
          // Keep US East + Gulf coast to keep the nearest-search small.
          .filter((s: { id: string; lat: number; lng: number }) =>
            isFinite(s.lat) && isFinite(s.lng) && s.lat > 22 && s.lat < 47 && s.lng > -98 && s.lng < -64);
      } catch {
        return [];
      }
    })();
  }
  return _stationsPromise;
}
// Per-station prediction cache (15 min) keyed by station id.
const tideCache = new Map<string, { atMs: number; value: number | null; state: string | null }>();
const pad2 = (n: number) => String(n).padStart(2, "0");
const coopsDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};

async function fetchTide(lat: number, lng: number) {
  const none = { value: null as number | null, state: null as string | null, station: null as string | null, observedAtMs: null as number | null };
  const stations = await ensureTideStations();
  if (!stations.length) return none;
  let best: { id: string; lat: number; lng: number } | null = null;
  let bestNm = Infinity;
  for (const s of stations) {
    const d = nmBetween(lat, lng, s.lat, s.lng);
    if (d < bestNm) { bestNm = d; best = s; }
  }
  // No reference station within ~90 nm → no honest tide signal for this point.
  if (!best || bestNm > 90) return none;
  const now = Date.now();
  const hit = tideCache.get(best.id);
  if (hit && now - hit.atMs < 15 * 60 * 1000) return { value: hit.value, state: hit.state, station: best.id, observedAtMs: now };
  const url = `${COOPS_PRED}?product=predictions&application=bluewaterintel`
    + `&begin_date=${encodeURIComponent(coopsDate(now - 3 * 3600 * 1000))}`
    + `&end_date=${encodeURIComponent(coopsDate(now + 3 * 3600 * 1000))}`
    + `&datum=MLLW&station=${best.id}&time_zone=gmt&units=english&interval=6&format=json`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(9000), headers: ERDDAP_HEADERS });
    if (!r.ok) return none;
    const d = await r.json();
    const preds = (d?.predictions ?? [])
      .map((p: { t: string; v: string }) => ({ t: Date.parse(p.t.replace(" ", "T") + "Z"), v: Number(p.v) }))
      .filter((p: { t: number; v: number }) => isFinite(p.t) && isFinite(p.v));
    if (preds.length < 3) return none;
    let maxSlope = 0;
    const slopes: { tMid: number; s: number }[] = [];
    for (let i = 1; i < preds.length; i++) {
      const dtH = (preds[i].t - preds[i - 1].t) / 3600000;
      if (dtH <= 0) continue;
      const s = (preds[i].v - preds[i - 1].v) / dtH; // ft/hr
      slopes.push({ tMid: (preds[i].t + preds[i - 1].t) / 2, s });
      if (Math.abs(s) > maxSlope) maxSlope = Math.abs(s);
    }
    if (!slopes.length || maxSlope <= 0) return none;
    let cur = slopes[0], bd = Infinity;
    for (const sl of slopes) { const dd = Math.abs(sl.tMid - now); if (dd < bd) { bd = dd; cur = sl; } }
    const value = Math.min(1, Math.abs(cur.s) / maxSlope);
    const state = cur.s > maxSlope * 0.1 ? "rising" : cur.s < -maxSlope * 0.1 ? "falling" : "slack";
    tideCache.set(best.id, { atMs: now, value, state });
    return { value, state, station: best.id, observedAtMs: now };
  } catch {
    return none;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const u = new URL(req.url);
  const lat = num(u.searchParams.get("lat"));
  const lng = num(u.searchParams.get("lng"));
  if (lat == null || lng == null) return json({ error: "lat and lng required" }, 400);

  // Fetch all sources in parallel. Each returns real value+observedAt or nulls.
  // Lookback windows: SST (MUR) is gap-filled so a short window is just safety;
  // chlorophyll is frequently cloud-gapped so scan ~2 weeks for the last clear pixel.
  const SST_LOOKBACK = Number(Deno.env.get("SST_LOOKBACK") ?? "3");
  const CHL_LOOKBACK = Number(Deno.env.get("CHL_LOOKBACK") ?? "14");
  const [buoy, sst, chlorRaw, tide] = await Promise.all([
    fetchBuoy(lat, lng),
    fetchGridPoint(SST_ERDDAP, SST_DATASET, SST_VAR, lat, lng, SST_HAS_ALTITUDE, SST_LOOKBACK),
    fetchGridPoint(CHL_ERDDAP, CHL_DATASET, CHL_VAR, lat, lng, CHL_HAS_ALTITUDE, CHL_LOOKBACK),
    fetchTide(lat, lng),
  ]);

  // SST: prefer gridded (spatial coverage); buoy water temp is a separate field.
  // ERDDAP SST may be Celsius or Kelvin depending on dataset — normalize to °F.
  let sstF: { value: number | null; observedAtMs: number | null } = { value: null, observedAtMs: sst.observedAtMs };
  if (sst.value != null) {
    let c = sst.value;
    if (c > 200) c = c - 273.15;            // Kelvin → C
    sstF = { value: Math.round((c * 9 / 5 + 32) * 10) / 10, observedAtMs: sst.observedAtMs };
  }

  const payload = {
    point: { lat, lng },
    fetchedAtMs: Date.now(),
    // Each field carries its own real observedAt so the client computes age.
    sst: sstF,                                            // °F, gridded
    chlor: { value: chlorRaw.value, observedAtMs: chlorRaw.observedAtMs }, // mg/m^3
    wind: buoy?.wind ?? { value: null, observedAtMs: null },
    waves: buoy?.waves ?? { value: null, observedAtMs: null },
    waterTemp: buoy?.waterTemp ?? { value: null, observedAtMs: null },
    pressure: buoy?.pressure ?? { value: null, observedAtMs: null },
    // tide stage 0..1 (0 = slack, 1 = peak flood/ebb) from NOAA CO-OPS predictions.
    tide: { value: tide.value, state: tide.state, observedAtMs: tide.observedAtMs },
    sources: {
      sst: SST_DATASET, chlor: CHL_DATASET,
      buoy: buoy ? { id: buoy.buoyId, nm: buoy.buoyNm } : null,
      tide: tide.station,
    },
  };

  // Cache at the edge for 30 min (these feeds update hourly at most).
  return new Response(JSON.stringify(payload), {
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" },
  });
});
