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
const ERDDAP = "https://coastwatch.pfeg.noaa.gov/erddap/griddap";
// SST: NOAA Geo-Polar Blended SST, daily, global 5km — good coverage, ~1-day latency.
// If you prefer MUR (jplMURSST41) swap the id + var name. Verify on deploy.
const SST_DATASET = Deno.env.get("SST_DATASET") ?? "nesdisGeoPolarSSTN5SQNRT";
const SST_VAR = Deno.env.get("SST_VAR") ?? "analysed_sst"; // verify exact var name on the dataset page
// Chlorophyll: VIIRS NRT daily, global 4km.
const CHL_DATASET = Deno.env.get("CHL_DATASET") ?? "noaacwNPPVIIRSchlaDaily";
const CHL_VAR = Deno.env.get("CHL_VAR") ?? "chlor_a";

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
      const r = await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${b.id}.txt`, { signal: AbortSignal.timeout(8000) });
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
async function fetchGridPoint(dataset: string, varName: string, lat: number, lng: number) {
  // Query the most recent time, nearest cell. .json returns {table:{columnNames,rows}}
  // Example: <ERDDAP>/<dataset>.json?<var>[(last)][(lat)][(lng)]
  const url = `${ERDDAP}/${dataset}.json?${varName}%5B(last)%5D%5B(${lat})%5D%5B(${lng})%5D`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return { value: null, observedAtMs: null };
    const d = await r.json();
    const cols: string[] = d?.table?.columnNames ?? [];
    const row: unknown[] = d?.table?.rows?.[0] ?? [];
    const ti = cols.indexOf("time");
    const vi = cols.indexOf(varName);
    const value = num(row[vi]);
    const observedAtMs = ti >= 0 && typeof row[ti] === "string" ? Date.parse(row[ti] as string) : null;
    return { value, observedAtMs };
  } catch {
    return { value: null, observedAtMs: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const u = new URL(req.url);
  const lat = num(u.searchParams.get("lat"));
  const lng = num(u.searchParams.get("lng"));
  if (lat == null || lng == null) return json({ error: "lat and lng required" }, 400);

  // Fetch all sources in parallel. Each returns real value+observedAt or nulls.
  const [buoy, sst, chlorRaw] = await Promise.all([
    fetchBuoy(lat, lng),
    fetchGridPoint(SST_DATASET, SST_VAR, lat, lng),
    fetchGridPoint(CHL_DATASET, CHL_VAR, lat, lng),
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
    sources: {
      sst: SST_DATASET, chlor: CHL_DATASET,
      buoy: buoy ? { id: buoy.buoyId, nm: buoy.buoyNm } : null,
    },
  };

  // Cache at the edge for 30 min (these feeds update hourly at most).
  return new Response(JSON.stringify(payload), {
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" },
  });
});
