/* Blackfin / mahi habitat scoring and live weather-change factor. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const {
  PREDICT_SPECIES_PREFS, PREDICT_WEIGHTS, PORTS, SPECIES_LAT_RANGE,
  PACIFIC_SPECIES_PREFS, REGIONAL_SEASONS,
  speciesAllowedAtLat, predictWeightsFor, weatherChangeFromObs, bluewaterGateFor,
  chlorScoreForPref, canyonDepthBoost, applyExplainerMovedStyles,
  nmBetween,
} = loadBw([
    "PREDICT_SPECIES_PREFS", "PREDICT_WEIGHTS", "PORTS", "SPECIES_LAT_RANGE",
    "PACIFIC_SPECIES_PREFS", "REGIONAL_SEASONS",
    "speciesAllowedAtLat", "predictWeightsFor", "weatherChangeFromObs", "bluewaterGateFor",
    "chlorScoreForPref", "canyonDepthBoost", "applyExplainerMovedStyles",
    "nmBetween",
  ]);

const { check, done } = makeChecker();

function pelagicTempScore(sst, p) {
  let tempScore;
  if (sst >= p.tempIdeal[0] && sst <= p.tempIdeal[1]) tempScore = 1;
  else if (sst < p.tempIdeal[0]) {
    const buf = Math.max(0.5, p.tempIdeal[0] - p.tempWorking[0]);
    const s = buf / 2.355, dl = p.tempIdeal[0] - sst;
    tempScore = Math.exp(-(dl * dl) / (2 * s * s));
  } else {
    const buf = Math.max(0.5, p.tempWorking[1] - p.tempIdeal[1]);
    const s = buf / 2.355, dl = sst - p.tempIdeal[1];
    tempScore = Math.exp(-(dl * dl) / (2 * s * s));
  }
  const warmEdge = p.tempWorking[1];
  if (sst >= p.tempIdeal[1]) tempScore = sst <= warmEdge ? 1 : Math.max(0, 1 - (sst - warmEdge) / 4);
  const span = Math.max(1, warmEdge - p.tempIdeal[0]);
  const warmBias = Math.max(0, Math.min(1, (sst - p.tempIdeal[0]) / span));
  return Math.min(1, tempScore * (0.7 + 0.4 * warmBias));
}

function depthBandScore(depthM, bands) {
  let best = 0;
  for (const [bMin, bMax] of bands) {
    let s;
    if (depthM >= bMin && depthM <= bMax) s = 1;
    else if (depthM < bMin) s = Math.max(0, 1 - (bMin - depthM) / 12);
    else s = Math.max(0, 1 - (depthM - bMax) / 120);
    if (s > best) best = s;
  }
  return best;
}

console.log("\nblackfin habitat no longer treats Hatteras Stream as too hot or too shallow:");
{
  const p = PREDICT_SPECIES_PREFS.blackfin;
  check("ideal covers 74-84°F Stream water", p.tempIdeal[0] === 74 && p.tempIdeal[1] === 84);
  check("working top is 88°F", p.tempWorking[1] === 88);
  check("breakPref is any (not edge-locked)", p.breakPref === "any");
  check("depth floor is ~80 ft", p.depthBands[0][0] <= 25);
  check("85°F SST is still fishable", pelagicTempScore(85, p) >= 0.9);
  check("150 ft wreck is in-band", depthBandScore(150 / 3.281, p.depthBands) === 1);
  check("80 ft wreck is in-band", depthBandScore(80 / 3.281, p.depthBands) >= 0.9);
  const hat = PORTS["Hatteras, NC"];
  const oi = PORTS["Oregon Inlet, NC"];
  const mhc = PORTS["Morehead City, NC"];
  check("Hatteras is in Atlantic range", speciesAllowedAtLat("blackfin", hat.lat, hat.lng));
  check("Morehead is in Atlantic range", speciesAllowedAtLat("blackfin", mhc.lat, mhc.lng));
  check("Oregon Inlet is north of the 35.6°N cutoff", !speciesAllowedAtLat("blackfin", oi.lat, oi.lng));
  check("lat max is 35.6", SPECIES_LAT_RANGE.blackfin[1] === 35.6);
  const hatReg = REGIONAL_SEASONS.blackfin[0];
  check("Hatteras season region does not reach Oregon Inlet",
    nmBetween(oi.lat, oi.lng, hatReg.centerLat, hatReg.centerLng) > hatReg.radiusNm);
  const bw80 = bluewaterGateFor("blackfin", 80 / 3.28084);
  const bwYft = bluewaterGateFor("yellowfin", 80 / 3.28084);
  check("blackfin 80 ft is not nearly vetoed", bw80 >= 0.4);
  check("yellowfin 80 ft stays suppressed", bwYft < 0.3);
}

console.log("\nmahi East Coast weights favor floating cover, not canyon slope:");
{
  const W = PREDICT_WEIGHTS.mahi;
  const off = PREDICT_WEIGHTS.offshore;
  check("mahi uses its own weight table", predictWeightsFor("mahi") === W);
  check("yellowfin still uses generic offshore weights", predictWeightsFor("yellowfin") === off);
  check("mahi temperature weight is higher than offshore", W.temperature > off.temperature);
  check("mahi does not score bottom structure", W.structure === 0);
  check("mahi depth is a light gate", W.depthStruct === 0.04);
  check("mahi chlorophyll is the biggest habitat proxy after temp", W.chlorophyll > W.thermalBreak && W.chlorophyll > W.convergence);
  check("mahi chlorPref is weed", PREDICT_SPECIES_PREFS.mahi.chlorPref === "weed");
  const bands = PREDICT_SPECIES_PREFS.mahi.depthBands;
  check("100-fathom mahi water is in-band (no 150-200 m hole)",
    depthBandScore(175, bands) === 1);
  check("200 ft weed line is in-band", depthBandScore(200 / 3.281, bands) === 1);
  check("1418 ft canyon cell is still in-band (depth is not a veto)",
    depthBandScore(1418 / 3.28084, bands) === 1);
  check("mahi gets no canyon-depth bonus at 1400 ft",
    canyonDepthBoost("mahi", bands, 1418 / 3.28084) === 0);
  check("yellowfin still gets a canyon-depth bonus on the drop",
    canyonDepthBoost("yellowfin", [[150, 2000]], 250) === 0.10);
  const sum = W.temperature + W.depthStruct + W.structure + W.chlorophyll + W.thermalBreak
    + W.convergence + W.season + W.pressure + W.solunar + W.tide + W.wind
    + W.weatherChange + (W.moonPhase || 0) + (W.reports || 0);
  check("mahi weights sum to 1", Math.abs(sum - 1) < 1e-9);
  check("mahi 150 ft blue-water gate is usable", bluewaterGateFor("mahi", 150 / 3.28084) >= 0.45);
}

console.log("\nmahi chlorophyll scores weed-line color, not a flat 0.7:");
{
  const weedLine = chlorScoreForPref("weed", 0.26, 0.15);
  const peaGreen = chlorScoreForPref("weed", 1.2, 0);
  const sterile = chlorScoreForPref("weed", 0.02, 0);
  const anyFlat = chlorScoreForPref("any", 0.26, 0.15);
  check("0.26 mg/m³ with a color edge scores well", weedLine >= 0.55);
  check("pea-green coastal water scores poorly", peaGreen < 0.35);
  check("sterile blue with no edge is modest", sterile < 0.35 && sterile > 0);
  check("weed with an edge outranks pea-green", weedLine > peaGreen);
  check("generic any-pref is still a flat 0.7", anyFlat === 0.7);
}

console.log("\nPacific mahi uses California Current temps, not Gulf Stream:");
{
  const pac = PACIFIC_SPECIES_PREFS.mahi;
  check("Pacific mahi override exists", !!pac);
  check("Pacific ideal is cooler than Atlantic", pac.tempIdeal[1] < PREDICT_SPECIES_PREFS.mahi.tempIdeal[1]);
  check("70°F San Diego paddy day is inside Pacific ideal",
    70 >= pac.tempIdeal[0] && 70 <= pac.tempIdeal[1]);
  check("Pacific mahi also uses weed chlorPref", pac.chlorPref === "weed");
  check("Atlantic mahi prefs are unchanged at 74-82",
    PREDICT_SPECIES_PREFS.mahi.tempIdeal[0] === 74 && PREDICT_SPECIES_PREFS.mahi.tempIdeal[1] === 82);
}

console.log("\nweather change reads live wind/seas/pressure instead of always 'steady':");
{
  const missing = weatherChangeFromObs({});
  check("no obs stays steady / 0.5", missing.label === "steady" && missing.score === 0.5);
  const blow = weatherChangeFromObs({ windKt: 20, waveFt: 8, pressureTrend: 0 });
  check("20 kt / 8 ft seas is a fresh blow", blow.label === "fresh blow");
  check("fresh blow scores low but not zero", blow.score < 0.35 && blow.score >= 0.18);
  check("raw text shows seas and wind", /8 ft seas/.test(blow.raw) && /20 kt/.test(blow.raw));
  const settled = weatherChangeFromObs({ windKt: 8, waveFt: 2, pressureTrend: 0.2 });
  check("light wind and small seas stay steady", settled.label === "steady" && settled.score === 0.5);
  const after = weatherChangeFromObs({ windKt: 10, waveFt: 4, pressureTrend: 3.2 });
  check("rising pressure after a front scores high", after.label === "post-front" && after.score >= 0.75);
  const arriving = weatherChangeFromObs({ windKt: 12, waveFt: 4, pressureTrend: -3.5 });
  check("falling pressure is front arriving", arriving.label === "front arriving" && arriving.score < 0.4);
}

console.log("\nbite explainer drag freezes pixel width and height:");
{
  const el = { style: {} };
  applyExplainerMovedStyles(el, { left: 24, top: 80, width: 460, height: 640 });
  check("locks left", el.style.left === "24px");
  check("locks top", el.style.top === "80px");
  check("clears right so the card cannot stretch", el.style.right === "auto");
  check("clears bottom so the card cannot stretch", el.style.bottom === "auto");
  check("freezes width", el.style.width === "460px");
  check("freezes height", el.style.height === "640px");
  check("caps maxWidth to the frozen width", el.style.maxWidth === "460px");
  check("caps maxHeight to the frozen height, not leftover viewport", el.style.maxHeight === "640px");
}

done();
