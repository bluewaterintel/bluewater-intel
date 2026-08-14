/* Waypoint coast gating + radius filter (bw-core.js).

   Locks in the FL peninsula rule for charted waypoints and Major Fishing Areas:
   Naples (Gulf) must not see Atlantic-side Miami/Islamorada structure, and the
   in-range count must shrink/grow with the Distance-from-port selector. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBw, makeChecker } from "./load-bw.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const {
  PORTS, CANYONS, nmBetween, reachableFromPort,
  filterWaypointsForPort, filterWaypointsForPortAndRadius,
} = loadBw([
  "PORTS", "CANYONS", "nmBetween", "reachableFromPort",
  "filterWaypointsForPort", "filterWaypointsForPortAndRadius",
]);

const { check, done } = makeChecker();
const naples = PORTS["Naples, FL"];

console.log("\nFL peninsula coast gating — Naples must not see Atlantic structure:");
{
  const miamiSword = CANYONS.find((c) => c.name === "Miami Sword Hole");
  const atlanticPeninsula = { lat: 26.0, lng: -80.0, name: "atl-offshore" };
  check("Miami Sword Hole is on the Atlantic side of the divide",
    miamiSword && reachableFromPort(PORTS["Miami, FL"], miamiSword.lat, miamiSword.lng));
  check("Miami Sword Hole is NOT reachable from Naples",
    miamiSword && !reachableFromPort(naples, miamiSword.lat, miamiSword.lng));
  check("Atlantic peninsula structure is NOT reachable from Naples",
    !reachableFromPort(naples, atlanticPeninsula.lat, atlanticPeninsula.lng));
  const gulfSpot = { lat: 26.8, lng: -83.2, name: "west-shelf" };
  check("a Gulf-side spot IS reachable from Naples",
    reachableFromPort(naples, gulfSpot.lat, gulfSpot.lng));
}

console.log("\nradius filter grows with distance (client-side nm, not server nm field):");
{
  // Three synthetic Gulf-side points at ~40, ~90, and ~130 nm from Naples.
  const bearings = [270, 285, 300];
  const dists = [40, 90, 130];
  const rows = dists.map((nm, i) => {
    const brg = bearings[i] * Math.PI / 180;
    const dLat = (nm / 60) * Math.cos(brg);
    const dLng = (nm / 60) * Math.sin(brg) / Math.cos(naples.lat * Math.PI / 180);
    const lat = naples.lat + dLat;
    const lng = naples.lng + dLng;
    return { lat, lng, nm: 40 }; // deliberately wrong server nm — filter must ignore it
  });
  const at80 = filterWaypointsForPortAndRadius(naples, rows, 80).length;
  const at120 = filterWaypointsForPortAndRadius(naples, rows, 120).length;
  const at140 = filterWaypointsForPortAndRadius(naples, rows, 140).length;
  check("80 nm includes the near point only", at80 === 1);
  check("120 nm includes more than 80 nm", at120 > at80);
  check("140 nm includes the farthest point", at140 === 3);
}

console.log("\ncharted NDJSON snapshot — Naples counts increase with radius:");
{
  const ndjson = join(ROOT, "supabase-m1/seed/waypoints.ndjson");
  let lines;
  try { lines = readFileSync(ndjson, "utf8").trim().split("\n"); }
  catch { lines = []; }
  if(!lines.length){
    console.log("  (skip — no waypoints.ndjson)");
  } else {
    const rows = lines.map((ln) => JSON.parse(ln)).map((r) => ({
      lat: r.lat, lng: r.lng, name: r.name, t: r.type_code,
    }));
    const coast = filterWaypointsForPort(naples, rows);
    const c100 = filterWaypointsForPortAndRadius(naples, coast, 100).length;
    const c120 = filterWaypointsForPortAndRadius(naples, coast, 120).length;
    const c160 = filterWaypointsForPortAndRadius(naples, coast, 160).length;
    check("Naples @100nm has charted waypoints", c100 > 0);
    check("Naples @120nm >= @100nm", c120 >= c100);
    check("Naples @160nm >= @120nm", c160 >= c120);
    check("Naples @120nm strictly greater than @100nm (not a flat count)",
      c120 > c100);
  }
}

done();
