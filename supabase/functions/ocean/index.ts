import { NetCDFReader } from "npm:netcdfjs";

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
//   • NOAA RTOFS surface currents (ESPC-D-V02 / HYCOM NCSS) — u/v at the
//     surface; global 1/12° nowcast + forecast. CoastWatch ERDDAP RTOFS
//     datasets currently 404, so we subset via HYCOM THREDDS NCSS (same model).
//   • Bathymetry: NOAA CUDEM 1/9 arc-sec (US coastal, BlueTopo sources) with
//     ETOPO 1-arcmin global fallback — proxied here for bite-map depth scoring.
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
// Chlorophyll: NOAA CoastWatch VIIRS NPP+NOAA-20 NEAR-REAL-TIME, GAP-FILLED
// (DINEOF) daily, real observed chlor_a. We deliberately use the NRT gap-filled
// product, not the science-quality one: the SQ feed (noaacwNPPVIIRSSQchlaDaily)
// lags ~10 days at the source, which made the bite score's chlorophyll a week+
// stale. This NRT DINEOF product publishes within ~3 days AND is gap-filled (no
// cloud holes), so a single latest slice is spatially complete — fresher data and
// a far smaller request than multi-day cloud compositing. Gridded by
// [time][altitude][lat][lng], so the point query MUST include an altitude index.
// Override via the CHL_DATASET/CHL_VAR/CHL_HAS_ALTITUDE secrets.
const CHL_DATASET = Deno.env.get("CHL_DATASET") ?? "noaacwNPPN20VIIRSDINEOFDaily";
const CHL_VAR = Deno.env.get("CHL_VAR") ?? "chlor_a";
const CHL_HAS_ALTITUDE = (Deno.env.get("CHL_HAS_ALTITUDE") ?? "true") === "true";
const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_MARINE = "https://marine-api.open-meteo.com/v1/marine";
// ETOPO 1-arcmin global relief (real bathymetry) via NOAA CoastWatch ERDDAP.
// altitude is metres relative to sea level (negative = below sea level).
const ETOPO_ERDDAP = Deno.env.get("ETOPO_ERDDAP") ?? "https://coastwatch.pfeg.noaa.gov/erddap/griddap";
const ETOPO_DATASET = Deno.env.get("ETOPO_DATASET") ?? "etopo180";
const ETOPO_STEP_DEG = 1 / 60; // native ~1 arcmin grid step
// CUDEM / BlueTopo — NOAA NCEI 1/9 arc-second (~3 m) US coastal bathymetry.
// CoastWatch ERDDAP has no global BlueTopo grid; we subset CUDEM tiles via NCSS.
const CUDEM_NCSS = Deno.env.get("CUDEM_NCSS")
  ?? "https://www.ngdc.noaa.gov/thredds/ncss/grid/tiles/tiled_19as";
const CUDEM_TILE_DEG = 0.25;
const CUDEM_NATIVE_STEP = 1 / (9 * 3600); // 1/9 arc-second in degrees
const CUDEM_VERSIONS = ["2019v2", "2019v1", "2018v1"];
const CUDEM_BOUNDS = { latMin: 23, latMax: 52, lngMin: -127, lngMax: -65 };
// NOAA CoastWatch BLENDED altimetry (multi-mission NRT, ~1-2 day latency).
// Two sibling datasets on the same 0.25° grid: sla (m) from the SSH product,
// u_current/v_current (m/s geostrophic) from the currents product. The older
// nesdisSSH1day (pfeg host) stopped updating in March 2026 — do not use it.
const ALTIMETRY_ERDDAP = Deno.env.get("ALTIMETRY_ERDDAP")
  ?? "https://coastwatch.noaa.gov/erddap/griddap";
const ALTIMETRY_SSH_DATASET = "noaacwBLENDEDsshDaily";
const ALTIMETRY_CUR_DATASET = "noaacwBLENDEDNRTcurrentsDaily";
const ALTIMETRY_STEP = 0.25;
// RTOFS (Real-Time Ocean Forecast System) — operational ESPC-D-V02 on HYCOM.
const RTOFS_NCSS = Deno.env.get("RTOFS_NCSS")
  ?? "https://ncss.hycom.org/thredds/ncss/grid/FMRC_ESPC-D-V02_uv3z/FMRC_ESPC-D-V02_uv3z_best.ncd";
const RTOFS_DODS = Deno.env.get("RTOFS_DODS")
  ?? "https://tds.hycom.org/thredds/dodsC/FMRC_ESPC-D-V02_uv3z/FMRC_ESPC-D-V02_uv3z_best.ncd";
const RTOFS_NATIVE_STEP = 1 / 12; // ~0.0833° native grid
const RTOFS_FILL = 1.26765e30;
const MS_TO_KT = 1.943844;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && isFinite(n) ? n : null;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

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
  { id: "44100", lat: 36.26, lng: -75.59 }, // Duck, NC (Outer Banks)
  { id: "44014", lat: 36.61, lng: -74.84 }, // Virginia Beach
  { id: "41001", lat: 34.72, lng: -72.32 }, // E of Cape Hatteras
  { id: "41002", lat: 31.76, lng: -74.84 }, // S Hatteras
  { id: "41008", lat: 31.40, lng: -80.87 }, // Grays Reef GA
  { id: "41009", lat: 28.52, lng: -80.18 }, // Canaveral FL
  { id: "41010", lat: 28.88, lng: -78.49 }, // Canaveral East
  { id: "42036", lat: 28.50, lng: -84.52 }, // W Florida shelf
  { id: "42013", lat: 27.17, lng: -82.92 }, // Tampa/Venice nearshore
];

