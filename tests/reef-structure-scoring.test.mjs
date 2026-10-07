/* Reef fish (snapper, grouper, AJ, …) score on distance to charted hard bottom.
   The bite map must read the full charted database plus Gulf platforms, never
   the Waypoints layer's filtered view, and open sand at the right depth must
   cap at "fair" instead of painting the whole depth band excellent. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const {
  window, PORTS, PREDICT_SPECIES_PREFS, normalizeScore, reefStructureAdjust,
  REEF_OPEN_BOTTOM_CAP, predictStructureTypeSet, chartedStructureRowsNearPort,
  collectPredictStructureCandidates, buildPredictStructureSpatialIndex,
  nearestStructureFromSpatialIndex, NE_SPECIES_PREFS, rankScoreFromRaw, cmpHotspotStable,
  speciesOfferedAt, inChesapeakeBayRegion, getRegionalSeasons,
} = loadBw([
  "window", "PORTS", "PREDICT_SPECIES_PREFS", "normalizeScore", "reefStructureAdjust",
  "REEF_OPEN_BOTTOM_CAP", "predictStructureTypeSet", "chartedStructureRowsNearPort",
  "collectPredictStructureCandidates", "buildPredictStructureSpatialIndex",
  "nearestStructureFromSpatialIndex", "NE_SPECIES_PREFS", "rankScoreFromRaw", "cmpHotspotStable",
  "speciesOfferedAt", "inChesapeakeBayRegion", "getRegionalSeasons",
], [
  "bw-data-ports.js", "bw-data-species.js", "bw-data-encyclopedia.js",
  "bw-data-canyons.js", "bw-data-bathy.js", "bw-data-closures.js",
  "bw-breaks.js", "bw-waypoints.js", "bw-platforms-gom.js", "bw-core.js",
]);
window.BW_DATA_CONFIG = { ...(window.BW_DATA_CONFIG || {}), embeddedFallback: true };

const { check, done } = makeChecker();
const pct = (raw) => Math.round(normalizeScore(raw) * 100);

console.log("\nreef species use structure scoring:");
for (const id of ["snapper", "grouper", "gaggrouper", "amberjack", "vermilion", "triggerfish",
                  "hogfish", "muttonsnap", "lanesnap", "yellowtail",
                  "blackseabass", "tautog", "porgy", "spadefish", "cod", "pollock"]) {
  check(`${id} has reefStructure`, PREDICT_SPECIES_PREFS[id].reefStructure === true);
}
check("New England sea bass override keeps reefStructure", NE_SPECIES_PREFS.blackseabass.reefStructure === true);
check("New England pollock override keeps reefStructure", NE_SPECIES_PREFS.pollock.reefStructure === true);
check("haddock (open gravel/sand banks) is not structure-gated", !PREDICT_SPECIES_PREFS.haddock.reefStructure);
check("red snapper structure set includes reefs, wrecks, ledges and platforms",
  ["rf", "wk", "ld", "pf"].every((t) => predictStructureTypeSet("snapper").has(t)));

console.log("\nscore shape by distance to charted structure (raw 0.70 base):");
{
  const on = reefStructureAdjust(0.70, 0.5, true);
  const near = reefStructureAdjust(0.70, 3, true);
  const open = reefStructureAdjust(0.70, 8, true);
  console.log(`    on reef ${pct(on)}%  ·  3 nm ${pct(near)}%  ·  open bottom ${pct(open)}%`);
  check("on charted structure reads excellent (>= 75)", pct(on) >= 75);
  check("on structure beats 3 nm off, which beats open bottom", on > near && near > open);
  check("open bottom is capped at fair (40-59), not poor", pct(open) >= 40 && pct(open) < 60);
  check("open-bottom cap equals REEF_OPEN_BOTTOM_CAP", Math.abs(open - REEF_OPEN_BOTTOM_CAP) < 1e-9);
  check("a poor cell is not raised by the cap", reefStructureAdjust(0.20, 8, true) === 0.20);
  check("no charted data loaded → no open-bottom cap", reefStructureAdjust(0.70, 8, false) === 0.70);
}

console.log("\nhotspot pins rank past the 100% paint cap:");
{
  check("rank score matches the painted score below the cap", rankScoreFromRaw(0.55) === normalizeScore(0.55));
  check("rank score keeps climbing past the cap", rankScoreFromRaw(1.10) > rankScoreFromRaw(1.02) && rankScoreFromRaw(1.02) > 1);
  // Two cells both painted 100%: the south one used to win on the latitude tiebreak.
  const south = { lat: 30.10, lng: -81.2, score: 1, rankScore: rankScoreFromRaw(1.01), headlineScore: 0.74 };
  const north = { lat: 30.48, lng: -80.4, score: 1, rankScore: rankScoreFromRaw(1.12), headlineScore: 0.89 };
  check("the stronger maxed-out cell ranks first, not the southernmost", [south, north].sort(cmpHotspotStable)[0] === north);
  const a = { lat: 30.1, lng: -81, score: 1, rankScore: 1.01, headlineScore: 0.74 };
  const b = { lat: 30.5, lng: -81, score: 1, rankScore: 1.01, headlineScore: 0.89 };
  check("equal rank breaks on the shown percent", [a, b].sort(cmpHotspotStable)[0] === b);
}

console.log("\nspecies ranges for VA and the Chesapeake:");
{
  const at = (id, name) => speciesOfferedAt(id, PORTS[name].lat, PORTS[name].lng);
  check("red snapper not offered at Virginia Beach", !at("snapper", "Virginia Beach, VA"));
  check("red snapper still offered at Hatteras", at("snapper", "Hatteras, NC"));
  check("red snapper still offered at Morehead City", at("snapper", "Morehead City, NC"));
  check("red snapper still offered at Galveston", at("snapper", "Galveston, TX"));
  for (const name of ["Solomons, MD", "Reedville, VA", "Cape Charles, VA", "Annapolis, MD", "Baltimore, MD",
                      "Coles Point, VA", "Colonial Beach, VA"]) {
    check(`porgy not offered at ${name}`, !at("porgy", name));
  }
  for (const name of ["Ocean City, MD", "Chincoteague, VA", "Virginia Beach, VA", "Montauk, NY"]) {
    check(`porgy still offered at ${name} (ocean side)`, at("porgy", name));
  }
  check("tautog offered at Virginia Beach", at("tautog", "Virginia Beach, VA"));
  check("Virginia Beach tautog winter (Jan) is near peak", (() => {
    const p = PORTS["Virginia Beach, VA"]; const c = getRegionalSeasons("tautog", p.lat, p.lng);
    return c && c.Jan >= 2.5 && c.Feb >= 1.5;
  })());
  check("tautog not offered south of the NC/VA line at Morehead City", !at("tautog", "Morehead City, NC"));
  for (const id of ["bluelinetile", "amberjack"]) {
    check(`${id} not offered at Solomons`, !at(id, "Solomons, MD"));
    check(`${id} still offered at Virginia Beach`, at(id, "Virginia Beach, VA"));
  }
  check("Delaware Bay is not treated as the Chesapeake", !inChesapeakeBayRegion(39.575, -75.588));
  check("mid-Bay water is inside the Chesapeake region", inChesapeakeBayRegion(38.0, -76.1));
  check("Atlantic off Chincoteague is outside the Chesapeake region", !inChesapeakeBayRegion(37.9, -75.2));
}

console.log("\nscoring reads the full charted database, not the Waypoints layer:");
{
  const chs = PORTS["Charleston, SC"];
  const rows = chartedStructureRowsNearPort(chs, 60, predictStructureTypeSet("snapper"));
  const types = new Set(rows.map((r) => r.t));
  console.log(`    ${rows.length} charted structures within 60 nm of Charleston`);
  check("Charleston has charted bottom structure for scoring", rows.length > 50);
  check("reefs and wrecks both present (not narrowed to one type)", types.has("rf") && types.has("wk"));
}

console.log("\nGulf platforms feed reef-fish scoring:");
{
  const gal = PORTS["Galveston, TX"];
  const snap = collectPredictStructureCandidates(gal, 80, "snapper");
  const plat = snap.filter((c) => c.canyon && c.canyon.type === "pf").length;
  console.log(`    ${snap.length} structures (${plat} platforms) within reach of Galveston`);
  check("Galveston snapper candidates include BSEE platforms", plat > 20);
  const kingNoPlatforms = collectPredictStructureCandidates(gal, 80, "kingmack")
    .filter((c) => c.canyon && c.canyon.type === "pf").length;
  check("non-reef species do not pick up the platform list", kingNoPlatforms < plat);
}

console.log("\nnearest-structure lookup resolves sub-grid distances:");
{
  const chs = PORTS["Charleston, SC"];
  const cands = collectPredictStructureCandidates(chs, 80, "snapper");
  buildPredictStructureSpatialIndex(cands, chs.lat - 2, chs.lng - 2);
  const reef = cands.find((c) => c.canyon && c.canyon.type === "rf" && c.lat < chs.lat - 0.2);
  const atReef = nearestStructureFromSpatialIndex(reef.lat, reef.lng);
  const offReef = nearestStructureFromSpatialIndex(reef.lat + 0.03, reef.lng + 0.03);
  check("distance is ~0 on a charted reef", atReef && atReef.nm < 0.05);
  check("distance grows ~2 nm away (not snapped to the 6 nm grid)",
    offReef && offReef.nm > 0 && offReef.nm !== atReef.nm);
}

done();
