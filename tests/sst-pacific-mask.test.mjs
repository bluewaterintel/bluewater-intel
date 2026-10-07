/* Pacific SST land-mask helpers: the Atlantic Outer Banks barrier must not
   erase California, and CUDEM depth=0 must flag Pacific land. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const { check, done } = makeChecker();
const {
  _sstShouldPaintAtlanticBarrier,
  _sstBathySaysLand,
  isPortOutOfSpeciesRange,
} = loadBw([
  "_sstShouldPaintAtlanticBarrier",
  "_sstBathySaysLand",
  "isPortOutOfSpeciesRange",
]);

console.log("Atlantic barrier staircase is coast-gated:");
check("Oregon Inlet canvas (westLng -77) still paints the OBX barrier",
  _sstShouldPaintAtlanticBarrier(-77) === true);
check("Pacific canvas (westLng -120) does NOT paint the OBX barrier",
  _sstShouldPaintAtlanticBarrier(-120) === false);
check("west of the -98° Gulf/Pacific split does NOT paint the OBX barrier",
  _sstShouldPaintAtlanticBarrier(-99) === false);

console.log("\nPacific bathy land flag (no grid loaded → don't invent a coast):");
check("Atlantic lng is never bathy-masked here (polygons handle it)",
  _sstBathySaysLand(36.85, -75.98) === false);
check("Pacific water without a bathy grid is NOT erased",
  _sstBathySaysLand(32.72, -117.3) === false);

console.log("\nCalifornia yellowtail at San Diego is in range:");
check("San Diego + cayellowtail is NOT outside species range",
  isPortOutOfSpeciesRange("San Diego, CA", "cayellowtail") === false);
check("Miami + cayellowtail IS outside species range",
  isPortOutOfSpeciesRange("Miami, FL", "cayellowtail") === true);

done();
