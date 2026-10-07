#!/usr/bin/env node
/**
 * Speckled trout at Stuart / Treasure Coast: estuary only, cool-water season.
 */
import { loadBw, makeChecker } from "./load-bw.mjs";

const {
  classifyWaterType, speciesAllowedInWater, getRegionalSeasons,
  seasonAlignmentLabel, isFishableBaySound, isSeFloridaAtlantic,
} = loadBw([
  "classifyWaterType", "speciesAllowedInWater", "getRegionalSeasons",
  "seasonAlignmentLabel", "isFishableBaySound", "isSeFloridaAtlantic",
]);

const { check, done } = makeChecker();

const STUART_RIVER = { lat: 27.20, lng: -80.25 };
const STUART_OCEAN = { lat: 27.073, lng: -80.118 }; // screenshot pin ~8 nm, 13 ft Atlantic
const MOSQUITO = { lat: 28.75, lng: -80.75 };

console.log("\nSE Florida trout habitat is the river/lagoon, not the Atlantic:");
check("Stuart is SE Florida Atlantic", isSeFloridaAtlantic(STUART_RIVER.lat, STUART_RIVER.lng));
check("St Lucie / Stuart river is bay water",
  classifyWaterType(STUART_RIVER.lat, STUART_RIVER.lng) === "bay");
check("St Lucie / Stuart is a fishable bay/sound box",
  isFishableBaySound(STUART_RIVER.lat, STUART_RIVER.lng));
check("Ocean cell off Sailfish Alley is not bay",
  classifyWaterType(STUART_OCEAN.lat, STUART_OCEAN.lng) !== "bay");
check("Trout allowed in Stuart river",
  speciesAllowedInWater("speckledtrout", "bay", STUART_RIVER.lat, STUART_RIVER.lng));
check("Trout vetoed on SE FL Atlantic inshore strip",
  !speciesAllowedInWater("speckledtrout", "inshore", STUART_OCEAN.lat, STUART_OCEAN.lng));
check("Trout still allowed inshore outside SE FL (Pamlico-style)",
  speciesAllowedInWater("speckledtrout", "inshore", 35.4, -75.6));

console.log("\nTreasure Coast season is cool-water, not September peak:");
const stuart = getRegionalSeasons("speckledtrout", STUART_RIVER.lat, STUART_RIVER.lng);
const mosquito = getRegionalSeasons("speckledtrout", MOSQUITO.lat, MOSQUITO.lng);
check("Stuart has a regional trout curve", !!stuart);
check("Stuart September is not peak (≤1.4 / 3)", !!stuart && stuart.Sep <= 1.4);
check("Stuart January is peak (≥2.5 / 3)", !!stuart && stuart.Jan >= 2.5);
check("Stuart November is peak (≥2.5 / 3)", !!stuart && stuart.Nov >= 2.5);
check("September 1/3 labels off, not peak", seasonAlignmentLabel(1 / 3) === "off");
check("January 3/3 labels peak", seasonAlignmentLabel(1) === "peak");
check("Mosquito Lagoon still has a fall peak in September", !!mosquito && mosquito.Sep >= 2.5);

done();
