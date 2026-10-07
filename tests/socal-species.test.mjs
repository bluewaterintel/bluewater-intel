/* September presence for Southern California, plus California halibut
   and white seabass wired through the same gates as lingcod and calico. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const {
  PORTS, SPECIES, CANYONS, ENC_SPECIES, PREDICT_SPECIES_PREFS,
  getRegionalSeasons, speciesOfferedAt, speciesAllowedAtLat,
  nearestStructureNm, briefSpeciesProfile,
} = loadBw([
  "PORTS", "SPECIES", "CANYONS", "ENC_SPECIES", "PREDICT_SPECIES_PREFS",
  "getRegionalSeasons", "speciesOfferedAt", "speciesAllowedAtLat",
  "nearestStructureNm", "briefSpeciesProfile",
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

const peak = ["San Diego, CA", "Oceanside, CA", "Dana Point, CA", "Newport Beach, CA", "San Pedro, CA", "Marina del Rey, CA"];
const shoulder = ["Ventura, CA", "Santa Barbara, CA"];

for (const name of peak) {
  check(`${name} yellowfin is a September peak`, sep("yellowfin", name) >= 2.5);
  check(`${name} dorado is a September peak`, sep("mahi", name) >= 2.5);
  check(`${name} offers Pacific bonito in September`, offered("bonito", name) && sep("bonito", name) >= 2.5);
}
for (const name of shoulder) {
  const yf = sep("yellowfin", name);
  const mahi = sep("mahi", name);
  check(`${name} yellowfin is a September shoulder`, yf >= 1.5 && yf <= 2.4);
  check(`${name} dorado is a September shoulder`, mahi >= 1.5 && mahi <= 2.4);
}

check("Morro Bay yellowfin is not offered", offered("yellowfin", "Morro Bay, CA") === false);
check("Morro Bay dorado is not offered", offered("mahi", "Morro Bay, CA") === false);
check("Monterey bonito is not offered", offered("bonito", "Monterey, CA") === false);
check("Montauk Atlantic bonito stays a September peak", sep("bonito", "Montauk, NY") >= 2.5);

for (const name of ["San Diego, CA", "San Pedro, CA", "Santa Barbara, CA", "Morro Bay, CA", "Monterey, CA"]) {
  check(`${name} offers California halibut`, offered("halibut", name) && sep("halibut", name) >= 2.5);
}
for (const name of ["San Diego, CA", "San Pedro, CA", "Santa Barbara, CA"]) {
  const w = sep("whiteseabass", name);
  check(`${name} white seabass is in season but past the spawn peak`, offered("whiteseabass", name) && w >= 1.5 && w <= 2.4);
}
check("Morro Bay white seabass is a thin edge", offered("whiteseabass", "Morro Bay, CA") && sep("whiteseabass", "Morro Bay, CA") <= 1.5);
check("Monterey does not offer white seabass", offered("whiteseabass", "Monterey, CA") === false);

for (const name of ["Venice, LA", "Key West, FL", "Hatteras, NC"]) {
  check(`${name} does not offer halibut`, offered("halibut", name) === false);
  check(`${name} does not offer white seabass`, offered("whiteseabass", name) === false);
}

check("halibut is not the Atlantic flounder id", SPECIES.find(s => s.id === "halibut").name === "California Halibut");
check("flounder encyclopedia stays summer flounder", ENC_SPECIES.find(s => s.id === "flounder").name.includes("Flounder"));

const hPrefs = PREDICT_SPECIES_PREFS.halibut;
const wPrefs = PREDICT_SPECIES_PREFS.whiteseabass;
check("halibut ideal temps cover the beach bite", hPrefs.tempIdeal[0] <= 60 && hPrefs.tempIdeal[1] >= 66);
check("halibut depth starts in the shallows and reaches outside sand", hPrefs.depthBands[0][0] <= 5 && hPrefs.depthBands[0][1] >= 45);
check("white seabass ideal is kelp water", wPrefs.tempIdeal[0] <= 60 && wPrefs.tempIdeal[1] >= 66);
check("white seabass depth covers kelp and deeper rock", wPrefs.depthBands.some(b => b[1] >= 70));

const sd = PORTS["San Diego, CA"];
check("San Diego halibut has sand structure inside 12 nm", nearestStructureNm(sd.lat, sd.lng, "halibut") <= 12);
check("San Diego white seabass has kelp structure inside 12 nm", nearestStructureNm(sd.lat, sd.lng, "whiteseabass") <= 12);
const mont = PORTS["Monterey, CA"];
check("Monterey halibut has sand structure inside 12 nm", nearestStructureNm(mont.lat, mont.lng, "halibut") <= 12);

const profile = briefSpeciesProfile("halibut", sd.lat, sd.lng);
check("captain's brief gets a halibut habitat profile", profile && profile.tempIdealF && profile.depthBandsFt && profile.baits && profile.baits.length > 0);
const wsb = briefSpeciesProfile("whiteseabass", sd.lat, sd.lng);
check("captain's brief gets a white seabass profile", wsb && /kelp/i.test(wsb.habitat || "") && wsb.baits.length > 0);

done();
