/* Tests for the demersal bottom-temperature model (bw-core.js scoreCell).

   Bottom fish are scored on the water they actually sit in, not the surface
   skin. The MAB cold pool is gated north of 35.4°N. South of that line (Gulf,
   SAB, Hatteras inner shelf) uses a tanh thermocline so 100 ft of 85°F SST
   stays too warm for vermilion, while 220 ft lands in the 64-72°F beeliner
   zone. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const {
  PREDICT_SPECIES_PREFS, SPECIES_HABITAT, SPECIES_RUN_NM, PORTS,
  coldPoolCoreF, isColdPoolShelf, speciesRunRangeNm, speciesAllowedInWater,
  shelfTanhBottomF, coldPoolBottomF, demersalBottomTempF,
  vermilionLatitudeGate, evaluateVermilionHabitat, COLD_POOL_SOUTH_LAT,
  speciesAllowedAtLat, VERMILION_NORTH_LAT,
} = loadBw([
  "PREDICT_SPECIES_PREFS", "SPECIES_HABITAT", "SPECIES_RUN_NM", "PORTS",
  "coldPoolCoreF", "isColdPoolShelf", "speciesRunRangeNm", "speciesAllowedInWater",
  "shelfTanhBottomF", "coldPoolBottomF", "demersalBottomTempF",
  "vermilionLatitudeGate", "evaluateVermilionHabitat", "COLD_POOL_SOUTH_LAT",
  "speciesAllowedAtLat", "VERMILION_NORTH_LAT",
]);

const { check, done } = makeChecker();

const bottomTemp = (lat, lng, d, sst) => demersalBottomTempF(lat, lng, d, sst);

function tempScore(spId, t) {
  const p = PREDICT_SPECIES_PREFS[spId];
  if (t >= p.tempIdeal[0] && t <= p.tempIdeal[1]) return 1;
  if (t < p.tempIdeal[0]) {
    const buf = Math.max(0.5, p.tempIdeal[0] - p.tempWorking[0]);
    const s = buf / 2.355, dl = p.tempIdeal[0] - t;
    return Math.exp(-(dl * dl) / (2 * s * s));
  }
  const buf = Math.max(0.5, p.tempWorking[1] - p.tempIdeal[1]);
  const s = buf / 2.355, dl = t - p.tempIdeal[1];
  return Math.exp(-(dl * dl) / (2 * s * s));
}

console.log("\nother coasts use the tanh shelf curve, not the cold pool:");
{
  const OFF_REGION = [
    ["Gulf off Naples", 26.0, -82.5], ["Gulf off Clearwater", 27.9, -83.5],
    ["Gulf off Pensacola", 29.8, -87.2], ["Gulf off Venice LA", 28.8, -89.4],
    ["Gulf off Galveston", 28.8, -94.8], ["SE Atl off Charleston", 32.5, -79.5],
    ["SE Atl off Savannah", 31.8, -80.5], ["FL Atl off Miami", 25.7, -80.0],
    ["Keys off Key West", 24.4, -81.8], ["Pacific off San Diego", 32.6, -117.3],
    ["Atl south of Hatteras", 34.5, -76.0],
    ["Diamond Shoals / inner Hatteras", 35.35, -75.22],
  ];
  let diffs = 0, n = 0;
  for (const [, lat, lng] of OFF_REGION) {
    for (const d of [10, 20, 30, 40, 60, 100, 150, 300]) {
      for (const sst of [55, 68, 79, 86]) {
        n++;
        if (Math.abs(bottomTemp(lat, lng, d, sst) - shelfTanhBottomF(d, sst)) > 1e-9) diffs++;
      }
    }
  }
  check(`${n} depth/SST combinations off-region match the tanh curve`, diffs === 0);
  for (const [name, lat, lng] of OFF_REGION) {
    check(`${name} is not cold-pool shelf`, !isColdPoolShelf(lat, lng, 40));
  }
  check("beyond 200 m is not cold-pool shelf", !isColdPoolShelf(37.0, -74.8, 400));
  check("zero/absent depth is not cold-pool shelf", !isColdPoolShelf(37.0, -75.4, 0));
  check("cold-pool south edge is 35.4°N", COLD_POOL_SOUTH_LAT === 35.4);
}

console.log("\nthe cold pool applies on the MAB / NE shelf:");
{
  for (const [name, lat, lng] of [
    ["cold-pool edge at 35.4", 35.4, -75.50],
    ["off Virginia Beach", 36.99, -75.39], ["off New Jersey", 39.90, -73.80],
    ["off Long Island", 40.60, -72.50], ["off Rhode Island", 41.30, -71.40],
    ["Gulf of Maine", 43.00, -69.50],
  ]) {
    check(`${name} is cold-pool shelf`, isColdPoolShelf(lat, lng, 40));
  }
  check("just south of 35.4 is SAB, not cold-pool", !isColdPoolShelf(35.39, -75.22, 30));
  check("core is colder to the north", coldPoolCoreF(43.0) < coldPoolCoreF(37.0));
  check("core off Hatteras is ~60°F", Math.abs(coldPoolCoreF(35.5) - 60) < 0.01);
  check("core in the Gulf of Maine is ~46°F", Math.abs(coldPoolCoreF(44.5) - 46) < 0.01);
  check("core stays in a physical 44-62°F range",
    [35.4, 37, 39, 41, 43, 45].every((la) => coldPoolCoreF(la) >= 44 && coldPoolCoreF(la) <= 62));
}

console.log("\nsummer stratification vs winter mixing:");
{
  const aug = bottomTemp(36.99, -75.39, 30.5, 79);
  check("VA Beach August at 100 ft is 15°F+ below the surface", 79 - aug >= 15);
  check("VA Beach August at 100 ft lands in the 55-66°F cold pool", aug >= 55 && aug <= 66);
  check("VA Beach August at 40 ft still reads ~surface",
    Math.abs(bottomTemp(36.99, -75.39, 12, 79) - 79) < 0.01);
  for (const [name, lat, lng, sst] of [
    ["Virginia Beach", 36.99, -75.39, 45], ["New Jersey", 39.90, -73.80, 40],
    ["Gulf of Maine", 43.00, -69.50, 39],
  ]) {
    const w = bottomTemp(lat, lng, 40, sst);
    check(`${name} winter column is mixed (bottom ≈ surface)`, Math.abs(w - sst) < 2);
  }
  check("bottom temp never goes below a physical floor",
    [30, 40, 50, 60, 79, 86].every((sst) =>
      [20, 40, 80, 150].every((d) => bottomTemp(39.9, -73.8, d, sst) >= 38)));
  check("bottom is never warmer than the surface in the cold pool",
    [55, 68, 79, 86].every((sst) =>
      [20, 40, 80, 150].every((d) => bottomTemp(39.9, -73.8, d, sst) <= sst + 1e-9)));
  check("tanh winter column is mixed on the SAB too",
    Math.abs(bottomTemp(34.9, -75.55, 40, 50) - 50) < 2);
}

console.log("\nthe reported case — offshore fluke, Triangle Wrecks off Virginia Beach:");
{
  const port = PORTS["Virginia Beach, VA"];
  const cap = speciesRunRangeNm("flounder", port);
  check("all four Triangle wrecks are inside the flounder run cap",
    [28.8, 29.9, 30.7, 31.0].every((nm) => nm <= cap));
  check("flounder habitat admits offshore-classed shelf water",
    speciesAllowedInWater("flounder", "offshore"));
  check("flounder still admits bay/inshore/nearshore",
    ["bay", "inshore", "nearshore"].every((w) => speciesAllowedInWater("flounder", w)));
  const bandMax = Math.max(...PREDICT_SPECIES_PREFS.flounder.depthBands.map((b) => b[1]));
  check("flounder depth band covers a 100 ft wreck", bandMax >= 30.5);
  check("flounder depth band still excludes true deep water", bandMax <= 50);
  const bt = bottomTemp(36.99, -75.39, 30.5, 79);
  check("Triangle Wrecks temperature now scores well", tempScore("flounder", bt) >= 0.8);
  check("the tanh SAB curve would have scored it poorly (too warm)",
    tempScore("flounder", shelfTanhBottomF(30.5, 79)) < 0.5);
}

console.log("\nNE bottom species are no longer penalized by a warm surface:");
{
  const CASES = [
    ["cod",          43.00, -69.50, 60, 60],
    ["haddock",      43.00, -69.50, 60, 80],
    ["pollock",      43.00, -69.50, 60, 90],
    ["blackseabass", 39.90, -73.80, 74, 40],
    ["flounder",     36.99, -75.39, 79, 30.5],
  ];
  for (const [sp, lat, lng, sst, d] of CASES) {
    const before = tempScore(sp, shelfTanhBottomF(d, sst));
    const after = tempScore(sp, bottomTemp(lat, lng, d, sst));
    check(`${sp} summer score improves vs tanh SAB (${(before*100).toFixed(0)}% → ${(after*100).toFixed(0)}%)`,
      after >= before);
    check(`${sp} summer score is now strong`, after >= 0.8);
  }
  for (const [sp, lat, lng, sst, d] of [
    ["grouper", 32.50, -79.50, 82, 40], ["snapper", 29.80, -87.20, 86, 40],
    ["gaggrouper", 27.90, -83.50, 85, 50], ["yellowtail", 24.60, -81.80, 84, 20],
  ]) {
    check(`${sp} southern control uses tanh, not cold-pool`,
      Math.abs(bottomTemp(lat, lng, d, sst) - shelfTanhBottomF(d, sst)) < 1e-9);
  }
}

console.log("\nvermilion / Hatteras tanh profile (SAB, not cold pool):");
{
  const sst = 82;
  const ft128 = 39;
  const ft200 = 61;
  const ft300 = 91;
  const southHat = bottomTemp(34.90, -75.55, ft128, sst);
  check("south of Hatteras 128 ft is not cold-pool", !isColdPoolShelf(34.90, -75.55, ft128));
  check("128 ft under 82°F SST is several degrees cooler than the surface", sst - southHat >= 5);
  check("128 ft is not still ~82°F", southHat <= 77);
  const at200 = bottomTemp(34.90, -75.55, ft200, sst);
  check("200 ft under 82°F SST lands in the 64-72°F beeliner zone", at200 >= 64 && at200 <= 72);
  const at300 = bottomTemp(29.80, -87.20, ft300, 84);
  check("Gulf 300 ft under 84°F SST is still ~64-72°F", at300 >= 64 && at300 <= 72);
  check("vermilion ideal is 64-72°F, not 80s",
    PREDICT_SPECIES_PREFS.vermilion.tempIdeal[0] === 64 &&
    PREDICT_SPECIES_PREFS.vermilion.tempIdeal[1] === 72);
  check("vermilion working top is 78°F (they leave hotter water)",
    PREDICT_SPECIES_PREFS.vermilion.tempWorking[0] === 58 &&
    PREDICT_SPECIES_PREFS.vermilion.tempWorking[1] === 78);
  const [dLo, dHi] = PREDICT_SPECIES_PREFS.vermilion.depthBands[0];
  check("vermilion depth band is ~100-300 ft", dLo >= 29 && dLo <= 32 && dHi >= 88 && dHi <= 95);
  check("82°F bottom scores poorly for vermilion", tempScore("vermilion", 82) < 0.15);
  check("69°F bottom is ideal for vermilion", tempScore("vermilion", 69) === 1);
  check("128 ft Hatteras cell is not an excellent temp match",
    tempScore("vermilion", southHat) < 0.7);
  check("200 ft Hatteras cell is an excellent temp match",
    tempScore("vermilion", at200) >= 0.9);
}

console.log("\nvermilion Case A / Case B and the reported 98 ft Hatteras cell:");
{
  const sst = 85;
  const caseA = evaluateVermilionHabitat(35.4, -75.5, 100, sst);
  check("Case A (35.4°N, 100 ft) triggers a latitude/depth warning",
    caseA.latitude_gate_active === true);
  check("Case A gate is shallow northern shelf",
    caseA.latitude_gate_status === "SHALLOW_NORTHERN_SHELF");
  check("Case A suitability is low", caseA.suitability_score <= 0.15);

  const caseB = evaluateVermilionHabitat(35.1, -75.5, 220, sst);
  check("Case B (35.1°N, 220 ft) passes the latitude gate",
    caseB.latitude_gate_active === false && caseB.latitude_gate_status === "OK");
  check("Case B bottom is in the 64-72°F beeliner zone",
    caseB.estimated_bottom_temp_fahrenheit >= 64 &&
    caseB.estimated_bottom_temp_fahrenheit <= 72);
  check("Case B suitability is high", caseB.suitability_score >= 0.85);

  const shot = evaluateVermilionHabitat(35.347, -75.224, 98, sst);
  check("reported cell is not cold-pool (south of 35.4)",
    !isColdPoolShelf(35.347, -75.224, 98 / 3.28084));
  check("reported 98 ft cell does not invent a 66°F cold-pool bottom",
    shot.estimated_bottom_temp_fahrenheit >= 78);
  check("reported 98 ft cell is habitat-gated",
    shot.latitude_gate_status === "SHALLOW_NORTHERN_SHELF");
  check("reported 98 ft cell cannot score Excellent",
    shot.suitability_score <= 0.15);

  check("hard cutoff is 35.4°N", VERMILION_NORTH_LAT === 35.4);
  const north = vermilionLatitudeGate(35.41, 67, 68);
  check("just north of 35.4°N is a hard NORTH_OF_HATTERAS veto",
    north.status === "NORTH_OF_HATTERAS" && north.penalty === 0);
  const northShallow = evaluateVermilionHabitat(36.0, -75.4, 100, 85);
  check("Virginia 100 ft cell has zero suitability", northShallow.suitability_score === 0);
  const northDeep = evaluateVermilionHabitat(36.0, -75.4, 220, 85);
  check("Virginia 220 ft cell still has zero suitability (no warm-core paint)",
    northDeep.suitability_score === 0 && northDeep.latitude_gate_status === "NORTH_OF_HATTERAS");
  check("heat map excludes vermilion at Virginia Beach",
    speciesAllowedAtLat("vermilion", 36.85, -75.98) === false);
  check("heat map excludes vermilion at Oregon Inlet",
    speciesAllowedAtLat("vermilion", 35.80, -75.54) === false);
  check("heat map still allows vermilion at Hatteras (35.22°N)",
    speciesAllowedAtLat("vermilion", 35.22, -75.69) === true);
  check("heat map still allows vermilion on the Gulf",
    speciesAllowedAtLat("vermilion", 29.8, -87.2) === true);
}

done();
