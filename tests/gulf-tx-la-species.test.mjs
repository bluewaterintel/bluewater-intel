/* September bite presence for Texas and Louisiana ports.
   Scores are the regional season curve (0–3), the same number the bite map
   gates on. Out-of-range species must stay off the port menu. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const {
  PORTS, getRegionalSeasons, speciesOfferedAt, speciesAllowedAtLat,
} = loadBw([
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

const ports = ["Venice, LA", "Galveston, TX", "Port Aransas, TX", "Port Isabel, TX"];

for (const name of ports) {
  check(`${name} blackfin is in the September fishery`, sep("blackfin", name) >= 2.5);
  check(`${name} skipjack is in the September fishery`, sep("skipjack", name) >= 2.5);
  check(`${name} tarpon is a late-summer peak`, sep("tarpon", name) >= 2.5);
  check(`${name} red snapper outranks gag in September`, sep("snapper", name) > sep("gaggrouper", name));
  check(`${name} September snapper stays present into the fall blend`, sep("snapper", name) >= 2.5 && sep("snapper", name) >= (getRegionalSeasons("snapper", PORTS[name].lat, PORTS[name].lng).Oct));
  const sailCap = name.includes("TX") ? 2 : 2.7;
  check(`${name} sailfish stays under yellowfin`, sep("sailfish", name) <= sailCap && sep("sailfish", name) < sep("yellowfin", name));
  check(`${name} golden tilefish is capped and still available`, sep("tilefish", name) > 0 && sep("tilefish", name) <= 2);
  check(`${name} blueline tilefish still reaches the port`, sep("bluelinetile", name) >= 2);
  check(`${name} Spanish mackerel are allowed`, speciesAllowedAtLat("spanishmack", PORTS[name].lat, PORTS[name].lng) && sep("spanishmack", name) >= 2);
  check(`${name} false albacore stay a minor Gulf fish`, sep("falsealbacore", name) <= 1);
  const p = PORTS[name];
  for (const id of ["hogfish", "blackseabass", "bonefish", "permit", "ceromack"]) {
    check(`${name} does not offer ${id}`, speciesOfferedAt(id, p.lat, p.lng) === false);
  }
}

const pcb = PORTS["Panama City, FL"];
check("Panama City gag stays a peak", getRegionalSeasons("gaggrouper", pcb.lat, pcb.lng).Sep === 3);
check("Panama City false albacore keeps the Florida curve", getRegionalSeasons("falsealbacore", pcb.lat, pcb.lng).Sep >= 2);
const clearwater = PORTS["Clearwater, FL"];
check("Clearwater September snapper stays on the Florida season", getRegionalSeasons("snapper", clearwater.lat, clearwater.lng).Sep < 1.5);

done();
