/* Blackfin / mahi habitat scoring and live weather-change factor. */
import { loadBw, makeChecker } from "./load-bw.mjs";

const {
  PREDICT_SPECIES_PREFS, PREDICT_WEIGHTS, PORTS, SPECIES_LAT_RANGE,
  PACIFIC_SPECIES_PREFS, SEFL_SPECIES_PREFS, REGIONAL_SEASONS,
  speciesAllowedAtLat, predictWeightsFor, weatherChangeFromObs, bluewaterGateFor,
  chlorScoreForPref, canyonDepthBoost, applyExplainerMovedStyles,
  seasonAlignmentLabel, getRegionalSeasons, isSeFloridaAtlantic, windScore,
  nmBetween, effectiveSpeciesHabitat, isFloridaKeys, usesSeFlSpeciesPrefs,
  isNewEnglandBluefinGrounds, NE_SPECIES_PREFS, nearestStructureNm, CANYONS,
  GULF_SPECIES_PREFS, usesGulfSpeciesPrefs, isGulfContext,
  gulfYellowfinStructureLift, gulfYellowfinStructureKind, pickTopHotspotBadges,
  speciesRunRangeNm, predictCoastLimits, portOceanBbox, isOnLand, isPredictWater,
  predictInputsRangeNm,
} = loadBw([
    "PREDICT_SPECIES_PREFS", "PREDICT_WEIGHTS", "PORTS", "SPECIES_LAT_RANGE",
    "PACIFIC_SPECIES_PREFS", "SEFL_SPECIES_PREFS", "REGIONAL_SEASONS",
    "speciesAllowedAtLat", "predictWeightsFor", "weatherChangeFromObs", "bluewaterGateFor",
    "chlorScoreForPref", "canyonDepthBoost", "applyExplainerMovedStyles",
    "seasonAlignmentLabel", "getRegionalSeasons", "isSeFloridaAtlantic", "windScore",
    "nmBetween", "effectiveSpeciesHabitat", "isFloridaKeys", "usesSeFlSpeciesPrefs",
    "isNewEnglandBluefinGrounds", "NE_SPECIES_PREFS", "nearestStructureNm", "CANYONS",
    "GULF_SPECIES_PREFS", "usesGulfSpeciesPrefs", "isGulfContext",
    "gulfYellowfinStructureLift", "gulfYellowfinStructureKind", "pickTopHotspotBadges",
    "speciesRunRangeNm", "predictCoastLimits", "portOceanBbox", "isOnLand", "isPredictWater",
    "predictInputsRangeNm",
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

function depthBandScore(depthM, bands, deepDecayM = 120) {
  let best = 0;
  for (const [bMin, bMax] of bands) {
    let s;
    if (depthM >= bMin && depthM <= bMax) s = 1;
    else if (depthM < bMin) s = Math.max(0, 1 - (bMin - depthM) / 12);
    else s = Math.max(0, 1 - (depthM - bMax) / deepDecayM);
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

console.log("\nNew England bluefin scores Stellwagen / Jeffrey's, not the beach:");
{
  const glo = PORTS["Gloucester, MA"];
  const hat = PORTS["Hatteras, NC"];
  check("Gloucester is New England bluefin grounds", isNewEnglandBluefinGrounds(glo.lat, glo.lng));
  check("Hatteras is not", !isNewEnglandBluefinGrounds(hat.lat, hat.lng));
  const ne = NE_SPECIES_PREFS.bluefin;
  const atl = PREDICT_SPECIES_PREFS.bluefin;
  check("NE bluefin keys on mapped banks", ne.breakPref === "stable");
  check("NE bluefin floor is bank depth (~80 ft)", ne.depthBands[0][0] >= 24);
  check("150 ft Stellwagen is in-band", depthBandScore(150 / 3.28084, ne.depthBands) >= 0.9);
  check("50 ft Mass Bay is out of NE band", depthBandScore(50 / 3.28084, ne.depthBands) < 0.5);
  check("Hatteras 80 ft winter troll stays in-band on the Atlantic table",
    depthBandScore(80 / 3.28084, atl.depthBands) >= 0.9);
  const stell = CANYONS.find(c => c.name.includes("Stellwagen"));
  const jeff = CANYONS.find(c => c.name.includes("Jeffrey"));
  check("Stellwagen lists bluefin", stell && stell.fish.includes("bluefin"));
  check("Jeffrey's Ledge lists bluefin", jeff && jeff.fish.includes("bluefin"));
  const dBank = nearestStructureNm(stell.lat, stell.lng, "bluefin");
  const dBeach = nearestStructureNm(glo.lat, glo.lng - 0.05, "bluefin");
  check("a Stellwagen cell is on bluefin structure", dBank != null && dBank < 2);
  check("a Gloucester-harbor cell is farther from the banks", dBeach != null && dBeach > 8);
}

console.log("\nGulf of Maine black sea bass stay on nearshore wrecks, not 400 ft basin:");
{
  const portland = PORTS["Portland, ME"];
  const vb = PORTS["Virginia Beach, VA"];
  const ne = NE_SPECIES_PREFS.blackseabass;
  const atl = PREDICT_SPECIES_PREFS.blackseabass;
  check("Portland is in the New England habitat box",
    isNewEnglandBluefinGrounds(portland.lat, portland.lng));
  check("Virginia Beach stays on the national BSB table",
    !isNewEnglandBluefinGrounds(vb.lat, vb.lng));
  check("NE BSB ceiling is ~150 ft, not 427 ft", ne.depthBands[0][1] * 3.28084 <= 155);
  check("80 ft Portland wreck is full credit",
    depthBandScore(80 / 3.28084, ne.depthBands) === 1);
  check("120 ft ledge edge is still fishable",
    depthBandScore(120 / 3.28084, ne.depthBands) >= 0.9);
  check("415 ft GOM water is not a depth match",
    depthBandScore(415 / 3.28084, ne.depthBands, 32) < 0.15);
  check("VA 115 ft wreck stays full credit on the national table",
    depthBandScore(115 / 3.28084, atl.depthBands) === 1);
  check("NJ winter 400 ft wreck stays in-band south of New England",
    depthBandScore(400 / 3.28084, atl.depthBands) >= 0.9);
  check("Portland BSB run hugs the nearshore wreck line (~28 nm)",
    speciesRunRangeNm("blackseabass", portland) <= 28);
  check("VA BSB keeps the 70 nm winter-wreck run",
    speciesRunRangeNm("blackseabass", vb) >= 70);
  const env = predictCoastLimits(portland.lat, portland.lng);
  check("Atlantic envelope reaches Portland / Casco Bay", env.latMax >= 43.7);
  check("Atlantic envelope reaches Downeast latitudes", env.latMax >= 44.9);
  const bb = portOceanBbox(portland);
  check("Portland ocean bbox is not clipped at 43.5°N", bb.latMax > 43.5);
  check("Portland bbox includes water north of the harbor", bb.latMax >= portland.lat);
  check("Casco Bay water is not classified as land",
    !isOnLand(43.67, -70.12));
  check("Casco Bay is predict-water for scoring",
    isPredictWater(43.67, -70.12));
  check("Portland peninsula stays land", isOnLand(43.66, -70.28));
  check("Northeast ocean fetch is capped so Maine does not time out",
    predictInputsRangeNm(portland) <= 75);
  const nePol = NE_SPECIES_PREFS.pollock;
  check("NE pollock is a ledge fish, not 1000 ft basin",
    nePol && nePol.depthBands[0][1] <= 160);
  check("NE pollock floor stays off the beach",
    nePol.depthBands[0][0] >= 40);
  const jeffs = CANYONS.filter(c => /jeffrey/i.test(c.name));
  check("Jeffrey's Ledge is listed once", jeffs.length === 1);
  check("the duplicate Plattes Bank pin is gone",
    !CANYONS.some(c => /platt/i.test(c.name)));
}

console.log("\nVA Beach sea bass / fluke weight the Triangle Wrecks, not open sand:");
{
  const tri = CANYONS.find(c => c.name === "Triangle Wrecks");
  check("Triangle Wrecks is a mapped structure", !!tri);
  check("Triangle Wrecks lists black sea bass", tri.fish.includes("blackseabass"));
  check("Triangle Wrecks lists flounder", tri.fish.includes("flounder"));
  const dTri = nearestStructureNm(tri.lat, tri.lng, "blackseabass");
  check("a Triangle cell is on sea-bass structure", dTri != null && dTri < 1);
  const p = PREDICT_SPECIES_PREFS.blackseabass;
  check("80 ft Triangle wreck is in-band", depthBandScore(80 / 3.28084, p.depthBands) >= 0.9);
  check("45 ft Light Tower is shallower than the sea-bass floor",
    depthBandScore(45 / 3.28084, p.depthBands) < 0.85);
  const vb = PORTS["Virginia Beach, VA"];
  const tower = CANYONS.find(c => c.name === "Chesapeake Light Tower");
  check("Triangle Wrecks sit on the ~30 nm wreck cluster, not the Light Tower",
    Math.abs(tri.lat - 36.99042) < 0.001 && Math.abs(tri.lng - (-75.38827)) < 0.001);
  check("Triangle is ~16 nm from Light Tower so both can pin",
    nmBetween(tri.lat, tri.lng, tower.lat, tower.lng) >= 10);
  check("Triangle is a 29-32 nm run from VA Beach",
    (() => { const d = nmBetween(vb.lat, vb.lng, tri.lat, tri.lng); return d >= 28 && d <= 33; })());
}

console.log("\nChesapeake redfish cools in mid-September; cobia exit is already good:");
{
  const vb = PORTS["Virginia Beach, VA"];
  const red = getRegionalSeasons("redfish", vb.lat, vb.lng);
  const cob = getRegionalSeasons("cobia", vb.lat, vb.lng);
  check("VA Beach September redfish labels good (not peak)", seasonAlignmentLabel(red.Sep / 3) === "good");
  check("VA Beach October redfish is the bull-drum peak", seasonAlignmentLabel(red.Oct / 3) === "peak");
  check("VA Beach September cobia is good (cooling, still in the lower bay)",
    seasonAlignmentLabel(cob.Sep / 3) === "good");
  check("VA Beach November cobia is off (gone south)", seasonAlignmentLabel(cob.Nov / 3) === "off");
  const hab = effectiveSpeciesHabitat("redfish");
  check("redfish habitat does not include nearshore ocean", !hab.includes("nearshore") && !hab.includes("offshore"));
  check("redfish ceiling stays inside the 30 ft inshore bucket",
    PREDICT_SPECIES_PREFS.redfish.depthBands[0][1] * 3.28084 < 30);
}

console.log("\nGulf yellowfin / mahi / wahoo treat Loop water and LA lumps as habitat:");
{
  const venice = PORTS["Venice, LA"];
  const hat = PORTS["Hatteras, NC"];
  check("Venice is Gulf", isGulfContext(venice.lat, venice.lng));
  check("Hatteras is not Gulf", !isGulfContext(hat.lat, hat.lng));
  check("Venice yellowfin uses Gulf prefs", usesGulfSpeciesPrefs("yellowfin", venice.lat, venice.lng));
  check("Hatteras yellowfin stays on the Atlantic table",
    !usesGulfSpeciesPrefs("yellowfin", hat.lat, hat.lng));
  const gY = GULF_SPECIES_PREFS.yellowfin;
  const aY = PREDICT_SPECIES_PREFS.yellowfin;
  check("Gulf yellowfin working top is 88°F", gY.tempWorking[1] === 88);
  check("Atlantic yellowfin working top stays 82°F", aY.tempWorking[1] === 82);
  check("86°F Loop water is fishable for Gulf yellowfin", pelagicTempScore(86, gY) >= 0.9);
  check("86°F is lethal on the Atlantic yellowfin cap", pelagicTempScore(86, aY) < 0.1);
  check("200 ft Midnight Lump is in-band in the Gulf",
    depthBandScore(200 / 3.28084, gY.depthBands) >= 0.9);
  check("108 ft Mid-Atlantic shelf stays out on the Atlantic table",
    depthBandScore(108 / 3.28084, aY.depthBands) < 0.2);
  check("Gulf yellowfin keeps edge fronts (Loop eddies)", gY.breakPref === "edge");
  check("Gulf yellowfin pins mapped lumps/rigs", gY.structureProx === true);
  const lump = CANYONS.find(c => c.name === "Midnight Lump");
  check("Midnight Lump lists yellowfin", lump && lump.fish.includes("yellowfin"));
  check("a Midnight Lump cell is on yellowfin structure",
    nearestStructureNm(lump.lat, lump.lng, "yellowfin") < 1);
  const ySeason = getRegionalSeasons("yellowfin", venice.lat, venice.lng);
  check("Venice September yellowfin is peak (fall giants)",
    seasonAlignmentLabel(ySeason.Sep / 3) === "peak");
  check("Venice October yellowfin stays peak",
    seasonAlignmentLabel(ySeason.Oct / 3) === "peak");
  check("Venice January yellowfin is peak (Midnight Lump winter)",
    seasonAlignmentLabel(ySeason.Jan / 3) === "peak");
  check("Gulf yellowfin 200 ft is full blue-water credit",
    bluewaterGateFor("yellowfin", 200 / 3.28084, venice.lat, venice.lng) >= 0.95);
  check("Atlantic yellowfin 80 ft stays suppressed",
    bluewaterGateFor("yellowfin", 80 / 3.28084, hat.lat, hat.lng) < 0.3);

  const gM = GULF_SPECIES_PREFS.mahi;
  const aM = PREDICT_SPECIES_PREFS.mahi;
  check("Gulf mahi working top is 88°F", gM.tempWorking[1] === 88);
  check("Atlantic mahi working top stays 84°F", aM.tempWorking[1] === 84);
  check("88°F Gulf mahi water is fishable", pelagicTempScore(88, gM) >= 0.9);
  check("weed chlorPref stays on Gulf mahi", gM.chlorPref === "weed");
  const floaters = CANYONS.find(c => c.name === "The Floaters (LA)");
  check("Floaters list mahi", floaters && floaters.fish.includes("mahi"));
  const mSeason = getRegionalSeasons("mahi", venice.lat, venice.lng);
  check("Venice September mahi stays good (not off)",
    seasonAlignmentLabel(mSeason.Sep / 3) === "good");

  const gW = GULF_SPECIES_PREFS.wahoo;
  const aW = PREDICT_SPECIES_PREFS.wahoo;
  check("Gulf wahoo working top is 88°F", gW.tempWorking[1] === 88);
  check("Atlantic wahoo working top stays 84°F", aW.tempWorking[1] === 84);
  check("86°F Gulf wahoo water is fishable", pelagicTempScore(86, gW) >= 0.9);
  check("Gulf wahoo chlorPref is any (Mississippi color change)", gW.chlorPref === "any");
  check("Gulf wahoo pins rigs/lumps", gW.structureProx === true);
  const wSeason = getRegionalSeasons("wahoo", venice.lat, venice.lng);
  check("Venice September wahoo is peak",
    seasonAlignmentLabel(wSeason.Sep / 3) === "peak");
  check("Gulf wahoo 200 ft is full blue-water credit",
    bluewaterGateFor("wahoo", 200 / 3.28084, venice.lat, venice.lng) >= 0.95);

  const lumpNm = CANYONS.find(c => c.name === "Midnight Lump");
  check("Floaters are a rig", gulfYellowfinStructureKind(floaters) === "rig");
  check("Midnight Lump is a lump", gulfYellowfinStructureKind(lumpNm) === "lump");
  check("September lift prefers the Floaters over the Lump",
    gulfYellowfinStructureLift(floaters, 8) > gulfYellowfinStructureLift(lumpNm, 8));
  check("January lift prefers the Lump over the Floaters",
    gulfYellowfinStructureLift(lumpNm, 0) > gulfYellowfinStructureLift(floaters, 0));
  check("Gulf yellowfin gets no canyon-depth bonus (deep floaters are not a wall)",
    canyonDepthBoost("yellowfin", [[55, 2000]], 300, venice.lat, venice.lng) === 0);
  check("Atlantic yellowfin still gets a canyon-depth bonus",
    canyonDepthBoost("yellowfin", [[150, 2000]], 250, hat.lat, hat.lng) === 0.10);
  const dFloater = nmBetween(venice.lat, venice.lng, floaters.lat, floaters.lng);
  const dLump = nmBetween(venice.lat, venice.lng, lump.lat, lump.lng);
  check("Floaters are far enough from Midnight Lump to get their own pin",
    nmBetween(floaters.lat, floaters.lng, lump.lat, lump.lng) >= 10);
  const badges = pickTopHotspotBadges([
    { lat: floaters.lat, lng: floaters.lng, score: 0.82, distNm: Math.round(dFloater) },
    { lat: lump.lat, lng: lump.lng, score: 0.78, distNm: Math.round(dLump) },
    { lat: 28.79, lng: -89.18, score: 0.77, distNm: 30 },
    { lat: 29.40, lng: -88.00, score: 0.76, distNm: 72 },
  ], 3);
  check("fall-ranked Floaters take a top-3 badge",
    badges.some(b => Math.abs(b.lat - floaters.lat) < 1e-6 && Math.abs(b.lng - floaters.lng) < 1e-6));
}

function nearshoreWarmTemp(sst, p) {
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
  if (p.warmAdapted && sst >= p.tempIdeal[1]) {
    tempScore = Math.max(tempScore, sst <= warmEdge ? 1 : Math.max(0, 1 - (sst - warmEdge) / 5));
  }
  return tempScore;
}

console.log("\nTampa king mackerel fall run is beaches and Egmont Channel, not 80 ft mid-shelf:");
{
  const tampa = PORTS["Tampa Bay, FL"];
  const hat = PORTS["Hatteras, NC"];
  check("Tampa kings use Gulf prefs", usesGulfSpeciesPrefs("kingmack", tampa.lat, tampa.lng));
  check("Hatteras kings stay on the Atlantic table",
    !usesGulfSpeciesPrefs("kingmack", hat.lat, hat.lng));
  const g = GULF_SPECIES_PREFS.kingmack;
  const a = PREDICT_SPECIES_PREFS.kingmack;
  check("Gulf king floor is ~20 ft (shipping channel / beach)", g.depthBands[0][0] <= 6);
  check("Gulf king ceiling stays inside day-boat wrecks (~130 ft)", g.depthBands[0][1] <= 40);
  check("Atlantic king floor stays ~50 ft", a.depthBands[0][0] >= 15);
  check("Egmont Channel 40 ft is full credit", depthBandScore(40 / 3.281, g.depthBands) === 1);
  check("Pinellas beach 25 ft is fishable", depthBandScore(25 / 3.281, g.depthBands) >= 0.8);
  check("89°F Tampa surface is full credit for Gulf kings", nearshoreWarmTemp(89, g) >= 0.99);
  check("89°F is still a penalty on the Atlantic king table", nearshoreWarmTemp(89, a) < 0.4);
  const west = REGIONAL_SEASONS.kingmack.find(r => /Gulf FL west/.test(r.label));
  check("west Florida September kings are peak (fall run is on)",
    seasonAlignmentLabel(west.seasons.Sep / 3) === "peak");
  const egmont = CANYONS.find(c => c.name === "Egmont Channel");
  check("Egmont Channel is mapped", !!egmont);
  check("Egmont Channel lists king mackerel", egmont.fish.includes("kingmack"));
  check("Egmont Channel is outside the Tampa Bay box (west of -82.75)",
    egmont.lng < -82.75);
  check("Egmont Channel is a short run from Tampa Bay",
    nmBetween(tampa.lat, tampa.lng, egmont.lat, egmont.lng) <= 20);
}

console.log("\nGulf cobia keep fishing 89°F wreck water; Chesapeake fade is unchanged:");
{
  const tampa = PORTS["Tampa Bay, FL"];
  const vb = PORTS["Virginia Beach, VA"];
  check("Tampa cobia use Gulf prefs", usesGulfSpeciesPrefs("cobia", tampa.lat, tampa.lng));
  check("VA Beach cobia stay on the Atlantic table",
    !usesGulfSpeciesPrefs("cobia", vb.lat, vb.lng));
  const g = GULF_SPECIES_PREFS.cobia;
  const a = PREDICT_SPECIES_PREFS.cobia;
  check("89°F is fishable Gulf cobia water", nearshoreWarmTemp(89, g) >= 0.99);
  check("89°F still zeros Atlantic cobia (Chesapeake working cap)",
    nearshoreWarmTemp(89, a) < 0.15);
  const west = REGIONAL_SEASONS.cobia.find(r => /Gulf FL west/.test(r.label));
  check("west Florida September cobia is good (not off)",
    seasonAlignmentLabel(west.seasons.Sep / 3) === "good");
  check("west Florida October cobia is still good",
    seasonAlignmentLabel(west.seasons.Oct / 3) === "good");
}

console.log("\nPanama City blackfin/sailfish nearshore bait-chase is real, not a veto:");
{
  const pcb = PORTS["Panama City, FL"];
  const hat = PORTS["Hatteras, NC"];
  check("PCB blackfin uses Gulf prefs", usesGulfSpeciesPrefs("blackfin", pcb.lat, pcb.lng));
  check("PCB sailfish uses Gulf prefs", usesGulfSpeciesPrefs("sailfish", pcb.lat, pcb.lng));
  const gBf = GULF_SPECIES_PREFS.blackfin;
  const aBf = PREDICT_SPECIES_PREFS.blackfin;
  check("Gulf blackfin floor is ~33 ft (beach bait line)", gBf.depthBands[0][0] <= 10);
  check("Atlantic blackfin floor stays ~80 ft", aBf.depthBands[0][0] >= 25);
  check("40 ft PCB water is in-band for Gulf blackfin",
    depthBandScore(40 / 3.281, gBf.depthBands) >= 0.9);
  check("40 ft Hatteras water is still too skinny on the Atlantic table",
    depthBandScore(40 / 3.281, aBf.depthBands) < 0.5);
  const pcb40 = bluewaterGateFor("blackfin", 40 / 3.28084, pcb.lat, pcb.lng);
  const hat40 = bluewaterGateFor("blackfin", 40 / 3.28084, hat.lat, hat.lng);
  const pcbEdge = bluewaterGateFor("blackfin", 180 / 3.28084, pcb.lat, pcb.lng);
  check("40 ft off PCB is fishable for blackfin (not vetoed)", pcb40 >= 0.5);
  check("40 ft off Hatteras is still nearly vetoed", hat40 < 0.35);
  check("The Edge depth still outranks the beach for blackfin", pcbEdge > pcb40);
  const pcbSail = bluewaterGateFor("sailfish", 50 / 3.28084, pcb.lat, pcb.lng);
  const hatSail = bluewaterGateFor("sailfish", 50 / 3.28084, hat.lat, hat.lng);
  check("50 ft off PCB is fishable for sailfish", pcbSail >= 0.55);
  check("50 ft sailfish gate is gentler in the Gulf than the Atlantic",
    pcbSail > hatSail);
  const edge = CANYONS.find(c => c.name === "The Edge (Destin)");
  check("The Edge lists blackfin", edge && edge.fish.includes("blackfin"));
  check("The Edge lists sailfish", edge && edge.fish.includes("sailfish"));
}

done();
