// Surveyed US coastal depth from NOAA's CUDEM / BlueTopo mosaic
// (DEM_all ImageServer). One getSamples call returns elevations for many
// points on every coast. The old per-tile NCSS names (unpadded longitude,
// var=z only, ncei19 2018–2019) 404 on most of the East Coast, Gulf, and
// Pacific, and a port box is larger than the old 64-tile skip, so the bite
// map never received a sounding and fell through to the shelf model.
//
// Elevations are metres relative to sea level (negative = water). Land and
// the shoreline come back as 0 so the client can keep heat off the beach.

function envStr(name: string, fallback: string) {
  try {
    const d = (globalThis as { Deno?: { env?: { get?: (n: string) => string | undefined } } }).Deno;
    const v = d?.env?.get?.(name);
    return v && v.length ? v : fallback;
  } catch {
    return fallback;
  }
}

export const DEM_MOSAIC_SAMPLES = envStr(
  "DEM_MOSAIC_SAMPLES",
  "https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer/getSamples",
);

export const CUDEM_BOUNDS = { latMin: 23, latMax: 52, lngMin: -127, lngMax: -65 };

// getSamples returns at most 1000 locations. Stay under that per request.
export const DEM_SAMPLE_BATCH = 900;
// Three batches, run together, stay inside the 12s wall at the speed NOAA
// answers a ~800-point sample (about 4–5s).
export const DEM_SAMPLE_CAP = 2700;
export const DEM_WALL_MS = Number(envStr("CUDEM_WALL_MS", "12000"));
export const DEM_BATCH_TIMEOUT_MS = Number(envStr("CUDEM_TILE_TIMEOUT_MS", "8000"));
const DEM_STEPS = [0.02, 0.03, 0.05, 0.06, 0.08, 0.1];

export type DemGrid = { stepDeg: number; rows: number[][]; source: "CUDEM" };

export function bboxOverlapsCudem(latMin: number, latMax: number, lngMin: number, lngMax: number) {
  const a0 = Math.min(latMin, latMax), a1 = Math.max(latMin, latMax);
  const o0 = Math.min(lngMin, lngMax), o1 = Math.max(lngMin, lngMax);
  return a1 >= CUDEM_BOUNDS.latMin && a0 <= CUDEM_BOUNDS.latMax
    && o1 >= CUDEM_BOUNDS.lngMin && o0 <= CUDEM_BOUNDS.lngMax;
}

export function axisCount(min: number, max: number, step: number) {
  if (!(step > 0) || max < min) return 0;
  return Math.floor((max - min) / step + 1e-9) + 1;
}

export function chooseDemStep(latMin: number, latMax: number, lngMin: number, lngMax: number) {
  const a0 = Math.min(latMin, latMax), a1 = Math.max(latMin, latMax);
  const o0 = Math.min(lngMin, lngMax), o1 = Math.max(lngMin, lngMax);
  let chosen = DEM_STEPS[DEM_STEPS.length - 1];
  for (const step of DEM_STEPS) {
    const n = axisCount(a0, a1, step) * axisCount(o0, o1, step);
    if (n > 0 && n <= DEM_SAMPLE_CAP) { chosen = step; break; }
  }
  return chosen;
}

export function demGridPoints(latMin: number, latMax: number, lngMin: number, lngMax: number, step: number) {
  const a0 = Math.min(latMin, latMax), a1 = Math.max(latMin, latMax);
  const o0 = Math.min(lngMin, lngMax), o1 = Math.max(lngMin, lngMax);
  const pts: { lat: number; lng: number }[] = [];
  const nLat = axisCount(a0, a1, step);
  const nLng = axisCount(o0, o1, step);
  for (let i = 0; i < nLat; i++) {
    const lat = Math.round((a0 + i * step) * 1e6) / 1e6;
    for (let j = 0; j < nLng; j++) {
      const lng = Math.round((o0 + j * step) * 1e6) / 1e6;
      pts.push({ lat, lng });
    }
  }
  return pts;
}

// Mosaic elevation (m, negative below sea level) → water depth in metres.
// Positive elevation is land. Missing / NoData stays null so a failed sample
// does not become a fake sounding.
export function elevationToDepthM(v: unknown): number | null {
  if (typeof v === "string") {
    const s = v.trim();
    if (!s || s.toLowerCase() === "nodata") return null;
    v = Number(s);
  }
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < 0) return Math.round(-v * 10) / 10;
  return 0;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const n = Math.max(1, size);
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

type Sample = { locationId?: number; value?: unknown; location?: { x?: number; y?: number } };

const demCache = new Map<string, { atMs: number; grid: DemGrid }>();

async function sampleBatch(
  pts: { lat: number; lng: number }[],
  timeoutMs: number,
): Promise<number[][]> {
  const geometry = JSON.stringify({
    points: pts.map((p) => [p.lng, p.lat]),
    spatialReference: { wkid: 4326 },
  });
  const body = new URLSearchParams({
    geometry,
    geometryType: "esriGeometryMultipoint",
    returnFirstValueOnly: "true",
    f: "json",
  });
  const r = await fetch(DEM_MOSAIC_SAMPLES, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) return [];
  const d = await r.json() as { samples?: Sample[]; error?: unknown };
  if (d?.error || !Array.isArray(d?.samples)) return [];
  const rows: number[][] = [];
  for (const s of d.samples) {
    const depth = elevationToDepthM(s?.value);
    if (depth == null) continue;
    const id = s.locationId;
    const pt = (typeof id === "number" && pts[id]) ? pts[id] : null;
    const lat = pt ? pt.lat : s.location?.y;
    const lng = pt ? pt.lng : s.location?.x;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    rows.push([Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6, depth]);
  }
  return rows;
}

export async function fetchDemMosaicRows(
  latMin: number, latMax: number, lngMin: number, lngMax: number,
): Promise<DemGrid | null> {
  if (!bboxOverlapsCudem(latMin, latMax, lngMin, lngMax)) return null;
  const step = chooseDemStep(latMin, latMax, lngMin, lngMax);
  const key = [latMin, latMax, lngMin, lngMax].map((n) => n.toFixed(3)).join(",") + `@${step}`;
  const hit = demCache.get(key);
  if (hit && Date.now() - hit.atMs < 6 * 3600 * 1000) return hit.grid;

  const pts = demGridPoints(latMin, latMax, lngMin, lngMax, step);
  if (!pts.length) return null;
  const batches = chunk(pts, DEM_SAMPLE_BATCH);
  const deadline = Date.now() + DEM_WALL_MS;
  const parts: number[][][] = new Array(batches.length);
  let next = 0;
  const conc = Math.min(3, batches.length);
  async function worker() {
    while (next < batches.length) {
      const i = next++;
      if (Date.now() >= deadline) { parts[i] = []; continue; }
      const timeoutMs = Math.max(1000, Math.min(DEM_BATCH_TIMEOUT_MS, deadline - Date.now()));
      try {
        parts[i] = await sampleBatch(batches[i], timeoutMs);
      } catch {
        parts[i] = [];
      }
    }
  }
  await Promise.all(Array.from({ length: conc }, worker));
  const rows = parts.flat().filter(Boolean);
  if (!rows.length) return null;
  const grid: DemGrid = { stepDeg: step, rows, source: "CUDEM" };
  demCache.set(key, { atMs: Date.now(), grid });
  return grid;
}
