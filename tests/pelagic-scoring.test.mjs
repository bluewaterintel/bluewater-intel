/* Blackfin / mahi habitat scoring and live weather-change factor. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const {
  PREDICT_SPECIES_PREFS, PREDICT_WEIGHTS, PORTS, SPECIES_LAT_RANGE,
  PACIFIC_SPECIES_PREFS, SEFL_SPECIES_PREFS, REGIONAL_SEASONS,
  speciesAllowedAtLat, predictWeightsFor, weatherChangeFromObs, bluewaterGateFor,
  chlorScoreForPref, canyonDepthBoost, applyExplainerMovedStyles,
  seasonAlignmentLabel, getRegionalSeasons, isSeFloridaAtlantic, windScore,
  nmBetween, effectiveSpeciesHabitat, isFloridaKeys, usesSeFlSpeciesPrefs,
} = loadBw([
    "PREDICT_SPECIES_PREFS", "PREDICT_WEIGHTS", "PORTS", "SPECIES_LAT_RANGE",
    "PACIFIC_SPECIES_PREFS", "SEFL_SPECIES_PREFS", "REGIONAL_SEASONS",
    "speciesAllowedAtLat", "predictWeightsFor", "weatherChangeFromObs", "bluewaterGateFor",
    "chlorScoreForPref", "canyonDepthBoost", "applyExplainerMovedStyles",
    "seasonAlignmentLabel", "getRegionalSeasons", "isSeFloridaAtlantic", "windScore",
    "nmBetween", "effectiveSpeciesHabitat", "isFloridaKeys", "usesSeFlSpeciesPrefs",
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

console.log("\nsailfish SE Florida is a reef/Stream kite fishery, not a canyon marlin:");
{
  const p = PREDICT_SPECIES_PREFS.sailfish;
  const W = PREDICT_WEIGHTS.sailfish;
  check("sailfish uses its own weight table", predictWeightsFor("sailfish") === W);
  check("yellowfin still uses generic offshore weights", predictWeightsFor("yellowfin") === PREDICT_WEIGHTS.offshore);
  check("sailfish does not score bottom structure", W.structure === 0);
  check("sailfish depth is a light gate", W.depthStruct === 0.05);
  check("sailfish weights include wind and weather-change", W.wind === 0.06 && W.weatherChange === 0.06);
  const sum = W.temperature + W.depthStruct + W.structure + W.chlorophyll + W.thermalBreak
    + W.convergence + W.season + W.pressure + W.solunar + W.tide + W.wind
    + W.weatherChange + (W.moonPhase || 0) + (W.reports || 0);
  check("sailfish weights sum to 1", Math.abs(sum - 1) < 1e-9);
  check("chlorPref is any", p.chlorPref === "any");
  check("breakPref is any", p.breakPref === "any");
  check("working top is 88°F", p.tempWorking[1] === 88);
  check("86°F September water is still fishable", pelagicTempScore(86.3, p) >= 0.9);
  check("Stuart 80 ft reef is in-band", depthBandScore(80 / 3.28084, p.depthBands) >= 0.9);
  check("Palm Beach 200 ft wall is in-band", depthBandScore(200 / 3.28084, p.depthBands) === 1);
  check("100-fathom NC water is still in-band", depthBandScore(183, p.depthBands) === 1);
  check("sailfish gets no canyon-depth bonus", canyonDepthBoost("sailfish", p.depthBands, 188) === 0);
  const stuart = PORTS["Stuart, FL"];
  const bw80 = bluewaterGateFor("sailfish", 80 / 3.28084, stuart.lat, stuart.lng);
  const bwYft = bluewaterGateFor("yellowfin", 80 / 3.28084, stuart.lat, stuart.lng);
  check("sailfish 80 ft is not nearly vetoed", bw80 >= 0.4);
  check("yellowfin 80 ft stays suppressed", bwYft < 0.3);
  check("N/NE wind scores high for sailfish", windScore(stuart.lat, stuart.lng, p, 20, "sailfish") >= 0.9);
  check("west wind scores lower for sailfish", windScore(stuart.lat, stuart.lng, p, 270, "sailfish") < 0.55);
}

console.log("\nsailfish season: winter peak, September/October good, not peak:");
{
  check("table 2 labels good (not peak)", seasonAlignmentLabel(2 / 3) === "good");
  check("table 3 labels peak", seasonAlignmentLabel(1) === "peak");
  check("table 1 labels off/slow", seasonAlignmentLabel(1 / 3) === "off");
  const sefl = REGIONAL_SEASONS.sailfish.find(r => /SE FL/.test(r.label));
  check("SE FL September is 2", sefl.seasons.Sep === 2);
  check("SE FL October is 2", sefl.seasons.Oct === 2);
  check("SE FL Nov-Feb are peak", sefl.seasons.Nov === 3 && sefl.seasons.Dec === 3
    && sefl.seasons.Jan === 3 && sefl.seasons.Feb === 3);
  check("SE FL March stays peak", sefl.seasons.Mar === 3);
  const stuart = PORTS["Stuart, FL"];
  const pb = PORTS["Palm Beach, FL"];
  const ga = REGIONAL_SEASONS.sailfish.find(r => /GA/.test(r.label));
  check("GA fall-peak region does not reach Stuart",
    nmBetween(stuart.lat, stuart.lng, ga.centerLat, ga.centerLng) > ga.radiusNm);
  check("GA fall-peak region does not reach Palm Beach",
    nmBetween(pb.lat, pb.lng, ga.centerLat, ga.centerLng) > ga.radiusNm);
  const blended = getRegionalSeasons("sailfish", stuart.lat, stuart.lng);
  check("Stuart September blend labels good", seasonAlignmentLabel(blended.Sep / 3) === "good");
  check("Stuart October blend labels good", seasonAlignmentLabel(blended.Oct / 3) === "good");
  check("Stuart January blend labels peak", seasonAlignmentLabel(blended.Jan / 3) === "peak");
  const can = PORTS["Port Canaveral, FL"];
  const canBlend = getRegionalSeasons("sailfish", can.lat, can.lng);
  check("Canaveral October is the fall arrival (peak or good-high)", canBlend.Oct >= 2.5);
}

console.log("\nSE Florida wahoo uses the Stream wall, moon, and no canyon slope:");
{
  const p = PREDICT_SPECIES_PREFS.wahoo;
  const se = SEFL_SPECIES_PREFS.wahoo;
  const Wse = PREDICT_WEIGHTS.wahooSeFl;
  check("wahoo depth floor is ~131 ft", p.depthBands[0][0] <= 40);
  check("Palm Beach 150 ft wall is in-band", depthBandScore(150 / 3.28084, p.depthBands) >= 0.9);
  check("NC 100-fathom wahoo is still in-band", depthBandScore(183, p.depthBands) === 1);
  const pb = PORTS["Palm Beach, FL"];
  const hat = PORTS["Hatteras, NC"];
  check("Palm Beach is SE Florida Atlantic", isSeFloridaAtlantic(pb.lat, pb.lng));
  check("Hatteras is not SE Florida Atlantic", !isSeFloridaAtlantic(hat.lat, hat.lng));
  const wahooPb = bluewaterGateFor("wahoo", 150 / 3.28084, pb.lat, pb.lng);
  const wahooHat = bluewaterGateFor("wahoo", 150 / 3.28084, hat.lat, hat.lng);
  check("SE FL wahoo 150 ft is usable", wahooPb >= 0.7);
  check("NC wahoo 150 ft stays on the generic ramp", wahooHat < 0.55);
  check("NC wahoo still uses generic offshore weights", predictWeightsFor("wahoo", hat.lat, hat.lng) === PREDICT_WEIGHTS.offshore);
  check("SE FL wahoo uses the wall table, not canyon slope", predictWeightsFor("wahoo", pb.lat, pb.lng) === Wse);
  check("SE FL wahoo does not score bottom structure", Wse.structure === 0);
  check("SE FL wahoo moon phase has real weight", Wse.moonPhase >= 0.06);
  check("SE FL wahoo keeps edge-seeking breaks", se.breakPref === "edge");
  check("SE FL wahoo chlorPref is any", se.chlorPref === "any");
  check("SE FL working top is 88°F", se.tempWorking[1] === 88);
  check("85°F September wall water is fishable", pelagicTempScore(85.2, se) >= 0.9);
  check("Atlantic wahoo prefs stay chlorPref low for NC", p.chlorPref === "low" && p.tempWorking[1] === 84);
  const sum = Wse.temperature + Wse.depthStruct + Wse.structure + Wse.chlorophyll + Wse.thermalBreak
    + Wse.convergence + Wse.season + Wse.pressure + Wse.solunar + Wse.tide + Wse.wind
    + Wse.weatherChange + (Wse.moonPhase || 0) + (Wse.reports || 0);
  check("SE FL wahoo weights sum to 1", Math.abs(sum - 1) < 1e-9);
  check("N/NE wind scores high for SE FL wahoo", windScore(pb.lat, pb.lng, se, 20, "wahoo") >= 0.9);
}

console.log("\nskipjack is a wreck/Stream tuna, not a canyon marlin:");
{
  const p = PREDICT_SPECIES_PREFS.skipjack;
  const W = PREDICT_WEIGHTS.skipjack;
  const stuart = PORTS["Stuart, FL"];
  check("skipjack uses its own weight table", predictWeightsFor("skipjack") === W);
  check("skipjack does not score bottom structure", W.structure === 0);
  check("skipjack moon phase has weight", W.moonPhase >= 0.05);
  check("skipjack depth floor is ~80 ft", p.depthBands[0][0] <= 25);
  check("80 ft wreck is in-band", depthBandScore(80 / 3.28084, p.depthBands) >= 0.9);
  check("chlorPref is any", p.chlorPref === "any");
  check("breakPref is any", p.breakPref === "any");
  const bw80 = bluewaterGateFor("skipjack", 80 / 3.28084, stuart.lat, stuart.lng);
  const bwYft = bluewaterGateFor("yellowfin", 80 / 3.28084, stuart.lat, stuart.lng);
  check("skipjack 80 ft is not nearly vetoed", bw80 >= 0.4);
  check("yellowfin 80 ft stays suppressed", bwYft < 0.3);
  check("skipjack gets no canyon-depth bonus", canyonDepthBoost("skipjack", p.depthBands, 200) === 0);
  const sum = W.temperature + W.depthStruct + W.structure + W.chlorophyll + W.thermalBreak
    + W.convergence + W.season + W.pressure + W.solunar + W.tide + W.wind
    + W.weatherChange + (W.moonPhase || 0) + (W.reports || 0);
  check("skipjack weights sum to 1", Math.abs(sum - 1) < 1e-9);
}

console.log("\nSE Florida tarpon September is the mullet-run peak, not Keys off-season:");
{
  const stuart = PORTS["Stuart, FL"];
  const vero = PORTS["Vero Beach, FL"];
  const blendedS = getRegionalSeasons("tarpon", stuart.lat, stuart.lng);
  const blendedV = getRegionalSeasons("tarpon", vero.lat, vero.lng);
  check("Stuart September tarpon labels peak", seasonAlignmentLabel(blendedS.Sep / 3) === "peak");
  check("Vero September tarpon labels peak", seasonAlignmentLabel(blendedV.Sep / 3) === "peak");
  check("Stuart May tarpon stays peak (spring beach run)", seasonAlignmentLabel(blendedS.May / 3) === "peak");
  check("Stuart August tarpon is peak (mullet run)", seasonAlignmentLabel(blendedS.Aug / 3) === "peak");
  const p = PREDICT_SPECIES_PREFS.tarpon;
  check("21 ft lagoon/beach is in-band", depthBandScore(21 / 3.28084, p.depthBands) >= 0.9);
  check("tarpon ceiling stays inside pass/nearshore water", p.depthBands[0][1] <= 22);
  const hab = effectiveSpeciesHabitat("tarpon");
  check("tarpon habitat does not include offshore", !hab.includes("offshore"));
}

console.log("\nsnook stays on inlets and beaches, not mid-shelf wrecks:");
{
  const p = PREDICT_SPECIES_PREFS.snook;
  const hab = effectiveSpeciesHabitat("snook");
  check("snook habitat is bay/inshore only", hab.includes("bay") && hab.includes("inshore") && !hab.includes("nearshore") && !hab.includes("offshore"));
  check("8 ft beach trough is in-band", depthBandScore(8 / 3.28084, p.depthBands) >= 0.9);
  check("20 ft inlet hole is in-band", depthBandScore(20 / 3.28084, p.depthBands) >= 0.9);
  check("snook ceiling stays inside the 30 ft inshore bucket", p.depthBands[0][1] * 3.28084 < 30);
  check("47 ft Bethel Shoal is deeper than snook habitat", 47 / 3.28084 > p.depthBands[0][1]);
  const vero = PORTS["Vero Beach, FL"];
  const blended = getRegionalSeasons("snook", vero.lat, vero.lng);
  check("Vero September snook stays in season", blended.Sep >= 2.5);
}

console.log("\nKeys/SE FL mahi stay findable on weeds in late summer; NC stays cooler:");
{
  const kw = PORTS["Key West, FL"];
  const stuart = PORTS["Stuart, FL"];
  const hat = PORTS["Hatteras, NC"];
  const se = SEFL_SPECIES_PREFS.mahi;
  const atl = PREDICT_SPECIES_PREFS.mahi;
  check("Key West is Florida Keys, not the SE FL Atlantic strip", isFloridaKeys(kw.lat, kw.lng) && !isSeFloridaAtlantic(kw.lat, kw.lng));
  check("Stuart is SE FL Atlantic, not Keys", isSeFloridaAtlantic(stuart.lat, stuart.lng) && !isFloridaKeys(stuart.lat, stuart.lng));
  check("Hatteras is neither", !isFloridaKeys(hat.lat, hat.lng) && !isSeFloridaAtlantic(hat.lat, hat.lng));
  check("Keys mahi uses tropical prefs", usesSeFlSpeciesPrefs("mahi", kw.lat, kw.lng));
  check("Stuart mahi uses tropical prefs", usesSeFlSpeciesPrefs("mahi", stuart.lat, stuart.lng));
  check("Hatteras mahi stays on the Atlantic table", !usesSeFlSpeciesPrefs("mahi", hat.lat, hat.lng));
  check("tropical mahi working top is 88°F", se.tempWorking[1] === 88);
  check("Atlantic mahi working top stays 84°F for NC", atl.tempWorking[1] === 84);
  check("88°F Keys water is fishable", pelagicTempScore(88, se) >= 0.9);
  check("88°F is lethal on the NC working cap", pelagicTempScore(88, atl) < 0.1);
  check("weed chlorPref stays on both tables", se.chlorPref === "weed" && atl.chlorPref === "weed");
  const kwSeason = getRegionalSeasons("mahi", kw.lat, kw.lng);
  const stSeason = getRegionalSeasons("mahi", stuart.lat, stuart.lng);
  check("Key West September mahi labels good (not off)", seasonAlignmentLabel(kwSeason.Sep / 3) === "good");
  check("Stuart September mahi labels good", seasonAlignmentLabel(stSeason.Sep / 3) === "good");
  check("Key West May mahi stays peak", seasonAlignmentLabel(kwSeason.May / 3) === "peak");
  check("Stuart May mahi stays peak", seasonAlignmentLabel(stSeason.May / 3) === "peak");
  const keysTbl = REGIONAL_SEASONS.mahi.find(r => r.label.includes("Florida Keys"));
  const seflTbl = REGIONAL_SEASONS.mahi.find(r => r.label.includes("SE FL"));
  check("Keys and SE FL keep separate calendars", keysTbl && seflTbl && keysTbl !== seflTbl);
}

done();
