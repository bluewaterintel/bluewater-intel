/* Weather-buoy layer: only moored stations NOAA still lists as deployed. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "bw-data-buoys.js"), "utf8");
const m = src.match(/window\.BW_BUOYS=(\[.*\]);/s);
if (!m) {
  console.error("bw-data-buoys.js has no BW_BUOYS array");
  process.exit(1);
}
const buoys = JSON.parse(m[1]);
const ids = new Set(buoys.map((b) => b.id));
const errors = [];

function check(label, ok) {
  if (!ok) errors.push(label);
  else console.log("ok", label);
}

const USF = ["42013", "42022", "42023", "42026", "42027", "42028"];

check("catalog is non-empty", buoys.length > 50);
check("41017 is not plotted (recovered / not in activestations)", !ids.has("41017"));
check("no duplicate station ids", ids.size === buoys.length);
for (const id of USF) {
  const b = buoys.find((x) => x.id === id);
  check(`${id} is a University of South Florida COMPS buoy`, !!b && /university of south florida/i.test(b.owner));
}
check("every buoy has coordinates", buoys.every((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng)));
check("catalog comment cites activestations.xml", src.includes("activestations.xml"));
check("historical station_table is not the source", !/station_table\.txt/.test(src));

if (errors.length) {
  console.error("FAILED");
  for (const e of errors) console.error("  • " + e);
  process.exit(1);
}
console.log(`OK: ${buoys.length} moored buoys, including ${USF.length} USF COMPS stations.`);
