/**
 * GIBS VIIRS chlor "today" often returns a tiny placeholder tile; yesterday is complete.
 * Ensures our min-byte probe threshold separates them (same z2/y1/x1 probe as bw-core.js).
 */
import assert from "node:assert/strict";

const CHL_GIBS_MIN_PROBE_BYTES = 8000;
const LAYER = "VIIRS_NOAA20_Chlorophyll_a";
const TILESET = "GoogleMapsCompatible_Level7";

function gibsRecentDate(daysBack) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function probeUrl(date) {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${LAYER}/default/${date}/${TILESET}/2/1/1.png`;
}

async function byteSize(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  assert.equal(res.ok, true, url);
  return (await res.arrayBuffer()).byteLength;
}

const today = gibsRecentDate(0);
const yesterday = gibsRecentDate(1);
const todayBytes = await byteSize(probeUrl(today));
const ydayBytes = await byteSize(probeUrl(yesterday));

assert.ok(
  todayBytes < CHL_GIBS_MIN_PROBE_BYTES || ydayBytes >= CHL_GIBS_MIN_PROBE_BYTES,
  `expected today (${todayBytes}B) to be partial vs yesterday (${ydayBytes}B)`,
);
console.log("gibs-chlor-probe ok", { today, todayBytes, yesterday, ydayBytes });
