/* Reef fish (snapper, grouper, AJ, …) score on distance to charted hard bottom.
   The bite map must read the full charted database plus Gulf platforms, never
   the Waypoints layer's filtered view, and open sand at the right depth must
   cap at "fair" instead of painting the whole depth band excellent. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const {
  window, PORTS, PREDICT_SPECIES_PREFS, normalizeScore, reefStructureAdjust,
  REEF_OPEN_BOTTOM_CAP, predictStructureTypeSet, chartedStructureRowsNearPort,
  collectPredictStructureCandidates, buildPredictStructureSpatialIndex,
  nearestStructureFromSpatialIndex,
} = loadBw([
  "window", "PORTS", "PREDICT_SPECIES_PREFS", "normalizeScore", "reefStructureAdjust",
  "REEF_OPEN_BOTTOM_CAP", "predictStructureTypeSet", "chartedStructureRowsNearPort",
  "collectPredictStructureCandidates", "buildPredictStructureSpatialIndex",
  "nearestStructureFromSpatialIndex",
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
                  "hogfish", "muttonsnap", "lanesnap", "yellowtail"]) {
  check(`${id} has reefStructure`, PREDICT_SPECIES_PREFS[id].reefStructure === true);
}
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
