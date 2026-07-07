#!/usr/bin/env node
/**
 * Verify NOAA CUDEM 1/9 arc-sec bathymetry (BlueTopo source) for the Hatteras box.
 * Run: node scripts/verify-cudem-bathy.mjs
 */
import { NetCDFReader } from "netcdfjs";

const CUDEM_NCSS = "https://www.ngdc.noaa.gov/thredds/ncss/grid/tiles/tiled_19as";
const TILE = "ncei19_n35x25_w076x00_2019v2.nc";

async function fetchCudemSubset(latMin, latMax, lngMin, lngMax, horizStride = 200) {
  const url = `${CUDEM_NCSS}/${TILE}?var=z&north=${latMax}&south=${latMin}`
    + `&west=${lngMin}&east=${lngMax}&horizStride=${horizStride}&accept=netcdf`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`NCSS ${r.status}`);
  const reader = new NetCDFReader(new Uint8Array(await r.arrayBuffer()));
  const lats = reader.getDataVariable("lat");
  const lons = reader.getDataVariable("lon");
  const zRaw = reader.getDataVariable("z");
  const rows = [];
  for (let i = 0; i < lats.length; i++) {
    for (let j = 0; j < lons.length; j++) {
      const z = zRaw[i * lons.length + j];
      if (!Number.isFinite(z)) continue;
      const depth = z < 0 ? Math.round(-z * 10) / 10 : 0;
      rows.push([lats[i], lons[j], depth]);
    }
  }
  return { lats, lons, rows };
}

function depthAt(rows, lat, lng) {
  let best = null, bestNm = Infinity;
  for (const [la, ln, d] of rows) {
    const dLat = (la - lat) * 60, dLng = (ln - lng) * 60 * Math.cos(lat * Math.PI / 180);
    const nm = Math.sqrt(dLat * dLat + dLng * dLng);
    if (nm < bestNm) { bestNm = nm; best = d; }
  }
  return best;
}

// Hatteras box crossing the coast (tile n35x25_w076x00): land + shallow shelf.
const box = await fetchCudemSubset(35.0, 35.5, -76.0, -75.75);
const water = box.rows.filter((r) => r[2] > 0);
const land = box.rows.filter((r) => r[2] === 0);
let maxDepth = 0;
for (const r of water) if (r[2] > maxDepth) maxDepth = r[2];
const shelfPt = depthAt(box.rows, 35.25, -75.85);

console.log("CUDEM tile subset:", {
  grid: `${box.lats.length}x${box.lons.length}`,
  cells: box.rows.length,
  waterCells: water.length,
  landCells: land.length,
  maxDepthM: maxDepth,
  shelfPtM: shelfPt,
});

if (water.length < 10) {
  console.error("FAIL: expected water cells in Hatteras box");
  process.exit(1);
}
if (land.length < 1) {
  console.error("FAIL: expected some land cells (depth 0)");
  process.exit(1);
}
if (maxDepth < 5) {
  console.error("FAIL: expected offshore depths > 5 m, got max", maxDepth);
  process.exit(1);
}
if (shelfPt == null || shelfPt < 1) {
  console.error("FAIL: expected positive shelf depth, got", shelfPt);
  process.exit(1);
}
console.log("OK: CUDEM bathymetry looks valid for Outer Banks.");
