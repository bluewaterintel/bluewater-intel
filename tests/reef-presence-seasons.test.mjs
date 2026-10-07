/* Reef/bottom fish seasons are fish presence, not harvest windows.
   Legal open dates move every year, so a species that lives on the reef all
   year must never read "out of season" just because the harvest is closed.
   The bite map's season gate caps a cell at 22% ("poor") when the regional
   value is under 0.6 and at 45% when it is under 1.2 (on the 0-3 scale), so
   these checks pin the values that keep South Atlantic red snapper visible
   during an October opening. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const {
  PORTS, PREDICT_SPECIES_PREFS, getRegionalSeasons, speciesOfferedAt, demersalBottomTempF,
} = loadBw([
  "PORTS", "PREDICT_SPECIES_PREFS", "getRegionalSeasons", "speciesOfferedAt", "demersalBottomTempF",
], [
  "bw-data-ports.js", "bw-data-species.js", "bw-data-encyclopedia.js",
  "bw-data-canyons.js", "bw-data-bathy.js", "bw-data-closures.js",
  "bw-breaks.js", "bw-core.js",
]);

const { check, done } = makeChecker();
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function curveAt(id, name) {
  const p = PORTS[name];
  return getRegionalSeasons(id, p.lat, p.lng);
}

console.log("\nSouth Atlantic red snapper is present in October:");
for (const name of ["Jacksonville, FL", "St. Augustine, FL", "Savannah, GA", "Charleston, SC", "Vero Beach, FL"]) {
  const c = curveAt("snapper", name);
  check(`${name} red snapper October is near peak (>= 2.5)`, c && c.Oct >= 2.5);
}
{
  const c = curveAt("snapper", "Morehead City, NC");
  check("Morehead City red snapper October is not capped (>= 1.2)", c && c.Oct >= 1.2);
}

console.log("\nred snapper is never zeroed by a closed season:");
for (const name of ["Morehead City, NC", "Murrells Inlet, SC", "Charleston, SC", "Savannah, GA",
                    "Jacksonville, FL", "Vero Beach, FL", "Clearwater, FL", "Destin, FL", "Galveston, TX"]) {
  const c = curveAt("snapper", name);
  check(`${name} red snapper has no zero month`, c && MONTHS.every(m => c[m] > 0));
}

console.log("\nred snapper stays out of range where there is no fishery:");
check("not offered off Portland, ME", speciesOfferedAt("snapper", 43.66, -70.25) === false);
check("not offered off San Diego, CA", speciesOfferedAt("snapper", 32.70, -117.25) === false);

console.log("\nred snapper temperature fits fall South Atlantic reefs:");
{
  const p = PREDICT_SPECIES_PREFS.snapper;
  check("red snapper working top is 85°F", p.tempWorking[1] === 85);
  // 82 ft (25 m) reef off Jacksonville under an 86°F surface.
  const bt = demersalBottomTempF(30.3, -80.9, 25, 86);
  check(`82 ft bottom under 86°F SST (${bt.toFixed(1)}°F) is inside the working band`, bt <= p.tempWorking[1]);
}

console.log("\nother reef fish follow presence, not closures:");
check("Charleston grouper has no zero month", MONTHS.every(m => curveAt("grouper", "Charleston, SC")[m] > 0));
check("Vero Beach gag has no zero month", MONTHS.every(m => curveAt("gaggrouper", "Vero Beach, FL")[m] > 0));
check("Clearwater gag has no zero month", MONTHS.every(m => curveAt("gaggrouper", "Clearwater, FL")[m] > 0));
check("Key West hogfish summer is present (>= 1.2)", ["May","Jun","Jul","Aug","Sep","Oct"].every(m => curveAt("hogfish", "Key West, FL")[m] >= 1.2));
check("Savannah amberjack October is not capped (>= 1.2)", curveAt("amberjack", "Savannah, GA").Oct >= 1.2);
{
  const hatteras = getRegionalSeasons("bluelinetile", 35.2, -75.0);
  const norfolk = getRegionalSeasons("bluelinetile", 37.4, -74.7);
  check("Hatteras blueline has no zero month", MONTHS.every(m => hatteras[m] > 0));
  check("Hatteras blueline October is near peak (>= 2.5)", hatteras.Oct >= 2.5);
  check("Norfolk Canyon blueline has no zero month", MONTHS.every(m => norfolk[m] > 0));
}

done();