// Parse one NDBC realtime feed into a per-field record (fields null if "MM").
// Station-keyed (no point distance here) so the result can be cached and shared.
type BuoyRec = {
  id: string; observedAtMs: number;
  wind: { value: number | null; dir: number | null; observedAtMs: number | null };
  waves: { value: number | null; periodS?: number | null; observedAtMs: number | null };
  waterTemp: { value: number | null; observedAtMs: number | null };
  airTemp: { value: number | null; observedAtMs: number | null };
  pressure: { value: number | null; observedAtMs: number | null };
  barometer: { value: number | null; observedAtMs: number | null };
};
async function fetchBuoyRaw(id: string): Promise<BuoyRec | null> {
  try {
    const r = await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${id}.txt`, { signal: AbortSignal.timeout(8000), headers: ERDDAP_HEADERS });
    if (!r.ok) return null;
    const text = await r.text();
    const lines = text.split("\n").filter((l) => l && !l.startsWith("#"));
    if (!lines.length) return null;
    const rows = lines.map((line) => {
      const c = line.trim().split(/\s+/);
      const [YY, MM, DD, hh, mm] = [c[0], c[1], c[2], c[3], c[4]].map((x) => parseInt(x, 10));
      const observedAtMs = Date.UTC(YY, MM - 1, DD, hh, mm);
      return {
        c, observedAtMs,
        pres: num(c[12]),
        ptdy: num(c[17]),
      };
    }).filter((row) => isFinite(row.observedAtMs));
    if (!rows.length) return null;
    const latest = rows[0];
    const c = latest.c;
    const observedAtMs = latest.observedAtMs;
    const mps = num(c[6]), wvhtM = num(c[8]), dpd = num(c[9]), pres = latest.pres, atmpC = num(c[13]), wtmpC = num(c[14]), wdir = num(c[5]);
    const targetTrendMs = observedAtMs - 24 * 3600 * 1000;
    let trend: number | null = null;
    if (pres != null) {
      const historic = rows
        .filter((row) => row.pres != null && row.observedAtMs <= observedAtMs - 18 * 3600 * 1000)
        .sort((a, b) => Math.abs(a.observedAtMs - targetTrendMs) - Math.abs(b.observedAtMs - targetTrendMs))[0];
      if (historic?.pres != null) trend = Math.round((pres - historic.pres) * 10) / 10;
    }
    if (trend == null && latest.ptdy != null) trend = latest.ptdy;
    return {
      id, observedAtMs,
      wind: mps != null ? { value: Math.round(mps * 1.943844 * 10) / 10, dir: wdir, observedAtMs } : { value: null, dir: null, observedAtMs: null }, // kt
      waves: wvhtM != null ? { value: Math.round(wvhtM * 3.28084 * 10) / 10, periodS: dpd, observedAtMs } : { value: null, observedAtMs: null }, // ft
      waterTemp: wtmpC != null ? { value: Math.round((wtmpC * 9 / 5 + 32) * 10) / 10, observedAtMs } : { value: null, observedAtMs: null }, // F
      airTemp: atmpC != null ? { value: Math.round((atmpC * 9 / 5 + 32) * 10) / 10, observedAtMs } : { value: null, observedAtMs: null }, // F
      // hPa pressure trend, preferably latest minus ~24h-ago pressure; falls back
      // to NDBC PTDY when there is not enough history in the realtime feed.
      pressure: trend != null ? { value: trend, observedAtMs } : { value: null, observedAtMs: null },
      barometer: pres != null ? { value: pres, observedAtMs } : { value: null, observedAtMs: null },
    };
  } catch {
    return null;
  }
}

// Per-station buoy cache (10 min). The heat map fans out ~60 ocean calls, each
// needing the nearest buoys; without caching that's hundreds of NDBC requests in a
// burst and the feed rate-limits us (wind/waves come back empty on the first
// render). Promise-keyed so concurrent cold-start calls share ONE fetch per station.
const buoyCache = new Map<string, { atMs: number; p: Promise<BuoyRec | null> }>();
function getBuoyCached(id: string): Promise<BuoyRec | null> {
  const now = Date.now();
  const hit = buoyCache.get(id);
  if (hit && now - hit.atMs < 10 * 60 * 1000) return hit.p;
  const p = fetchBuoyRaw(id);
  buoyCache.set(id, { atMs: now, p });
  return p;
}

function nmBetween(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 3440.065, toR = (d: number) => (d * Math.PI) / 180;
  const dLa = toR(la2 - la1), dLo = toR(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(toR(la1)) * Math.cos(toR(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

type ModelWindRec = {
  observedAtMs: number | null;
  forecastHour: number;
  wind: { value: number | null; dir: number | null; gustKts: number | null; observedAtMs: number | null };
  airTemp: { value: number | null; observedAtMs: number | null };
  /** 24h pressure change (hPa), same semantics as NDBC PTDY / buoy trend. */
  pressure: { value: number | null; observedAtMs: number | null };
  /** Absolute surface pressure (hPa) at the forecast valid time. */
  barometer: { value: number | null; observedAtMs: number | null };
  source: string;
};
type MarineRec = {
  observedAtMs: number | null;
  forecastHour: number;
  waves: { value: number | null; periodS?: number | null; dir?: number | null; observedAtMs: number | null };
  source: string;
};
const modelWindCache = new Map<string, { atMs: number; p: Promise<ModelWindRec> }>();
const marineCache = new Map<string, { atMs: number; p: Promise<MarineRec> }>();
function nearestHourlyIndex(times: string[], targetMs: number) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < times.length; i++) {
    const ms = Date.parse(times[i] + (times[i].endsWith("Z") ? "" : "Z"));
    const d = Math.abs(ms - targetMs);
    if (isFinite(ms) && d < bestD) { bestD = d; best = i; }
  }
  return best;
}
async function fetchModelWind(lat: number, lng: number, hoursAhead = 0): Promise<ModelWindRec> {
  const hour = Math.round(clamp(hoursAhead, 0, 96) / 3) * 3;
  const k = `${lat.toFixed(2)},${lng.toFixed(2)},${hour}`;
  const now = Date.now();
  const hit = modelWindCache.get(k);
  if (hit && now - hit.atMs < 20 * 60 * 1000) return hit.p;
  const p = (async () => {
    // gfs_seamless: HRRR 3-km where available (CONUS, 0–48h), GFS elsewhere.
    // NOT gfs_hrrr — that is HRRR-only and returns null offshore / beyond 48h.
    const url = `${OPEN_METEO_FORECAST}?latitude=${lat}&longitude=${lng}`
      + "&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,surface_pressure"
      + "&wind_speed_unit=kn&temperature_unit=fahrenheit&timezone=UTC&forecast_days=5"
      + "&models=gfs_seamless";
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(7000), headers: ERDDAP_HEADERS });
      if (!r.ok) throw new Error(`open-meteo ${r.status}`);
      const d = await r.json();
      const times: string[] = d?.hourly?.time ?? [];
      const targetMs = Date.now() + hour * 3600000;
      const idx = times.length ? nearestHourlyIndex(times, targetMs) : -1;
      const idx24 = times.length ? nearestHourlyIndex(times, targetMs - 24 * 3600000) : -1;
      const observedAtMs = idx >= 0 ? Date.parse(times[idx] + "Z") : null;
      const speed = idx >= 0 ? num(d?.hourly?.wind_speed_10m?.[idx]) : null;
      const dir = idx >= 0 ? num(d?.hourly?.wind_direction_10m?.[idx]) : null;
      const gust = idx >= 0 ? num(d?.hourly?.wind_gusts_10m?.[idx]) : null;
      const air = idx >= 0 ? num(d?.hourly?.temperature_2m?.[idx]) : null;
      const pres = idx >= 0 ? num(d?.hourly?.surface_pressure?.[idx]) : null;
      const pres24 = idx24 >= 0 ? num(d?.hourly?.surface_pressure?.[idx24]) : null;
      const trend = (pres != null && pres24 != null) ? Math.round((pres - pres24) * 10) / 10 : null;
      return {
        observedAtMs,
        forecastHour: hour,
        wind: speed != null && dir != null
          ? { value: Math.round(speed * 10) / 10, dir, gustKts: gust != null ? Math.round(gust * 10) / 10 : null, observedAtMs }
          : { value: null, dir: null, gustKts: null, observedAtMs: null },
        airTemp: air != null ? { value: Math.round(air * 10) / 10, observedAtMs } : { value: null, observedAtMs: null },
        pressure: trend != null ? { value: trend, observedAtMs } : { value: null, observedAtMs: null },
        barometer: pres != null ? { value: Math.round(pres * 10) / 10, observedAtMs } : { value: null, observedAtMs: null },
        source: "open-meteo-gfs_seamless",
      };
    } catch {
      return {
        observedAtMs: null,
        forecastHour: hour,
        wind: { value: null, dir: null, gustKts: null, observedAtMs: null },
        airTemp: { value: null, observedAtMs: null },
        pressure: { value: null, observedAtMs: null },
        barometer: { value: null, observedAtMs: null },
        source: "open-meteo-gfs_seamless",
      };
    }
  })();
  modelWindCache.set(k, { atMs: now, p });
  return p;
}

// Open-Meteo Marine (WaveWatch III) — significant wave height + period for a point.
async function fetchModelMarine(lat: number, lng: number, hoursAhead = 0): Promise<MarineRec> {
  const hour = Math.round(clamp(hoursAhead, 0, 96) / 3) * 3;
  const k = `m,${lat.toFixed(2)},${lng.toFixed(2)},${hour}`;
  const now = Date.now();
  const hit = marineCache.get(k);
  if (hit && now - hit.atMs < 20 * 60 * 1000) return hit.p;
  const none: MarineRec = {
    observedAtMs: null,
    forecastHour: hour,
    waves: { value: null, periodS: null, dir: null, observedAtMs: null },
    source: "open-meteo-marine",
  };
  const p = (async () => {
    const url = `${OPEN_METEO_MARINE}?latitude=${lat}&longitude=${lng}`
      + "&hourly=wave_height,wave_period,wave_direction"
      + "&timezone=UTC&forecast_days=6";
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(9000), headers: ERDDAP_HEADERS });
      if (!r.ok) throw new Error(`open-meteo-marine ${r.status}`);
      const d = await r.json();
      const times: string[] = d?.hourly?.time ?? [];
      const targetMs = Date.now() + hour * 3600000;
      const idx = times.length ? nearestHourlyIndex(times, targetMs) : -1;
      const observedAtMs = idx >= 0 ? Date.parse(times[idx] + "Z") : null;
      const htM = idx >= 0 ? num(d?.hourly?.wave_height?.[idx]) : null;
      const per = idx >= 0 ? num(d?.hourly?.wave_period?.[idx]) : null;
      const dir = idx >= 0 ? num(d?.hourly?.wave_direction?.[idx]) : null;
      return {
        observedAtMs,
        forecastHour: hour,
        waves: htM != null
          ? {
            value: Math.round(htM * 3.28084 * 10) / 10,
            periodS: per != null ? Math.round(per) : null,
            dir: dir != null ? Math.round(dir) : null,
            observedAtMs,
          }
          : { value: null, periodS: null, dir: null, observedAtMs: null },
        source: "open-meteo-marine",
      };
    } catch {
      return none;
    }
  })();
  marineCache.set(k, { atMs: now, p });
  return p;
}

function pickWaves(
  buoyWaves: { value: number | null; periodS?: number | null; observedAtMs: number | null } | null | undefined,
  marine: MarineRec,
) {
  if (buoyWaves?.value != null) return buoyWaves;
  return marine.waves;
}

// ── Gridded wind field for a bounding box (Open-Meteo bulk, ONE request) ──────
// Returns a FIXED-resolution grid { stepDeg, rows:[[lat,lng,speedKt,dirDeg],…] }
// snapped to absolute multiples of stepDeg, so the field is identical regardless
// of how the box was framed (stable across pan/zoom on the client). Resolution
// auto-coarsens to keep the point count bounded for large (zoomed-out) boxes.
const windGridCache = new Map<string, { atMs: number; p: Promise<{ stepDeg: number; rows: number[][] }> }>();
async function fetchWindGrid(latMin: number, latMax: number, lngMin: number, lngMax: number, hoursAhead = 0) {
  const hour = Math.round(clamp(hoursAhead, 0, 96) / 3) * 3;
  const a0 = Math.min(latMin, latMax), a1 = Math.max(latMin, latMax);
  const o0 = Math.min(lngMin, lngMax), o1 = Math.max(lngMin, lngMax);
  const CAP = 240; // Open-Meteo bulk + URL length budget
  const STEPS = [0.1, 0.15, 0.2, 0.25, 0.35, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0];
  const count = (s: number) => (Math.floor((a1 - a0) / s) + 1) * (Math.floor((o1 - o0) / s) + 1);
  let step = STEPS[STEPS.length - 1];
  for (const s of STEPS) { if (count(s) <= CAP) { step = s; break; } }
  const i0 = Math.floor(a0 / step), i1 = Math.ceil(a1 / step);
  const j0 = Math.floor(o0 / step), j1 = Math.ceil(o1 / step);
  const key = `${i0},${i1},${j0},${j1},${step},${hour}`;
  const now = Date.now();
  const hit = windGridCache.get(key);
  if (hit && now - hit.atMs < 20 * 60 * 1000) return hit.p;
  const lats: number[] = [], lngs: number[] = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    lats.push(Math.round(i * step * 1000) / 1000);
    lngs.push(Math.round(j * step * 1000) / 1000);
  }
  const p = (async () => {
    // gfs_seamless: HRRR 3-km where available (CONUS, 0–48h), GFS elsewhere.
    // NOT gfs_hrrr — that is HRRR-only and returns null offshore / beyond 48h,
    // which blanked the whole wind layer ("real wind unavailable").
    const url = `${OPEN_METEO_FORECAST}?latitude=${lats.join(",")}&longitude=${lngs.join(",")}`
      + "&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kn&timezone=UTC&forecast_days=5"
      + "&models=gfs_seamless";
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: ERDDAP_HEADERS });
      if (!r.ok) return { stepDeg: step, rows: [] as number[][] };
      const d = await r.json();
      const arr = Array.isArray(d) ? d : [d];
      const targetMs = Date.now() + hour * 3600000;
      const rows: number[][] = [];
      for (let n = 0; n < arr.length && n < lats.length; n++) {
        const e = arr[n];
        const times: string[] = e?.hourly?.time ?? [];
        if (!times.length) continue;
        const idx = nearestHourlyIndex(times, targetMs);
        const spd = num(e?.hourly?.wind_speed_10m?.[idx]);
        const dir = num(e?.hourly?.wind_direction_10m?.[idx]);
        const gust = num(e?.hourly?.wind_gusts_10m?.[idx]);
        if (spd != null && dir != null) {
          // null (not NaN) for a missing gust — NaN doesn't survive JSON.
          rows.push([lats[n], lngs[n], Math.round(spd * 10) / 10, Math.round(dir), gust != null ? Math.round(gust * 10) / 10 : null as unknown as number]);
        }
      }
      return { stepDeg: step, rows };
    } catch {
      return { stepDeg: step, rows: [] as number[][] };
    }
  })();
  windGridCache.set(key, { atMs: now, p });
  return p;
}

// ── NOAA SSH altimetry grid (nesdisSSH1day — RADS NRT, ~1-3 day latency) ─────
// Sea-level anomaly (sla, metres) + absolute geostrophic velocities
// (ugos/vgos, m/s) at 0.25° global resolution. Positive SLA = elevated sea
// surface = anticyclonic (warm-core eddy, Gulf Stream meander). Negative =
// depressed = cyclonic (cold-core eddy). This is the layer Hilton's and ROFFS
// charge $45-75/mo for — NOAA provides it free via CoastWatch ERDDAP.
type AltimetryGrid = {
  stepDeg: number;
  observedAtMs: number | null;
  rows: number[][];  // [lat, lng, sla_m, ugos_ms, vgos_ms]
};
const altimetryGridCache = new Map<string, { atMs: number; p: Promise<AltimetryGrid> }>();
async function fetchAltimetryGrid(
  latMin: number, latMax: number, lngMin: number, lngMax: number,
): Promise<AltimetryGrid> {
  const s = ALTIMETRY_STEP;
  const a0 = Math.floor(Math.min(latMin, latMax) / s) * s;
  const a1 = Math.ceil(Math.max(latMin, latMax) / s) * s;
  const o0 = Math.floor(Math.min(lngMin, lngMax) / s) * s;
  const o1 = Math.ceil(Math.max(lngMin, lngMax) / s) * s;
  const key = `${a0.toFixed(3)},${a1.toFixed(3)},${o0.toFixed(3)},${o1.toFixed(3)}`;
  const now = Date.now();
  const hit = altimetryGridCache.get(key);
  if (hit && now - hit.atMs < 6 * 60 * 60 * 1000) return hit.p; // 6h cache (daily product)
  const none: AltimetryGrid = { stepDeg: s, observedAtMs: null, rows: [] };
  // ERDDAP griddap can 502 or read-timeout intermittently on the upstream store,
  // especially for larger areas. Retry the pair once before giving up.
  const fetchErddap = async (url: string): Promise<Response | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(25000), headers: ERDDAP_HEADERS });
        if (r.ok) return r;
        // 5xx from the ERDDAP proxy is worth a retry; 4xx is not.
        if (r.status < 500) return r;
      } catch { /* network/timeout — retry */ }
    }
    return null;
  };
  const p = (async (): Promise<AltimetryGrid> => {
    try {
      const enc = (v: number) => `(${v.toFixed(4)})`;
      const dims = `[(last)][${enc(a0)}:${enc(a1)}][${enc(o0)}:${enc(o1)}]`;
      // SLA and geostrophic u/v live in two sibling datasets on the same grid;
      // fetch both in parallel and join on the lat/lng cell.
      const [slaR, curR] = await Promise.all([
        fetchErddap(`${ALTIMETRY_ERDDAP}/${ALTIMETRY_SSH_DATASET}.csv?sla${dims}`),
        fetchErddap(`${ALTIMETRY_ERDDAP}/${ALTIMETRY_CUR_DATASET}.csv?u_current${dims},v_current${dims}`),
      ]);
      if (!slaR || !slaR.ok) return none;
      const parseCsv = (txt: string) => {
        const lines = txt.trim().split("\n");
        const out: { t: string; lat: number; lng: number; vals: number[] }[] = [];
        for (let i = 2; i < lines.length; i++) {
          const p = lines[i].split(",");
          if (p.length < 4) continue;
          const lat = parseFloat(p[1]), lng = parseFloat(p[2]);
          if (!isFinite(lat) || !isFinite(lng)) continue;
          out.push({ t: p[0].trim(), lat, lng, vals: p.slice(3).map(parseFloat) });
        }
        return out;
      };
      const slaRows = parseCsv(await slaR.text());
      if (!slaRows.length) return none;
      const curMap = new Map<string, number[]>();
      if (curR && curR.ok) {
        for (const r of parseCsv(await curR.text())) {
          curMap.set(`${r.lat.toFixed(3)},${r.lng.toFixed(3)}`, r.vals);
        }
      }
      let observedAtMs: number | null = null;
      const rows: number[][] = [];
      for (const r of slaRows) {
        const sla = r.vals[0];
        if (!isFinite(sla)) continue;
        if (!observedAtMs && r.t) { const ms = Date.parse(r.t); if (isFinite(ms)) observedAtMs = ms; }
        const cur = curMap.get(`${r.lat.toFixed(3)},${r.lng.toFixed(3)}`);
        const ug = cur && isFinite(cur[0]) ? cur[0] : 0;
        const vg = cur && isFinite(cur[1]) ? cur[1] : 0;
        rows.push([
          Math.round(r.lat * 1000) / 1000,
          Math.round(r.lng * 1000) / 1000,
          Math.round(sla * 10000) / 10000,
          Math.round(ug * 10000) / 10000,
          Math.round(vg * 10000) / 10000,
        ]);
      }
      return { stepDeg: s, observedAtMs, rows };
    } catch {
      return none;
    }
  })();
  // Only cache a successful, non-empty grid. Caching an empty/failed result
  // would poison this box for the full 6h TTL after a single ERDDAP hiccup.
  p.then((grid) => {
    if (grid.rows.length > 0) altimetryGridCache.set(key, { atMs: now, p });
    else altimetryGridCache.delete(key);
  }).catch(() => altimetryGridCache.delete(key));
  altimetryGridCache.set(key, { atMs: now, p });
  return p;
}

// ── RTOFS surface currents (ESPC-D-V02 via HYCOM NCSS, NetCDF-3 subset) ───────
// Returns only real model values; land / fill → NaN in grids, null in point samples.
type CurrentGrid = {
  step: number; stepLat: number; stepLng: number;
  minLat: number; minLng: number; nLat: number; nLng: number;
  u: number[]; v: number[]; observedAtMs: number;
};
type CurrentPoint = { driftKts: number; setDeg: number; u: number; v: number; observedAtMs: number };

function lon360To180(lon: number) {
  return lon > 180 ? lon - 360 : lon;
}
function isCurrentVal(v: number | null) {
  return v != null && isFinite(v) && Math.abs(v) < RTOFS_FILL * 0.1;
}
function currentFromUv(u: number, v: number): Omit<CurrentPoint, "observedAtMs"> {
  const driftKts = Math.round(Math.sqrt(u * u + v * v) * MS_TO_KT * 100) / 100;
  const setDeg = Math.round((Math.atan2(u, v) * 180 / Math.PI + 360) % 360);
  return { driftKts, setDeg, u: Math.round(u * 1000) / 1000, v: Math.round(v * 1000) / 1000 };
}

const rtofsTimeCache = new Map<string, { atMs: number; p: Promise<{ epochMs: number; hours: number[] } | null> }>();
async function getRtofsTimeAxis(): Promise<{ epochMs: number; hours: number[] } | null> {
  const key = "axis";
  const now = Date.now();
  const hit = rtofsTimeCache.get(key);
  if (hit && now - hit.atMs < 3 * 3600 * 1000) return hit.p;
  const p = (async () => {
    try {
      const [dasR, timeR] = await Promise.all([
        fetch(`${RTOFS_DODS}.das`, { signal: AbortSignal.timeout(8000), headers: ERDDAP_HEADERS }),
        fetch(`${RTOFS_DODS}.ascii?time`, { signal: AbortSignal.timeout(8000), headers: ERDDAP_HEADERS }),
      ]);
      if (!dasR.ok || !timeR.ok) return null;
      const das = await dasR.text();
      const units = das.match(/time\s*\{[^}]*units\s+"hours since ([^"]+)"/s)?.[1];
      if (!units) return null;
      const epochMs = Date.parse(units.replace(" UTC", "Z").replace(".000", ""));
      if (!isFinite(epochMs)) return null;
      const body = await timeR.text();
      const m = body.match(/time\[\d+\]\s*\n([\s\S]+)/);
      if (!m) return null;
      const hours = m[1].split(",").map((x) => parseFloat(x.trim())).filter((h) => isFinite(h));
      if (!hours.length) return null;
      return { epochMs, hours };
    } catch {
      return null;
    }
  })();
  rtofsTimeCache.set(key, { atMs: now, p });
  return p;
}

async function resolveRtofsValidTimeIso(hoursAhead = 0): Promise<{ iso: string; observedAtMs: number } | null> {
  const axis = await getRtofsTimeAxis();
  if (!axis) return null;
  const targetMs = Date.now() + Math.max(0, hoursAhead) * 3600000;
  let best = axis.hours[0], bestMs = axis.epochMs + best * 3600000;
  for (const h of axis.hours) {
    const ms = axis.epochMs + h * 3600000;
    if (Math.abs(ms - targetMs) < Math.abs(bestMs - targetMs)) {
      best = h; bestMs = ms;
    }
  }
  const iso = new Date(bestMs).toISOString().replace(".000Z", "Z");
  return { iso, observedAtMs: bestMs };
}

function parseRtofsNcssSync(buf: ArrayBuffer): {
  lats: number[]; lons: number[]; u: number[]; v: number[]; timeH: number;
} | null {
  try {
    const reader = new NetCDFReader(new Uint8Array(buf));
    const lats = reader.getDataVariable("lat") as number[];
    const lons = reader.getDataVariable("lon") as number[];
    const uRaw = reader.getDataVariable("water_u") as number[];
    const vRaw = reader.getDataVariable("water_v") as number[];
    const timeH = (reader.getDataVariable("time") as number[])[0];
    if (!lats?.length || !lons?.length || !uRaw?.length || !vRaw?.length || !isFinite(timeH)) return null;
    // RTOFS uv3z is [time, depth, lat, lon] with ~40 depth levels. We only want the
    // SURFACE current (depth[0]). The request pins vertCoord=0, but defensively take
    // just the first lat*lon block so a stray depth axis can never scramble the grid
    // (or bloat the payload ~40×). Surface is the first block because depth is the
    // outer axis after time.
    const surf = lats.length * lons.length;
    const u: number[] = [], v: number[] = [];
    for (let i = 0; i < surf; i++) {
      const ui = num(uRaw[i]), vi = num(vRaw[i]);
      u.push(isCurrentVal(ui) ? ui! : NaN);
      v.push(isCurrentVal(vi) ? vi! : NaN);
    }
    return { lats, lons, u, v, timeH };
  } catch {
    return null;
  }
}

async function parseRtofsNcssAsync(buf: ArrayBuffer) {
  const parsed = parseRtofsNcssSync(buf);
  if (!parsed) return null;
  const axis = await getRtofsTimeAxis();
  const observedAtMs = axis ? axis.epochMs + parsed.timeH * 3600000 : Date.now();
  return { lats: parsed.lats, lons: parsed.lons, u: parsed.u, v: parsed.v, observedAtMs };
}

function packCurrentGrid(
  lats: number[], lons: number[], u: number[], v: number[], observedAtMs: number,
): CurrentGrid | null {
  if (!lats.length || !lons.length) return null;
  const minLat = lats[0], maxLat = lats[lats.length - 1];
  const minLng = lon360To180(lons[0]);
  const nLat = lats.length, nLng = lons.length;
  // ESPC-D's grid is anisotropic (lat spacing ~0.04°, lon ~0.08° at CONUS
  // latitudes), so lat and lng steps MUST be tracked separately. Collapsing
  // them into one step displaced every sample ~2× in latitude — currents were
  // drawn at the wrong places and the whole field appeared to shift on pan.
  const stepLat = nLat > 1 ? Math.round((maxLat - minLat) / (nLat - 1) * 100000) / 100000 : RTOFS_NATIVE_STEP;
  const stepLng = nLng > 1
    ? Math.round(Math.abs(lon360To180(lons[nLng - 1]) - minLng) / (nLng - 1) * 100000) / 100000
    : RTOFS_NATIVE_STEP;
  const step = Math.max(stepLat, stepLng); // legacy field for older cached clients
  return { step, stepLat, stepLng, minLat, minLng, nLat, nLng, u, v, observedAtMs };
}

const currentGridCache = new Map<string, { atMs: number; p: Promise<CurrentGrid | null> }>();
async function fetchCurrentGrid(latMin: number, latMax: number, lngMin: number, lngMax: number, hoursAhead = 0) {
  const a0 = Math.min(latMin, latMax), a1 = Math.max(latMin, latMax);
  const o0 = Math.min(lngMin, lngMax), o1 = Math.max(lngMin, lngMax);
  const CAP = 2500; // keep JSON under ~150KB
  const STEPS = [0.0833, 0.1, 0.15, 0.2, 0.25, 0.35, 0.5, 0.75, 1.0, 1.5, 2.0];
  const count = (s: number) => (Math.floor((a1 - a0) / s) + 1) * (Math.floor((o1 - o0) / s) + 1);
  let step = STEPS[STEPS.length - 1];
  for (const s of STEPS) { if (count(s) <= CAP) { step = s; break; } }
  const horizStride = Math.max(1, Math.round(step / RTOFS_NATIVE_STEP));
  const key = `${a0.toFixed(2)},${a1.toFixed(2)},${o0.toFixed(2)},${o1.toFixed(2)},${horizStride},${hoursAhead}`;
  const now = Date.now();
  const hit = currentGridCache.get(key);
  if (hit && now - hit.atMs < 2 * 3600 * 1000) return hit.p;

  const p = (async () => {
    const valid = await resolveRtofsValidTimeIso(hoursAhead);
    if (!valid) return null;
    const url = `${RTOFS_NCSS}?var=water_u&var=water_v&north=${a1}&south=${a0}&west=${o0}&east=${o1}`
      + `&horizStride=${horizStride}&vertCoord=0&time=${encodeURIComponent(valid.iso)}&accept=netcdf`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25000), headers: ERDDAP_HEADERS });
      if (!r.ok) return null;
      const parsed = await parseRtofsNcssAsync(await r.arrayBuffer());
      if (!parsed) return null;
      return packCurrentGrid(parsed.lats, parsed.lons, parsed.u, parsed.v, parsed.observedAtMs);
    } catch {
      return null;
    }
  })();
  currentGridCache.set(key, { atMs: now, p });
  return p;
}

function sampleCurrentFromGrid(grid: CurrentGrid | null, lat: number, lng: number): CurrentPoint | null {
  if (!grid || !grid.nLat || !grid.nLng) return null;
  const sLat = grid.stepLat ?? grid.step, sLng = grid.stepLng ?? grid.step;
  const fi = (lat - grid.minLat) / sLat;
  const fj = (lng - grid.minLng) / sLng;
  if (fi < -0.001 || fj < -0.001 || fi > grid.nLat - 1 + 0.001 || fj > grid.nLng - 1 + 0.001) return null;
  const i0 = Math.max(0, Math.min(grid.nLat - 2, Math.floor(fi)));
  const j0 = Math.max(0, Math.min(grid.nLng - 2, Math.floor(fj)));
  const di = Math.max(0, Math.min(1, fi - i0)), dj = Math.max(0, Math.min(1, fj - j0));
  const idx = (i: number, j: number) => i * grid.nLng + j;
  const u00 = grid.u[idx(i0, j0)], u10 = grid.u[idx(i0 + 1, j0)], u01 = grid.u[idx(i0, j0 + 1)], u11 = grid.u[idx(i0 + 1, j0 + 1)];
  const v00 = grid.v[idx(i0, j0)], v10 = grid.v[idx(i0 + 1, j0)], v01 = grid.v[idx(i0, j0 + 1)], v11 = grid.v[idx(i0 + 1, j0 + 1)];
  const w = (a: number, b: number, c: number, d: number) => {
    if (!isFinite(a) || !isFinite(b) || !isFinite(c) || !isFinite(d)) return null;
    return (1 - di) * (1 - dj) * a + di * (1 - dj) * b + (1 - di) * dj * c + di * dj * d;
  };
  const u = w(u00, u10, u01, u11), v = w(v00, v10, v01, v11);
  if (u == null || v == null) return null;
  return { ...currentFromUv(u, v), observedAtMs: grid.observedAtMs };
}

async function fetchCurrentPoint(lat: number, lng: number, hoursAhead = 0): Promise<CurrentPoint | null> {
  const pad = 0.25;
  const grid = await fetchCurrentGrid(lat - pad, lat + pad, lng - pad, lng + pad, hoursAhead);
  return sampleCurrentFromGrid(grid, lat, lng);
}

async function fetchBuoy(lat: number, lng: number) {
  // Pull the nearest few buoys in parallel, then take EACH field (wind, waves,
  // water temp, pressure) from the nearest buoy that actually reports it. A single
  // buoy often has a dead sensor (e.g. anemometer down → WDIR/WSPD "MM"), so the
  // old "first responding buoy" approach lost wind whenever the closest buoy's
  // anemometer was out. Merging per-field keeps every value REAL and maximizes
  // coverage without inventing anything.
  const sorted = [...BUOYS]
    .sort((a, b) => nmBetween(lat, lng, a.lat, a.lng) - nmBetween(lat, lng, b.lat, b.lng))
    .slice(0, 5);
  const recs = (await Promise.all(sorted.map(async (b) => {
    const rec = await getBuoyCached(b.id);
    return rec ? { rec, nm: nmBetween(lat, lng, b.lat, b.lng) } : null;
  })))
    .filter((x): x is { rec: BuoyRec; nm: number } => x != null)
    .sort((a, b) => a.nm - b.nm); // nearest first
  if (!recs.length) return null;
  const nullField = { value: null as number | null, observedAtMs: null as number | null };
  // Wind: take the nearest buoy that has both speed and direction.
  let wind: BuoyRec["wind"] | null = null;
  for (const { rec } of recs) { if (rec.wind && rec.wind.value != null && rec.wind.dir != null) { wind = rec.wind; break; } }
  // Other fields: nearest buoy reporting a value.
  const pick = (sel: (r: BuoyRec) => { value: number | null }) => {
    for (const { rec } of recs) { const f = sel(rec); if (f && f.value != null) return f; }
    return null;
  };
  return {
    buoyId: recs[0].rec.id, buoyNm: Math.round(recs[0].nm),
    observedAtMs: recs[0].rec.observedAtMs,
    wind: wind ?? { value: null, dir: null, observedAtMs: null },
    waves: pick((r) => r.waves) ?? nullField,
    waterTemp: pick((r) => r.waterTemp) ?? nullField,
    airTemp: pick((r) => r.airTemp) ?? nullField,
    pressure: pick((r) => r.pressure) ?? nullField,
    barometer: pick((r) => r.barometer) ?? nullField,
  };
}

// ── Distance- & freshness-weighted SST blend (grid base + buoy correction) ───
// GOVERNING PRINCIPLE (unchanged): real data or an honest absence — never
// synthetic. The high-res gridded SST (MUR) is the spatially-complete BASE; a
// nearby NDBC buoy CORRECTS it, with influence that falls off as the buoy gets
// farther (≈0 by 50 nm) or staler. Near dense buoys (New England / Gulf shelf)
// the buoy dominates; in sparse, high-gradient water (Mid-Atlantic Gulf Stream
// wall, Loop Current eddies) the high-res grid carries the cell — no hard region
// switch. If neither side has a value, the result is { null, null }.
const SST_BUOY_MAX_NM = Number(Deno.env.get("SST_BUOY_MAX_NM") ?? "60");
type SstSrc = { value: number | null; observedAtMs: number | null };
type BuoySst = { value: number; observedAtMs: number | null; distNm: number };
type BuoyTemp = { lat: number; lng: number; value: number; observedAtMs: number | null };

export function blendSst(grid: SstSrc | null, buoy: BuoySst | null): SstSrc {
  const now = Date.now();
  const ageH = (ms: number | null) => (ms != null ? Math.max(0, (now - ms) / 3600000) : null);
  const gridOk = !!(grid && grid.value != null);
  const buoyOk = !!(buoy && buoy.value != null && buoy.distNm <= SST_BUOY_MAX_NM);
  // (a) BOTH present → distance/freshness blend.
  if (gridOk && buoyOk) {
    const g = grid as SstSrc, b = buoy as BuoySst;
    let wDist = clamp(1 - b.distNm / 50, 0, 1); // 2nm→0.96, 20nm→0.60, 50nm→0
    wDist = wDist * wDist;                       // soften: 2nm→~0.92, 20nm→~0.36, 50nm→0
    const buoyFresh = clamp(1 - (ageH(b.observedAtMs) ?? 0) / 24, 0.1, 1); // buoy decays over 24h
    const gridFresh = clamp(1 - (ageH(g.observedAtMs) ?? 0) / 48, 0.1, 1); // grid decays over 48h
    let wBuoy = wDist * buoyFresh;
    wBuoy = wBuoy / (wBuoy + gridFresh);         // normalize against grid freshness
    const value = Math.round((wBuoy * b.value + (1 - wBuoy) * (g.value as number)) * 10) / 10;
    // Age reflects the blend: weight-average the contributing observation times.
    const observedAtMs = (b.observedAtMs != null && g.observedAtMs != null)
      ? Math.round(wBuoy * b.observedAtMs + (1 - wBuoy) * g.observedAtMs)
      : (b.observedAtMs ?? g.observedAtMs);
    return { value, observedAtMs };
  }
  // (b) GRID only.
  if (gridOk) return { value: (grid as SstSrc).value, observedAtMs: (grid as SstSrc).observedAtMs };
  // (c) BUOY only (already constrained to ≤ max radius).
  if (buoyOk) return { value: (buoy as BuoySst).value, observedAtMs: (buoy as BuoySst).observedAtMs };
  // (d) NEITHER.
  return { value: null, observedAtMs: null };
}

// Nearest WTMP-reporting buoy (within max radius) to a point, as an SST
// correction source. Operates over a prefetched/cached list so a grid blend over
// hundreds of cells fires NO extra NDBC requests.
export function nearestBuoySst(lat: number, lng: number, buoyList: BuoyTemp[]): BuoySst | null {
  let best: BuoySst | null = null;
  for (const b of buoyList) {
    const nm = nmBetween(lat, lng, b.lat, b.lng);
    if (nm <= SST_BUOY_MAX_NM && (!best || nm < best.distNm)) {
      best = { value: b.value, observedAtMs: b.observedAtMs, distNm: nm };
    }
  }
  return best;
}

// Prefetch every buoy's live water temp ONCE per request. Deduped by station via
// the 10-min buoy cache, so the 90-point grid build never refetches a buoy.
async function buoyWtmpList(): Promise<BuoyTemp[]> {
  const recs = await Promise.all(BUOYS.map(async (b) => {
    const rec = await getBuoyCached(b.id);
    return rec && rec.waterTemp.value != null
      ? { lat: b.lat, lng: b.lng, value: rec.waterTemp.value, observedAtMs: rec.waterTemp.observedAtMs }
      : null;
  }));
  return recs.filter((x): x is BuoyTemp => x != null);
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
// Per-station prediction cache (15 min) keyed by station id + forecast hour.
const tideCache = new Map<string, { atMs: number; value: number | null; state: string | null; validAtMs: number | null }>();
const pad2 = (n: number) => String(n).padStart(2, "0");
const coopsDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};

type TideRec = {
  value: number | null;
  state: string | null;
  station: string | null;
  observedAtMs: number | null;
  _forecast?: boolean;
  forecastHour?: number;
};

function tidePayload(t: TideRec) {
  return {
    value: t.value,
    state: t.state,
    observedAtMs: t.observedAtMs,
    ...(t._forecast ? { _forecast: true, forecastHour: t.forecastHour } : {}),
  };
}

async function fetchTide(lat: number, lng: number, hoursAhead = 0): Promise<TideRec> {
  const none: TideRec = { value: null, state: null, station: null, observedAtMs: null };
  const hour = Math.round(clamp(hoursAhead, 0, 96) / 3) * 3;
  const targetMs = Date.now() + hour * 3600000;
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
  const cacheKey = `${best.id},${hour}`;
  const hit = tideCache.get(cacheKey);
  if (hit && now - hit.atMs < 15 * 60 * 1000) {
    return {
      value: hit.value,
      state: hit.state,
      station: best.id,
      observedAtMs: hit.validAtMs ?? targetMs,
      ...(hour > 0 ? { _forecast: true, forecastHour: hour } : {}),
    };
  }
  const url = `${COOPS_PRED}?product=predictions&application=bluewaterintel`
    + `&begin_date=${encodeURIComponent(coopsDate(targetMs - 3 * 3600 * 1000))}`
    + `&end_date=${encodeURIComponent(coopsDate(targetMs + 3 * 3600 * 1000))}`
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
    for (const sl of slopes) { const dd = Math.abs(sl.tMid - targetMs); if (dd < bd) { bd = dd; cur = sl; } }
    const value = Math.min(1, Math.abs(cur.s) / maxSlope);
    const state = cur.s > maxSlope * 0.1 ? "rising" : cur.s < -maxSlope * 0.1 ? "falling" : "slack";
    const validAtMs = Math.round(cur.tMid);
    tideCache.set(cacheKey, { atMs: now, value, state, validAtMs });
    return {
      value,
      state,
      station: best.id,
      observedAtMs: validAtMs,
      ...(hour > 0 ? { _forecast: true, forecastHour: hour } : {}),
    };
  } catch {
    return none;
  }
}

// Per-point lookback windows (module-level so batch + point modes share them).
const SST_LOOKBACK = Number(Deno.env.get("SST_LOOKBACK") ?? "3");
// Gap-filled VIIRS DINEOF chlor: prefer the newest ERDDAP slice (lookback 0),
// stepping back only if that slice is not posted yet. CHL_MAX_LOOKBACK caps retries.
const CHL_MAX_LOOKBACK = Number(Deno.env.get("CHL_MAX_LOOKBACK") ?? "2");

async function fetchChlorPoint(lat: number, lng: number) {
  for (let lb = 0; lb <= CHL_MAX_LOOKBACK; lb++) {
    const hit = await fetchGridPoint(CHL_ERDDAP, CHL_DATASET, CHL_VAR, lat, lng, CHL_HAS_ALTITUDE, lb);
    if (hit.value != null) return hit;
  }
  return { value: null, observedAtMs: null };
}

// Assemble one point's full ocean payload from the real sources. Used by both
// the single-point GET and the batched predictinputs mode so values are IDENTICAL
// regardless of how they're requested.
// Apply Open-Meteo forecast wind/pressure/air for a future hour. When hoursAhead
// is 0 the caller uses buoy observations instead — never mix current obs into a
// forecast request (that would misrepresent the selected time).
function forecastWeatherFields(model: ModelWindRec, marine: MarineRec | null, hoursAhead: number) {
  const fh = Math.round(clamp(hoursAhead, 0, 96) / 3) * 3;
  const mark = <T extends { value: number | null; observedAtMs: number | null }>(f: T) =>
    ({ ...f, _forecast: true, forecastHour: fh });
  return {
    forecastHour: fh,
    wind: (model.wind.value != null && model.wind.dir != null)
      ? mark(model.wind)
      : { value: null, dir: null, observedAtMs: null },
    airTemp: model.airTemp.value != null ? mark(model.airTemp) : { value: null, observedAtMs: null },
    pressure: model.pressure.value != null ? mark(model.pressure) : { value: null, observedAtMs: null },
    barometer: model.barometer.value != null ? mark(model.barometer) : { value: null, observedAtMs: null },
    waves: marine?.waves?.value != null
      ? { ...marine.waves, _forecast: true, forecastHour: fh }
      : { value: null, periodS: null, observedAtMs: null },
    waterTemp: { value: null, observedAtMs: null },
    sources: { wind: model.source, waves: marine?.source ?? "open-meteo-marine" },
  };
}

async function assembleOcean(lat: number, lng: number, hoursAhead = 0) {
  const useForecast = hoursAhead > 0;
  const [buoy, sst, chlorRaw, tide, buoyTemps, model, marine, current] = await Promise.all([
    useForecast ? Promise.resolve(null) : fetchBuoy(lat, lng),
    fetchGridPoint(SST_ERDDAP, SST_DATASET, SST_VAR, lat, lng, SST_HAS_ALTITUDE, SST_LOOKBACK),
    fetchChlorPoint(lat, lng),
    fetchTide(lat, lng, hoursAhead),
    buoyWtmpList(),
    fetchModelWind(lat, lng, hoursAhead),
    fetchModelMarine(lat, lng, hoursAhead),
    fetchCurrentPoint(lat, lng, hoursAhead),
  ]);
  // Gridded SST (MUR, °F) is the base; convert units (MUR analysed_sst is Kelvin).
  let gridSstF: SstSrc = { value: null, observedAtMs: sst.observedAtMs };
  if (sst.value != null) {
    let c = sst.value;
    if (c > 200) c = c - 273.15;
    gridSstF = { value: Math.round((c * 9 / 5 + 32) * 10) / 10, observedAtMs: sst.observedAtMs };
  }
  // Correct the grid with the nearest live buoy (distance/freshness weighted).
  const buoySst = nearestBuoySst(lat, lng, buoyTemps);
  const sstF = blendSst(gridSstF, buoySst);
  const wx = useForecast && model ? forecastWeatherFields(model, marine, hoursAhead) : null;
  const waves = wx ? wx.waves : pickWaves(buoy?.waves, marine);
  return {
    point: { lat, lng },
    fetchedAtMs: Date.now(),
    ...(wx ? { forecastHour: wx.forecastHour } : {}),
    sst: sstF,
    chlor: { value: chlorRaw.value, observedAtMs: chlorRaw.observedAtMs },
    wind: wx ? wx.wind : (buoy?.wind ?? { value: null, observedAtMs: null }),
    waves,
    waterTemp: wx ? wx.waterTemp : (buoy?.waterTemp ?? { value: null, observedAtMs: null }),
    airTemp: wx ? wx.airTemp : (buoy?.airTemp ?? { value: null, observedAtMs: null }),
    pressure: wx ? wx.pressure : (buoy?.pressure ?? { value: null, observedAtMs: null }),
    barometer: wx ? wx.barometer : (buoy?.barometer ?? { value: null, observedAtMs: null }),
    tide: tidePayload(tide),
    current,
    sources: {
      sst: SST_DATASET,
      sstBuoy: buoySst ? { nm: Math.round(buoySst.distNm), observedAtMs: buoySst.observedAtMs } : null,
      chlor: CHL_DATASET,
      buoy: buoy ? { id: buoy.buoyId, nm: buoy.buoyNm } : null,
      tide: tide.station,
      waves: buoy?.waves?.value != null ? `NDBC ${buoy.buoyId}` : marine.source,
      current: current ? "RTOFS ESPC-D-V02" : null,
      ...(wx?.sources ?? {}),
    },
  };
}

// High-res gridded SST (GHRSST MUR L4, 1 km daily) for a box →
// { stepDeg, rows:[[lat,lng,°F,observedAtMs],…] }. We request the last few daily
// slices and keep, per cell, the FRESHEST real (non-fill) value with its real
// observation time — i.e. step back day-by-day until that cell has valid data,
// rather than trusting one fixed slice. MUR is the high-res source that resolves
// sharp fronts (Gulf Stream wall) that coarse products smear. Units: analysed_sst
// is Kelvin → converted to °F to match the app. Never synthesized.
async function fetchSstRows(latMin: number, latMax: number, lngMin: number, lngMax: number) {
  const a0 = Math.min(latMin, latMax), a1 = Math.max(latMin, latMax);
  const o0 = Math.min(lngMin, lngMax), o1 = Math.max(lngMin, lngMax);
  const native = Number(Deno.env.get("SST_STEP_DEG") ?? "0.01");
  const targetDeg = Number(Deno.env.get("SSTGRID_DEG") ?? "0.05");
  const strideIdx = Math.max(1, Math.round(targetDeg / native));
  const lookback = Math.max(0, Number(Deno.env.get("SSTGRID_LOOKBACK") ?? "4"));
  const altIdx = SST_HAS_ALTITUDE ? "%5B(0.0)%5D" : "";
  const timeIdx = lookback > 0 ? `%5Blast-${lookback}:last%5D` : "%5B(last)%5D";
  const url = `${SST_ERDDAP}/${SST_DATASET}.json`
    + `?${SST_VAR}${timeIdx}${altIdx}`
    + `%5B(${a0}):${strideIdx}:(${a1})%5D%5B(${o0}):${strideIdx}:(${o1})%5D`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: ERDDAP_HEADERS });
    if (!r.ok) return { stepDeg: strideIdx * native, rows: [] as unknown[][] };
    const d = await r.json();
    const cols: string[] = d?.table?.columnNames ?? [];
    const rawRows: unknown[][] = d?.table?.rows ?? [];
    const ti = cols.indexOf("time"), li = cols.indexOf("latitude"), gi = cols.indexOf("longitude"), vi = cols.indexOf(SST_VAR);
    // Freshest non-fill value per cell across the lookback window.
    const best = new Map<string, { lat: number; lng: number; f: number; ms: number }>();
    for (const row of rawRows) {
      let c = num(row[vi]);
      if (c == null) continue;
      if (c > 200) c = c - 273.15;            // Kelvin → C
      const f = Math.round((c * 9 / 5 + 32) * 10) / 10;
      const la = num(row[li]), ln = num(row[gi]);
      if (la == null || ln == null) continue;
      const ms = ti >= 0 && typeof row[ti] === "string" ? Date.parse(row[ti] as string) : 0;
      const k = `${la.toFixed(3)},${ln.toFixed(3)}`;
      const cur = best.get(k);
      if (!cur || ms > cur.ms) best.set(k, { lat: la, lng: ln, f, ms });
    }
    const rows = [...best.values()].map((c) =>
      [Math.round(c.lat * 1000) / 1000, Math.round(c.lng * 1000) / 1000, c.f, c.ms || null]);
    return { stepDeg: strideIdx * native, rows };
  } catch {
    return { stepDeg: strideIdx * native, rows: [] as unknown[][] };
  }
}

// Light field point: buoy (wind/waves/temps/pressure) + tide only. SST and
// chlorophyll come from their grids, so we skip the per-point ERDDAP calls here.
async function assembleFieldPoint(lat: number, lng: number, hoursAhead = 0) {
  if (hoursAhead > 0) {
    const [model, marine, tide] = await Promise.all([
      fetchModelWind(lat, lng, hoursAhead),
      fetchModelMarine(lat, lng, hoursAhead),
      fetchTide(lat, lng, hoursAhead),
    ]);
    const wx = forecastWeatherFields(model, marine, hoursAhead);
    return {
      point: { lat, lng },
      fetchedAtMs: Date.now(),
      forecastHour: wx.forecastHour,
      sst: { value: null, observedAtMs: null },
      chlor: { value: null, observedAtMs: null },
      wind: wx.wind,
      waves: wx.waves,
      waterTemp: wx.waterTemp,
      airTemp: wx.airTemp,
      pressure: wx.pressure,
      barometer: wx.barometer,
      tide: tidePayload(tide),
      sources: { ...wx.sources, tide: tide.station },
    };
  }
  const [buoy, marine, tide] = await Promise.all([
    fetchBuoy(lat, lng),
    fetchModelMarine(lat, lng, 0),
    fetchTide(lat, lng, hoursAhead),
  ]);
  return {
    point: { lat, lng },
    fetchedAtMs: Date.now(),
    sst: { value: null, observedAtMs: null },
    chlor: { value: null, observedAtMs: null },
    wind: buoy?.wind ?? { value: null, observedAtMs: null },
    waves: pickWaves(buoy?.waves, marine),
    waterTemp: buoy?.waterTemp ?? { value: null, observedAtMs: null },
    airTemp: buoy?.airTemp ?? { value: null, observedAtMs: null },
    pressure: buoy?.pressure ?? { value: null, observedAtMs: null },
    barometer: buoy?.barometer ?? { value: null, observedAtMs: null },
    tide: tidePayload(tide),
    sources: {
      buoy: buoy ? { id: buoy.buoyId, nm: buoy.buoyNm } : null,
      waves: buoy?.waves?.value != null ? `NDBC ${buoy.buoyId}` : marine.source,
      tide: tide.station,
    },
  };
}

// ETOPO bathymetry grid for a box → { stepDeg, rows:[[lat,lng,depthM],…] }.
// US coastal boxes prefer NOAA CUDEM (1/9 arc-sec, BlueTopo source data); ETOPO
// fills gaps offshore, outside CUDEM coverage, or when a tile is unavailable.
type BathyOut = { stepDeg: number; rows: unknown[][]; source?: string };

function bboxOverlapsCudem(latMin: number, latMax: number, lngMin: number, lngMax: number) {
  const a0 = Math.min(latMin, latMax), a1 = Math.max(latMin, latMax);
  const o0 = Math.min(lngMin, lngMax), o1 = Math.max(lngMin, lngMax);
  return a1 >= CUDEM_BOUNDS.latMin && a0 <= CUDEM_BOUNDS.latMax
    && o1 >= CUDEM_BOUNDS.lngMin && o0 <= CUDEM_BOUNDS.lngMax;
}

function cudemTileName(latSouth: number, lngWest: number) {
  const latTag = Math.round((latSouth + CUDEM_TILE_DEG) * 100);
  const nLat = Math.floor(latTag / 100);
  const xLat = latTag % 100;
  const lngTag = Math.round(Math.abs(lngWest) * 100);
  const wLng = Math.floor(lngTag / 100);
  const xLng = lngTag % 100;
  return `n${nLat}x${String(xLat).padStart(2, "0")}_w${wLng}x${String(xLng).padStart(2, "0")}`;
}

function cudemTilesForBBox(latMin: number, latMax: number, lngMin: number, lngMax: number) {
  const a0 = Math.min(latMin, latMax), a1 = Math.max(latMin, latMax);
  const o0 = Math.min(lngMin, lngMax), o1 = Math.max(lngMin, lngMax);
  const tiles: { id: string; latSouth: number; lngWest: number }[] = [];
  const latStart = Math.floor(a0 / CUDEM_TILE_DEG) * CUDEM_TILE_DEG;
  const lngStart = Math.floor(o0 / CUDEM_TILE_DEG) * CUDEM_TILE_DEG;
  for (let la = latStart; la < a1; la += CUDEM_TILE_DEG) {
    for (let ln = lngStart; ln < o1; ln += CUDEM_TILE_DEG) {
      tiles.push({ id: cudemTileName(la, ln), latSouth: la, lngWest: ln });
    }
  }
  return tiles;
}

function parseCudemNcss(buf: ArrayBuffer): { lats: number[]; lons: number[]; z: number[] } | null {
  try {
    const reader = new NetCDFReader(new Uint8Array(buf));
    const lats = reader.getDataVariable("lat") as number[];
    const lons = reader.getDataVariable("lon") as number[];
    const zRaw = reader.getDataVariable("z") as number[];
    if (!lats?.length || !lons?.length || !zRaw?.length) return null;
    return { lats, lons, z: zRaw };
  } catch {
    return null;
  }
}

const cudemTileCache = new Map<string, { atMs: number; p: Promise<unknown[][]> }>();
async function fetchCudemTileRows(
  tile: { id: string; latSouth: number; lngWest: number },
  latMin: number, latMax: number, lngMin: number, lngMax: number,
  horizStride: number,
): Promise<unknown[][]> {
  const a0 = Math.max(latMin, tile.latSouth);
  const a1 = Math.min(latMax, tile.latSouth + CUDEM_TILE_DEG);
  const o0 = Math.max(lngMin, tile.lngWest);
  const o1 = Math.min(lngMax, tile.lngWest + CUDEM_TILE_DEG);
  if (a0 >= a1 || o0 >= o1) return [];
  const key = `${tile.id},${a0.toFixed(3)},${a1.toFixed(3)},${o0.toFixed(3)},${o1.toFixed(3)},${horizStride}`;
  const now = Date.now();
  const hit = cudemTileCache.get(key);
  if (hit && now - hit.atMs < 7 * 24 * 3600 * 1000) return hit.p;

  const p = (async () => {
    const q = `var=z&north=${a1}&south=${a0}&west=${o0}&east=${o1}`
      + `&horizStride=${horizStride}&accept=netcdf`;
    for (const ver of CUDEM_VERSIONS) {
      const url = `${CUDEM_NCSS}/ncei19_${tile.id}_${ver}.nc?${q}`;
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(22000), headers: ERDDAP_HEADERS });
        if (!r.ok) continue;
        const parsed = parseCudemNcss(await r.arrayBuffer());
        if (!parsed) continue;
        const rows: unknown[][] = [];
        for (let i = 0; i < parsed.lats.length; i++) {
          for (let j = 0; j < parsed.lons.length; j++) {
            const z = num(parsed.z[i * parsed.lons.length + j]);
            if (z == null) continue;
            const depth = z < 0 ? Math.round(-z * 10) / 10 : 0;
            rows.push([
              Math.round(parsed.lats[i] * 10000) / 10000,
              Math.round(parsed.lons[j] * 10000) / 10000,
              depth,
            ]);
          }
        }
        if (rows.length) return rows;
      } catch { /* try next version */ }
    }
    return [];
  })();
  cudemTileCache.set(key, { atMs: now, p });
  return p;
}

async function fetchCudemRows(latMin: number, latMax: number, lngMin: number, lngMax: number): Promise<BathyOut | null> {
  if (!bboxOverlapsCudem(latMin, latMax, lngMin, lngMax)) return null;
  const a0 = Math.min(latMin, latMax), a1 = Math.max(latMin, latMax);
  const o0 = Math.min(lngMin, lngMax), o1 = Math.max(lngMin, lngMax);
  const CAP = 12000;
  const TARGETS = [0.005, 0.01, 0.02, 0.03, 0.05, 0.08];
  let targetStep = TARGETS[TARGETS.length - 1];
  for (const s of TARGETS) {
    const n = (Math.floor((a1 - a0) / s) + 1) * (Math.floor((o1 - o0) / s) + 1);
    if (n <= CAP) { targetStep = s; break; }
  }
  const horizStride = Math.max(1, Math.round(targetStep / CUDEM_NATIVE_STEP));
  const tiles = cudemTilesForBBox(a0, a1, o0, o1);
  const parts = await pool(tiles, 4, (t) => fetchCudemTileRows(t, a0, a1, o0, o1, horizStride));
  const byKey = new Map<string, unknown[]>();
  for (const part of parts) {
    for (const row of part) {
      byKey.set(`${(row[0] as number).toFixed(4)},${(row[1] as number).toFixed(4)}`, row);
    }
  }
  if (!byKey.size) return null;
  return {
    stepDeg: Math.round(horizStride * CUDEM_NATIVE_STEP * 10000) / 10000,
    rows: [...byKey.values()],
    source: "CUDEM",
  };
}

async function fetchEtopoRows(latMin: number, latMax: number, lngMin: number, lngMax: number): Promise<BathyOut> {
  const a0 = Math.max(-89, Math.min(latMin, latMax));
  const a1 = Math.min(89, Math.max(latMin, latMax));
  const o0 = Math.max(-179, Math.min(lngMin, lngMax));
  const o1 = Math.min(179, Math.max(lngMin, lngMax));
  const strideIdx = Math.max(1, Math.round(0.05 / ETOPO_STEP_DEG));
  const url = `${ETOPO_ERDDAP}/${ETOPO_DATASET}.json`
    + `?altitude%5B(${a0}):${strideIdx}:(${a1})%5D%5B(${o0}):${strideIdx}:(${o1})%5D`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: ERDDAP_HEADERS });
    if (!r.ok) return { stepDeg: strideIdx * ETOPO_STEP_DEG, rows: [] as unknown[][], source: "ETOPO" };
    const d = await r.json();
    const cols: string[] = d?.table?.columnNames ?? [];
    const rawRows: unknown[][] = d?.table?.rows ?? [];
    const li = cols.indexOf("latitude"), gi = cols.indexOf("longitude"), ai = cols.indexOf("altitude");
    const rows = rawRows.map((row) => {
      const la = num(row[li]), ln = num(row[gi]), alt = num(row[ai]);
      if (la == null || ln == null) return null;
      const depth = alt != null ? Math.max(0, -alt) : null;
      return [Math.round(la * 1000) / 1000, Math.round(ln * 1000) / 1000, depth];
    }).filter(Boolean) as unknown[][];
    return { stepDeg: strideIdx * ETOPO_STEP_DEG, rows, source: "ETOPO" };
  } catch {
    return { stepDeg: strideIdx * ETOPO_STEP_DEG, rows: [] as unknown[][], source: "ETOPO" };
  }
}

async function fetchBathyRows(latMin: number, latMax: number, lngMin: number, lngMax: number): Promise<BathyOut> {
  const [cudem, etopo] = await Promise.all([
    fetchCudemRows(latMin, latMax, lngMin, lngMax),
    fetchEtopoRows(latMin, latMax, lngMin, lngMax),
  ]);
  if (!cudem?.rows?.length) return etopo;
  const byKey = new Map<string, unknown[]>();
  for (const row of etopo.rows) {
    byKey.set(`${(row[0] as number).toFixed(3)},${(row[1] as number).toFixed(3)}`, row);
  }
  for (const row of cudem.rows) {
    byKey.set(`${(row[0] as number).toFixed(4)},${(row[1] as number).toFixed(4)}`, row);
  }
  return {
    stepDeg: cudem.stepDeg,
    rows: [...byKey.values()],
    source: "CUDEM+ETOPO",
  };
}

// Chlorophyll spatial grid for a box — freshest real value per cell.
async function fetchChlorRowsWithLookback(
  latMin: number, latMax: number, lngMin: number, lngMax: number, lookback: number,
) {
  const a0 = Math.min(latMin, latMax), a1 = Math.max(latMin, latMax);
  const o0 = Math.min(lngMin, lngMax), o1 = Math.max(lngMin, lngMax);
  const native = Number(Deno.env.get("CHL_STEP_DEG") ?? "0.0417"); // DINEOF NRT ~4km grid
  const targetDeg = Number(Deno.env.get("CHLGRID_DEG") ?? "0.08");
  const strideIdx = Math.max(1, Math.round(targetDeg / native));
  const altIdx = CHL_HAS_ALTITUDE ? "%5B(0.0)%5D" : "";
  const timeIdx = lookback > 0 ? `%5Blast-${lookback}:last%5D` : "%5B(last)%5D";
  const url = `${CHL_ERDDAP}/${CHL_DATASET}.json`
    + `?${CHL_VAR}${timeIdx}${altIdx}`
    + `%5B(${a1}):${strideIdx}:(${a0})%5D%5B(${o0}):${strideIdx}:(${o1})%5D`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: ERDDAP_HEADERS });
    if (!r.ok) return { stepDeg: strideIdx * native, rows: [] as unknown[][] };
    const d = await r.json();
    const cols: string[] = d?.table?.columnNames ?? [];
    const rawRows: unknown[][] = d?.table?.rows ?? [];
    const ti = cols.indexOf("time"), li = cols.indexOf("latitude"), gi = cols.indexOf("longitude"), vi = cols.indexOf(CHL_VAR);
    const best = new Map<string, { lat: number; lng: number; v: number; ms: number }>();
    for (const row of rawRows) {
      const v = num(row[vi]);
      if (v == null) continue;
      const la = num(row[li]), ln = num(row[gi]);
      if (la == null || ln == null) continue;
      const ms = ti >= 0 && typeof row[ti] === "string" ? Date.parse(row[ti] as string) : 0;
      const k = `${la.toFixed(3)},${ln.toFixed(3)}`;
      const cur = best.get(k);
      if (!cur || ms > cur.ms) best.set(k, { lat: la, lng: ln, v, ms });
    }
    const rows = [...best.values()].map((c) => [c.lat, c.lng, Math.round(c.v * 1000) / 1000, c.ms]);
    return { stepDeg: strideIdx * native, rows };
  } catch {
    return { stepDeg: strideIdx * native, rows: [] as unknown[][] };
  }
}

async function fetchChlorRows(latMin: number, latMax: number, lngMin: number, lngMax: number) {
  const maxLb = Number(Deno.env.get("CHLGRID_MAX_LOOKBACK") ?? String(CHL_MAX_LOOKBACK));
  let last = { stepDeg: Number(Deno.env.get("CHL_STEP_DEG") ?? "0.0417"), rows: [] as unknown[][] };
  for (let lb = 0; lb <= maxLb; lb++) {
    const out = await fetchChlorRowsWithLookback(latMin, latMax, lngMin, lngMax, lb);
    last = out;
    if (out.rows.length > 0) return out;
  }
  return last;
}

// Run an async task over items with bounded concurrency.
async function pool<T, R>(items: T[], limit: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const u = new URL(req.url);
  const mode = u.searchParams.get("mode") || "ocean";

  // ── Real bathymetry grid (CUDEM + ETOPO) for a bounding box ────────────────
  // Returns a coarse grid of real depths so the prediction engine can place
  // species on the correct shelf/break depth instead of a static estimate.
  if (mode === "bathy") {
    const latMin = num(u.searchParams.get("latMin"));
    const latMax = num(u.searchParams.get("latMax"));
    const lngMin = num(u.searchParams.get("lngMin"));
    const lngMax = num(u.searchParams.get("lngMax"));
    if (latMin == null || latMax == null || lngMin == null || lngMax == null) {
      return json({ error: "latMin,latMax,lngMin,lngMax required" }, 400);
    }
    const out = await fetchBathyRows(latMin, latMax, lngMin, lngMax);
    return new Response(JSON.stringify(out), {
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=604800" },
    });
  }

  // ── RTOFS surface current grid for a bounding box (one request, cached) ─────
  if (mode === "currentgrid") {
    const latMin = num(u.searchParams.get("latMin"));
    const latMax = num(u.searchParams.get("latMax"));
    const lngMin = num(u.searchParams.get("lngMin"));
    const lngMax = num(u.searchParams.get("lngMax"));
    if (latMin == null || latMax == null || lngMin == null || lngMax == null) {
      return json({ error: "latMin,latMax,lngMin,lngMax required" }, 400);
    }
    const hoursAhead = num(u.searchParams.get("hours")) ?? 0;
    const out = await fetchCurrentGrid(latMin, latMax, lngMin, lngMax, hoursAhead);
    if (!out) return json({ error: "Current data unavailable" }, 502);
    return new Response(JSON.stringify(out), {
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=7200" },
    });
  }

  // ── Gridded wind field for a bounding box (one request, cached) ────────────
  // A fixed-resolution wind grid the client renders identically at every zoom —
  // Windy-style stability — instead of re-sampling per viewport.
  if (mode === "windgrid") {
    const latMin = num(u.searchParams.get("latMin"));
    const latMax = num(u.searchParams.get("latMax"));
    const lngMin = num(u.searchParams.get("lngMin"));
    const lngMax = num(u.searchParams.get("lngMax"));
    if (latMin == null || latMax == null || lngMin == null || lngMax == null) {
      return json({ error: "latMin,latMax,lngMin,lngMax required" }, 400);
    }
    const hoursAhead = num(u.searchParams.get("hours")) ?? 0;
    const out = await fetchWindGrid(latMin, latMax, lngMin, lngMax, hoursAhead);
    return new Response(JSON.stringify({ ...out, hour: Math.round(clamp(hoursAhead, 0, 96) / 3) * 3 }), {
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=900" },
    });
  }

  // ── SSH altimetry grid — sea-level anomaly + geostrophic currents ───────────
  if (mode === "altimetrygrid") {
    const latMin = num(u.searchParams.get("latMin"));
    const latMax = num(u.searchParams.get("latMax"));
    const lngMin = num(u.searchParams.get("lngMin"));
    const lngMax = num(u.searchParams.get("lngMax"));
    if (latMin == null || latMax == null || lngMin == null || lngMax == null) {
      return json({ error: "latMin,latMax,lngMin,lngMax required" }, 400);
    }
    const out = await fetchAltimetryGrid(latMin, latMax, lngMin, lngMax);
    return new Response(JSON.stringify(out), {
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=21600" },
    });
  }

  // ── Chlorophyll spatial+temporal COMPOSITE grid for a bounding box ──────────
  // Satellite chlorophyll is heavily cloud-gapped on any single day/pixel. This
  // fetches a box over the last N daily slices in ONE ERDDAP request and reduces
  // it server-side to the FRESHEST real (non-null) value per cell — a gap-filled
  // composite built only from real measurements. The compact result (one row per
  // cell) is cached at the edge so the client gets dense coverage in one call.
  if (mode === "chlorgrid") {
    const latMin = num(u.searchParams.get("latMin"));
    const latMax = num(u.searchParams.get("latMax"));
    const lngMin = num(u.searchParams.get("lngMin"));
    const lngMax = num(u.searchParams.get("lngMax"));
    if (latMin == null || latMax == null || lngMin == null || lngMax == null) {
      return json({ error: "latMin,latMax,lngMin,lngMax required" }, 400);
    }
    const out = await fetchChlorRows(latMin, latMax, lngMin, lngMax);
    return new Response(JSON.stringify(out), {
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" },
    });
  }

  // ── COMBINED prediction inputs in ONE request ───────────────────────────────
  // Returns bathymetry grid + gap-filled chlorophyll composite + a batched
  // per-point ocean field (SST/wind/tide/etc), all for one bounding box. This
  // collapses what used to be ~90 per-point requests plus 2 grid requests into a
  // SINGLE cached call. Every value is produced by the exact same source/logic as
  // the per-point endpoint, so accuracy is unchanged — only transport + caching.
  if (mode === "predictinputs") {
    const latMin = num(u.searchParams.get("latMin"));
    const latMax = num(u.searchParams.get("latMax"));
    const lngMin = num(u.searchParams.get("lngMin"));
    const lngMax = num(u.searchParams.get("lngMax"));
    if (latMin == null || latMax == null || lngMin == null || lngMax == null) {
      return json({ error: "latMin,latMax,lngMin,lngMax required" }, 400);
    }
    const maxPoints = Math.max(20, Math.min(120, Math.round(num(u.searchParams.get("maxPoints")) ?? 90)));
    const hoursAhead = num(u.searchParams.get("hours")) ?? 0;
    const forecastHour = Math.round(clamp(hoursAhead, 0, 96) / 3) * 3;
    // All three grids in parallel (each ONE ERDDAP box request). Bathy also tells
    // us which field points are water so we don't fetch buoy/tide over land.
    const [bathy, chlor, sstGrid, buoyTemps, currentGrid] = await Promise.all([
      fetchBathyRows(latMin, latMax, lngMin, lngMax),
      fetchChlorRows(latMin, latMax, lngMin, lngMax),
      fetchSstRows(latMin, latMax, lngMin, lngMax),
      buoyWtmpList(),
      fetchCurrentGrid(latMin, latMax, lngMin, lngMax, hoursAhead),
    ]);
    // Correct the high-res SST grid with the nearest live buoy per cell (distance/
    // freshness weighted). Buoys are prefetched once and shared, so this adds no
    // upstream requests. Row shape stays [lat,lng,°F,observedAtMs] for the client.
    const sst = {
      stepDeg: sstGrid.stepDeg,
      rows: (sstGrid.rows as number[][]).map((row) => {
        const b = nearestBuoySst(row[0], row[1], buoyTemps);
        const out = blendSst({ value: row[2], observedAtMs: (row[3] as number) ?? null }, b);
        return [row[0], row[1], out.value, out.observedAtMs];
      }),
    };
    // Pick water field points (depth > 0) spread across the box, capped. These
    // only carry wind/tide (buoy + CO-OPS) — SST/chlor come from the grids.
    const water = (bathy.rows as number[][]).filter((r) => typeof r[2] === "number" && (r[2] as number) > 0);
    let fieldPts: number[][] = water;
    if (water.length > maxPoints) {
      const step = water.length / maxPoints;
      fieldPts = Array.from({ length: maxPoints }, (_, i) => water[Math.floor(i * step)]);
    }
    const fieldStepNm = fieldPts.length > 1
      ? Math.max(4, (Math.max(latMax, latMin) - Math.min(latMax, latMin)) * 60 / Math.sqrt(fieldPts.length))
      : 12;
    const field = await pool(fieldPts, 16, async (pt) => {
      const p = await assembleFieldPoint(pt[0], pt[1], hoursAhead);
      const cur = sampleCurrentFromGrid(currentGrid, pt[0], pt[1]);
      return { la: pt[0], ln: pt[1], p: { ...p, current: cur } };
    });
    return new Response(JSON.stringify({ bathy, chlor, sst, field, fieldStepNm, forecastHour }), {
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" },
    });
  }

  // Point modes (ocean/wind) require coordinates.
  const lat = num(u.searchParams.get("lat"));
  const lng = num(u.searchParams.get("lng"));
  if (lat == null || lng == null) return json({ error: "lat and lng required" }, 400);
  const hoursAhead = num(u.searchParams.get("hours")) ?? 0;

  if (mode === "wind") {
    const model = await fetchModelWind(lat, lng, hoursAhead);
    return new Response(JSON.stringify({
      point: { lat, lng },
      fetchedAtMs: Date.now(),
      forecastHour: Math.round(clamp(hoursAhead, 0, 96) / 3) * 3,
      wind: model.wind,
      airTemp: model.airTemp,
      pressure: model.pressure,
      barometer: model.barometer,
      sst: { value: null, observedAtMs: null },
      chlor: { value: null, observedAtMs: null },
      waves: { value: null, observedAtMs: null },
      waterTemp: { value: null, observedAtMs: null },
      tide: { value: null, state: null, observedAtMs: null },
      sources: { wind: model.source },
    }), {
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=900" },
    });
  }

  // Single point — identical data to the batched predictinputs field.
  const payload = await assembleOcean(lat, lng, hoursAhead);
  // Cache at the edge for 30 min (these feeds update hourly at most).
  return new Response(JSON.stringify(payload), {
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" },
  });
};

// Serve only when run as the entry module (Supabase edge runtime). Guarding this
// lets the pure helpers (blendSst, nearestBuoySst) be imported by tests without
// starting a server.
if (import.meta.main) Deno.serve(handler);
