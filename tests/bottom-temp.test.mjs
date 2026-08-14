/* Tests for the demersal bottom-temperature model (bw-core.js scoreCell).

   Bottom fish are scored on the water they actually sit in, not the surface
   skin. The general thermocline curve was anchored for the GULF — deep mixed
   layer, no cold pool — and reported the Mid-Atlantic shelf bottom at ~79°F in
   August when it is really ~55-62°F. That misfire is what made offshore summer
   fluke on the Triangle Wrecks off Virginia Beach score as far too warm, and it
   penalized Gulf-of-Maine groundfish through their whole summer season.

   A cold-pool profile is now gated to the Atlantic shelf between Hatteras and
   the Gulf of Maine. These tests pin (a) that every other coast is untouched,
   (b) that the cold pool behaves correctly through the seasons, and (c) that the
   reported Triangle Wrecks case now scores. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const {
  PREDICT_SPECIES_PREFS, SPECIES_HABITAT, SPECIES_RUN_NM, PORTS,
  coldPoolCoreF, isColdPoolShelf, speciesRunRangeNm, speciesAllowedInWater,
} = loadBw([
  "PREDICT_SPECIES_PREFS", "SPECIES_HABITAT", "SPECIES_RUN_NM", "PORTS",
  "coldPoolCoreF", "isColdPoolShelf", "speciesRunRangeNm", "speciesAllowedInWater",
]);

const { check, done } = makeChecker();

// ── Mirrors of the two branches in scoreCell(), so we can assert on values ──
function gulfCurve(d, sst) {
  let bt;
  if (d <= 30)        bt = sst;
  else if (d <= 60)   bt = sst - (d - 30) / 30 * 4;
  else if (d <= 100)  bt = sst - 4 - (d - 60) / 40 * 14;
  else if (d <= 200)  bt = sst - 18 - (d - 100) / 100 * 8;
  else if (d <= 1200) { const s = sst - 26; bt = s - (d - 200) / 1000 * (s - 40); }
  else                bt = 40;
  bt = Math.max(bt, 40);
  const strat = Math.max(0, Math.min(1, (sst - 50) / (78 - 50)));
  return Math.max(40, sst - strat * Math.max(0, sst - bt));
}
function coldPoolCurve(lat, d, sst) {
  const core = coldPoolCoreF(lat);
  let bt;
  if (d <= 15)      bt = sst;
  else if (d <= 35) bt = sst - (d - 15) / 20 * (sst - core);
  else              bt = core;
  bt = Math.max(bt, 38);
  const strat = Math.max(0, Math.min(1, (sst - core) / 12));
  return Math.max(38, sst - strat * Math.max(0, sst - bt));
}
const bottomTemp = (lat, lng, d, sst) =>
  isColdPoolShelf(lat, lng, d) ? coldPoolCurve(lat, d, sst) : gulfCurve(d, sst);

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

console.log("\nother coasts are untouched by the cold-pool branch:");
{
  const OFF_REGION = [
    ["Gulf off Naples", 26.0, -82.5], ["Gulf off Clearwater", 27.9, -83.5],
    ["Gulf off Pensacola", 29.8, -87.2], ["Gulf off Venice LA", 28.8, -89.4],
    ["Gulf off Galveston", 28.8, -94.8], ["SE Atl off Charleston", 32.5, -79.5],
    ["SE Atl off Savannah", 31.8, -80.5], ["FL Atl off Miami", 25.7, -80.0],
    ["Keys off Key West", 24.4, -81.8], ["Pacific off San Diego", 32.6, -117.3],
    ["Atl south of Hatteras", 34.5, -76.0],
  ];
  let diffs = 0, n = 0;
  for (const [, lat, lng] of OFF_REGION) {
    for (const d of [10, 20, 30, 40, 60, 100, 150, 300]) {
      for (const sst of [55, 68, 79, 86]) {
        n++;
        if (Math.abs(bottomTemp(lat, lng, d, sst) - gulfCurve(d, sst)) > 1e-9) diffs++;
      }
    }
  }
  check(`${n} depth/SST combinations off-region are bit-identical to the old curve`, diffs === 0);
  for (const [name, lat, lng] of OFF_REGION) {
    check(`${name} is not cold-pool shelf`, !isColdPoolShelf(lat, lng, 40));
  }
  // Past the shelf break it is slope / Gulf Stream water, not cold pool.
  check("beyond 200 m is not cold-pool shelf", !isColdPoolShelf(37.0, -74.8, 400));
  check("zero/absent depth is not cold-pool shelf", !isColdPoolShelf(37.0, -75.4, 0));
}

console.log("\nthe cold pool applies on the MAB / NE shelf:");
{
  for (const [name, lat, lng] of [
    ["off Virginia Beach", 36.99, -75.39], ["off New Jersey", 39.90, -73.80],
    ["off Long Island", 40.60, -72.50], ["off Rhode Island", 41.30, -71.40],
    ["Gulf of Maine", 43.00, -69.50],
  ]) {
    check(`${name} is cold-pool shelf`, isColdPoolShelf(lat, lng, 40));
  }
  check("core is colder to the north", coldPoolCoreF(43.0) < coldPoolCoreF(37.0));
  check("core off Hatteras is ~60°F", Math.abs(coldPoolCoreF(35.5) - 60) < 0.01);
  check("core in the Gulf of Maine is ~46°F", Math.abs(coldPoolCoreF(44.5) - 46) < 0.01);
  check("core stays in a physical 44-62°F range",
    [35, 37, 39, 41, 43, 45].every((la) => coldPoolCoreF(la) >= 44 && coldPoolCoreF(la) <= 62));
}

console.log("\nsummer stratification vs winter mixing:");
{
  // August: warm surface over cold winter water — a big surface/bottom split.
  const aug = bottomTemp(36.99, -75.39, 30.5, 79);
  check("VA Beach August at 100 ft is 15°F+ below the surface", 79 - aug >= 15);
  check("VA Beach August at 100 ft lands in the 55-66°F cold pool", aug >= 55 && aug <= 66);
  // Above the thermocline the bottom still tracks the surface.
  check("VA Beach August at 40 ft still reads ~surface",
    Math.abs(bottomTemp(36.99, -75.39, 12, 79) - 79) < 0.01);
  // Winter: the column is mixed, so the bottom must NOT be refrigerated.
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
}

console.log("\nthe reported case — offshore fluke, Triangle Wrecks off Virginia Beach:");
{
  // Wrecks sit 28.8-31.0 nm out in ~100 ft, straight from the waypoints table.
  const port = PORTS["Virginia Beach, VA"];
  const cap = speciesRunRangeNm("flounder", port);
  check("all four Triangle wrecks are inside the flounder run cap",
    [28.8, 29.9, 30.7, 31.0].every((nm) => nm <= cap));
  // ~100 ft classifies as "offshore" (the threshold is exactly 100 ft), which is
  // why the habitat mask has to include it.
  check("flounder habitat admits offshore-classed shelf water",
    speciesAllowedInWater("flounder", "offshore"));
  check("flounder still admits bay/inshore/nearshore",
    ["bay", "inshore", "nearshore"].every((w) => speciesAllowedInWater("flounder", w)));
  const bandMax = Math.max(...PREDICT_SPECIES_PREFS.flounder.depthBands.map((b) => b[1]));
  check("flounder depth band covers a 100 ft wreck", bandMax >= 30.5);
  check("flounder depth band still excludes true deep water", bandMax <= 50);
  const bt = bottomTemp(36.99, -75.39, 30.5, 79);
  check("Triangle Wrecks temperature now scores well", tempScore("flounder", bt) >= 0.8);
  check("the old curve scored it near zero", tempScore("flounder", gulfCurve(30.5, 79)) < 0.05);
}

console.log("\nNE bottom species are no longer penalized by a warm surface:");
{
  // Each of these sits in cold-pool water through the summer.
  const CASES = [
    ["cod",          43.00, -69.50, 60, 60],
    ["haddock",      43.00, -69.50, 60, 80],
    ["pollock",      43.00, -69.50, 60, 90],
    ["blackseabass", 39.90, -73.80, 74, 40],
    ["flounder",     36.99, -75.39, 79, 30.5],
  ];
  for (const [sp, lat, lng, sst, d] of CASES) {
    const before = tempScore(sp, gulfCurve(d, sst));
    const after = tempScore(sp, bottomTemp(lat, lng, d, sst));
    check(`${sp} summer score improves (${(before*100).toFixed(0)}% → ${(after*100).toFixed(0)}%)`,
      after >= before);
    check(`${sp} summer score is now strong`, after >= 0.8);
  }
  // Controls: southern reef species must not move at all.
  for (const [sp, lat, lng, sst, d] of [
    ["grouper", 32.50, -79.50, 82, 40], ["snapper", 29.80, -87.20, 86, 40],
    ["gaggrouper", 27.90, -83.50, 85, 50], ["yellowtail", 24.60, -81.80, 84, 20],
  ]) {
    check(`${sp} control is unchanged`,
      Math.abs(bottomTemp(lat, lng, d, sst) - gulfCurve(d, sst)) < 1e-9);
  }
}

done();
