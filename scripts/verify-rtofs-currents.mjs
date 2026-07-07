#!/usr/bin/env node
/**
 * Verify RTOFS surface current integration against the Hatteras box and Gulf Stream point.
 * Run: node scripts/verify-rtofs-currents.mjs
 */
import { NetCDFReader } from "netcdfjs";

const MS_TO_KT = 1.943844;
const RTOFS_NCSS = "https://ncss.hycom.org/thredds/ncss/grid/FMRC_ESPC-D-V02_uv3z/FMRC_ESPC-D-V02_uv3z_best.ncd";
const RTOFS_DODS = "https://tds.hycom.org/thredds/dodsC/FMRC_ESPC-D-V02_uv3z/FMRC_ESPC-D-V02_uv3z_best.ncd";
const RTOFS_FILL = 1.26765e30;
const RTOFS_NATIVE_STEP = 1 / 12;

function isCurrentVal(v) {
  return v != null && Number.isFinite(v) && Math.abs(v) < RTOFS_FILL * 0.1;
}
function lon360To180(lon) { return lon > 180 ? lon - 360 : lon; }
function currentFromUv(u, v) {
  const driftKts = Math.round(Math.sqrt(u * u + v * v) * MS_TO_KT * 100) / 100;
  const setDeg = Math.round((Math.atan2(u, v) * 180 / Math.PI + 360) % 360);
  return { driftKts, setDeg, u, v };
}

async function getRtofsTimeAxis() {
  const [dasR, timeR] = await Promise.all([
    fetch(`${RTOFS_DODS}.das`),
    fetch(`${RTOFS_DODS}.ascii?time`),
  ]);
  const das = await dasR.text();
  const units = das.match(/time\s*\{[^}]*units\s+"hours since ([^"]+)"/s)?.[1];
  const epochMs = Date.parse(units.replace(" UTC", "Z").replace(".000", ""));
  const body = await timeR.text();
  const m = body.match(/time\[\d+\]\s*\n([\s\S]+)/);
  const hours = m[1].split(",").map((x) => parseFloat(x.trim())).filter((h) => Number.isFinite(h));
  return { epochMs, hours };
}

async function resolveRtofsValidTimeIso() {
  const axis = await getRtofsTimeAxis();
  const targetMs = Date.now();
  let best = axis.hours[0], bestMs = axis.epochMs + best * 3600000;
  for (const h of axis.hours) {
    const ms = axis.epochMs + h * 3600000;
    if (Math.abs(ms - targetMs) < Math.abs(bestMs - targetMs)) { best = h; bestMs = ms; }
  }
  return { iso: new Date(bestMs).toISOString().replace(".000Z", "Z"), observedAtMs: bestMs };
}

async function fetchCurrentGrid(latMin, latMax, lngMin, lngMax) {
  const a0 = Math.min(latMin, latMax), a1 = Math.max(latMin, latMax);
  const o0 = Math.min(lngMin, lngMax), o1 = Math.max(lngMin, lngMax);
  const step = 0.2;
  const horizStride = Math.max(1, Math.round(step / RTOFS_NATIVE_STEP));
  const valid = await resolveRtofsValidTimeIso();
  const url = `${RTOFS_NCSS}?var=water_u&var=water_v&north=${a1}&south=${a0}&west=${o0}&east=${o1}`
    + `&horizStride=${horizStride}&time=${encodeURIComponent(valid.iso)}&accept=netcdf`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`NCSS ${r.status}`);
  const reader = new NetCDFReader(new Uint8Array(await r.arrayBuffer()));
  const lats = reader.getDataVariable("lat");
  const lons = reader.getDataVariable("lon");
  const uRaw = reader.getDataVariable("water_u");
  const vRaw = reader.getDataVariable("water_v");
  const u = [], v = [];
  for (let i = 0; i < uRaw.length; i++) {
    u.push(isCurrentVal(uRaw[i]) ? uRaw[i] : NaN);
    v.push(isCurrentVal(vRaw[i]) ? vRaw[i] : NaN);
  }
  return {
    step, minLat: lats[0], minLng: lon360To180(lons[0]), nLat: lats.length, nLng: lons.length,
    u, v, observedAtMs: valid.observedAtMs,
  };
}

function sample(grid, lat, lng) {
  const fi = (lat - grid.minLat) / grid.step;
  const fj = (lng - grid.minLng) / grid.step;
  const i0 = Math.max(0, Math.min(grid.nLat - 2, Math.floor(fi)));
  const j0 = Math.max(0, Math.min(grid.nLng - 2, Math.floor(fj)));
  const di = Math.max(0, Math.min(1, fi - i0)), dj = Math.max(0, Math.min(1, fj - j0));
  const idx = (i, j) => i * grid.nLng + j;
  const w = (a, b, c, d) => (1 - di) * (1 - dj) * a + di * (1 - dj) * b + (1 - di) * dj * c + di * dj * d;
  const u = w(grid.u[idx(i0, j0)], grid.u[idx(i0 + 1, j0)], grid.u[idx(i0, j0 + 1)], grid.u[idx(i0 + 1, j0 + 1)]);
  const vv = w(grid.v[idx(i0, j0)], grid.v[idx(i0 + 1, j0)], grid.v[idx(i0, j0 + 1)], grid.v[idx(i0 + 1, j0 + 1)]);
  if (!Number.isFinite(u) || !Number.isFinite(vv)) return null;
  return currentFromUv(u, vv);
}

// Hatteras box: 33–37N, -78 to -72W
const grid = await fetchCurrentGrid(33, 37, -78, -72);
let maxKt = 0, maxCell = null, validCells = 0;
for (let i = 0; i < grid.u.length; i++) {
  if (!Number.isFinite(grid.u[i]) || !Number.isFinite(grid.v[i])) continue;
  validCells++;
  const c = currentFromUv(grid.u[i], grid.v[i]);
  if (c.driftKts > maxKt) { maxKt = c.driftKts; maxCell = c; }
}
console.log("Hatteras grid:", {
  shape: `${grid.nLat}x${grid.nLng}`, step: grid.step, validCells, maxKt, maxCell,
});
if (maxKt < 2 || maxKt > 5) {
  console.error("FAIL: expected Gulf Stream band ~2–4 kt in Hatteras box, got max", maxKt);
  process.exit(1);
}

// Gulf Stream point ~35N, 75W
const pt = sample(grid, 35, -75);
console.log("Gulf Stream point (35N, 75W):", pt);
if (!pt || pt.driftKts < 2 || pt.driftKts > 5) {
  console.error("FAIL: expected point current ~2–4 kt, got", pt);
  process.exit(1);
}
console.log("OK: RTOFS currents look valid for Hatteras / Gulf Stream.");
