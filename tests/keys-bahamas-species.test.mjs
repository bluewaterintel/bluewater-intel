/* September presence for the Florida Keys and the Bahamas. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const { PORTS, getRegionalSeasons, speciesOfferedAt, speciesAllowedAtLat } = loadBw([
  "PORTS", "getRegionalSeasons", "speciesOfferedAt", "speciesAllowedAtLat",
], [
  "bw-data-ports.js", "bw-data-species.js", "bw-data-encyclopedia.js",
  "bw-data-canyons.js", "bw-data-bathy.js", "bw-data-closures.js",
  "bw-breaks.js", "bw-core.js",
]);
const { check, done } = makeChecker();

function sep(id, name) {
  const p = PORTS[name];
  const curve = getRegionalSeasons(id, p.lat, p.lng);
  return curve ? curve.Sep : null;
}
function offered(id, name) {
  const p = PORTS[name];
  return speciesOfferedAt(id, p.lat, p.lng);
}

for (const name of ["Islamorada, FL", "Marathon, FL", "Key West, FL"]) {
  check(`${name} yellowfin is a September peak`, sep("yellowfin", name) >= 2.5);
  check(`${name} Spanish mackerel are offered`, speciesAllowedAtLat("spanishmack", PORTS[name].lat, PORTS[name].lng));
  check(`${name} false albacore are offered`, offered("falsealbacore", name));
  check(`${name} cobia are offered`, offered("cobia", name));
  check(`${name} redfish are good, not a Gulf peak`, sep("redfish", name) >= 1.5 && sep("redfish", name) <= 2.4);
  check(`${name} trout are in the September doldrums`, sep("speckledtrout", name) <= 1.4);
  check(`${name} croaker is hidden`, offered("croaker", name) === false);
  check(`${name} hogfish stay findable`, sep("hogfish", name) >= 1.7);
}

const bahamas = ["Bimini, Bahamas", "West End, Bahamas", "Chub Cay, Bahamas", "Walker's Cay, Bahamas", "Marsh Harbour, Bahamas"];
for (const name of bahamas) {
  const p = PORTS[name];
  check(`${name} hides pompano`, speciesAllowedAtLat("pompano", p.lat, p.lng) === false);
  for (const id of ["grouper", "amberjack", "triggerfish", "lanesnap"]) {
    check(`${name} ${id} is in season`, sep(id, name) >= 2.5);
  }
  check(`${name} does not gain vermilion from the new bank region`, idSafeVermilion(name));
}
check("Bimini tarpon stays with the Keys", sep("tarpon", "Bimini, Bahamas") <= 1.4);
check("Chub Cay tarpon stays with the Keys", sep("tarpon", "Chub Cay, Bahamas") <= 1.4);
check("Walker's Cay tarpon is good, not the mullet-run peak", sep("tarpon", "Walker's Cay, Bahamas") >= 1.6 && sep("tarpon", "Walker's Cay, Bahamas") <= 2.4);
check("Marsh Harbour tarpon is covered", sep("tarpon", "Marsh Harbour, Bahamas") >= 1.6 && sep("tarpon", "Marsh Harbour, Bahamas") <= 2.4);
check("Stuart September tarpon stays a peak", sep("tarpon", "Stuart, FL") / 3 >= 0.83);
check("Naples redfish stays a Gulf peak", sep("redfish", "Naples, FL") >= 2.5);
check("Port Isabel croaker stays available", sep("croaker", "Port Isabel, TX") >= 2.5);

function idSafeVermilion(name) {
  if (name === "West End, Bahamas" || name === "Walker's Cay, Bahamas") return true;
  return sep("vermilion", name) == null;
}

done();
