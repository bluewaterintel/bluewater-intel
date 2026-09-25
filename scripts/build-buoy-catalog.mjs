#!/usr/bin/env node
/**
 * Rebuild bw-data-buoys.js from NDBC's current established-station list.
 *
 * Source: https://www.ndbc.noaa.gov/activestations.xml
 * That file is the Data Assembly Center's list of stations that are still
 * deployed. It is not the historical station_table.txt catalog (which still
 * lists recovered hulls such as 41017).
 *
 * Kept: type="buoy" (moored weather and ocean buoys, including IOOS partners
 * such as COMPS / University of South Florida). A buoy may be on station with
 * a dead sensor; those stay.
 *
 * Dropped: fixed shore stations, tsunami DART buoys, oil platforms, TAO,
 * drifting buoys, and anything farther than 150 nm from a home port
 * (same radius as the map layer in bw-core.js).
 *
 * Usage: node scripts/build-buoy-catalog.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL = "https://www.ndbc.noaa.gov/activestations.xml";
const RADIUS_NM = 150;

function nmBetween(lat1, lng1, lat2, lng2) {
  const R = 3440.065;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function loadPorts() {
  const src = readFileSync(join(root, "bw-data-ports.js"), "utf8");
  const ports = [];
  for (const m of src.matchAll(/lat:\s*([\d.-]+)\s*,\s*lng:\s*([\d.-]+)/g)) {
    ports.push({ lat: Number(m[1]), lng: Number(m[2]) });
  }
  if (!ports.length) throw new Error("No ports parsed from bw-data-ports.js");
  return ports;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : "";
}

function withinRadius(lat, lng, ports) {
  for (const p of ports) {
    if (nmBetween(p.lat, p.lng, lat, lng) <= RADIUS_NM) return true;
  }
  return false;
}

async function main() {
  const res = await fetch(URL, {
    headers: { "User-Agent": "BluewaterIntel/1.0 (+https://bluewaterintel.com)" },
  });
  if (!res.ok) throw new Error(`NDBC activestations.xml HTTP ${res.status}`);
  const xml = await res.text();
  const created = xml.match(/created="([^"]+)"/)?.[1] || "";
  const ports = loadPorts();
  const buoys = [];
  const seen = new Set();

  for (const tag of xml.matchAll(/<station\b([^>]*?)\/>/g)) {
    const s = tag[1];
    if (attr(s, "type") !== "buoy") continue;
    const id = attr(s, "id");
    const name = attr(s, "name") || id;
    const blob = `${id} ${name}`.toLowerCase();
    if (blob.includes("adrift") || blob.includes("drifting")) continue;
    const lat = Number(attr(s, "lat"));
    const lng = Number(attr(s, "lon"));
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat === 0 && lng === 0) continue;
    if (seen.has(id)) continue;
    if (!withinRadius(lat, lng, ports)) continue;
    seen.add(id);
    buoys.push({
      id,
      lat,
      lng,
      name,
      owner: attr(s, "owner") || "NDBC",
      pgm: attr(s, "pgm") || "",
    });
  }

  buoys.sort((a, b) => b.lat - a.lat || a.lng - b.lng || a.id.localeCompare(b.id));

  const header = `// Moored weather and ocean buoys Bluewater Intel can plot.
// Source: NDBC activestations.xml${created ? ` (created ${created})` : ""}.
// Only stations NOAA currently lists as deployed moored buoys (type=buoy),
// within 150 nm of a home port. Includes IOOS partners (COMPS / University
// of South Florida and others). Stations may be on station with a dead sensor.
// Rebuild: npm run build:buoys
// Informational only — not for navigation.
`;
  const body = `window.BW_BUOYS=${JSON.stringify(buoys)};\n`;
  writeFileSync(join(root, "bw-data-buoys.js"), header + body);
  const usf = buoys.filter((b) => /university of south florida/i.test(b.owner)).map((b) => b.id);
  console.log(`Wrote ${buoys.length} moored buoys. USF COMPS: ${usf.join(", ") || "(none)"}`);
  if (buoys.some((b) => b.id === "41017")) {
    throw new Error("41017 is not an active deployment and must not be in the catalog");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
