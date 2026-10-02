/* Map header dropdowns sort alphabetically within each section. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBw, makeChecker } from "./load-bw.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { check, done } = makeChecker();
const { SPECIES, PORT_GROUPS, PORTS, canonicalPortName, isOnLand, isPredictWater } = loadBw([
  "SPECIES", "PORT_GROUPS", "PORTS", "canonicalPortName", "isOnLand", "isPredictWater",
]);
const { nearestCoopsTideStation } = loadBw(
  ["nearestCoopsTideStation"],
  ["bw-tide-stations.js"],
);

function nmBetween(lat1, lng1, lat2, lng2) {
  const dlat = (lat2 - lat1) * 60;
  const dlng = (lng2 - lng1) * 60 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.hypot(dlat, dlng);
}

const sortNames = (items, getName) =>
  items.slice().sort((a, b) =>
    getName(a).localeCompare(getName(b), undefined, { sensitivity: "base" }));

function isSorted(names) {
  for (let i = 1; i < names.length; i++) {
    if (names[i - 1].localeCompare(names[i], undefined, { sensitivity: "base" }) > 0) {
      return false;
    }
  }
  return true;
}

console.log("Species dropdown order (by category):");
for (const cat of ["offshore", "nearshore", "inshore"]) {
  const names = sortNames(
    SPECIES.filter((s) => s.cat === cat && s.id !== "all"),
    (s) => s.name
  ).map((s) => s.name);
  check(`${cat} species are A-Z`, isSorted(names));
  if (cat === "offshore") {
    check("Bigeye Tuna precedes Blue Marlin offshore", names.indexOf("Bigeye Tuna") < names.indexOf("Blue Marlin"));
    check("Blue Marlin precedes Bluefin Tuna offshore", names.indexOf("Blue Marlin") < names.indexOf("Bluefin Tuna"));
  }
}

console.log("\nPort dropdown order (by region):");
for (const group of PORT_GROUPS) {
  const names = sortNames(group.ports, (p) => p);
  check(`${group.label} ports are A-Z`, isSorted(names));
  if (group.label === "Mid-Atlantic") {
    check("Mid-Atlantic starts with Atlantic City", names[0] === "Atlantic City, NJ");
    check("Mid-Atlantic lists Sandy Hook", names.includes("Sandy Hook, NJ"));
    check("Mid-Atlantic no longer lists Long Beach, NY", !names.includes("Long Beach, NY"));
  }
}

const grouped = new Set(PORT_GROUPS.flatMap((g) => g.ports));
for (const name of Object.keys(PORTS)) {
  check(`${name} is in a port dropdown group`, grouped.has(name));
}
check("Long Beach, NY is not a port", !PORTS["Long Beach, NY"]);

const hook = PORTS["Sandy Hook, NJ"];
const freeport = PORTS["Freeport, NY"];
check("Sandy Hook sits on the Hook fleet basin",
  hook && hook.lat > 40.40 && hook.lat < 40.48 && hook.lng < -73.97 && hook.lng > -74.08);
check("Sandy Hook short label", hook && hook.short === "Sandy Hook");
check("Sandy Hook is a separate hub from Freeport",
  hook && freeport && nmBetween(hook.lat, hook.lng, freeport.lat, freeport.lng) > 15);
check("saved Long Beach default opens Sandy Hook",
  canonicalPortName("Long Beach, NY") === "Sandy Hook, NJ");
check("other port names are unchanged", canonicalPortName("Freeport, NY") === "Freeport, NY");

const wxLat = hook.lat + 0.05;
const wxLng = hook.lng + 0.05;
check("Sandy Hook header weather sample is water", isPredictWater(wxLat, wxLng) && !isOnLand(wxLat, wxLng));
check("ocean east of Sandy Hook is fishable water", isPredictWater(40.46, -73.85) && !isOnLand(40.46, -73.85));
check("Sandy Hook tides use the Hook station, not the Battery",
  nearestCoopsTideStation(hook.lat, hook.lng, 120) === "8531680");

const oceanSrc = readFileSync(join(ROOT, "supabase/functions/ocean/index.ts"), "utf8");
const ambrose = oceanSrc.match(/\{\s*id:\s*"44065",\s*lat:\s*([0-9.]+),\s*lng:\s*(-?[0-9.]+)/);
check("NY Harbor entrance buoy is on the ocean station list", !!ambrose);
if (ambrose && hook) {
  const nm = nmBetween(hook.lat, hook.lng, Number(ambrose[1]), Number(ambrose[2]));
  check(`Ambrose buoy is inside the Sandy Hook weather window (${nm.toFixed(1)} nm)`, nm <= 50);
}

done();
