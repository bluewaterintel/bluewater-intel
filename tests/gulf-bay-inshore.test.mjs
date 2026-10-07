/* Gulf inshore: bays must score, open shelf must not wear a bay label. */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeChecker } from "./load-bw.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "bw-data-ports.js", "bw-data-species.js", "bw-data-canyons.js", "bw-data-bathy.js",
  "bw-data-closures.js", "bw-breaks.js", "bw-core.js",
];

const { check, done } = makeChecker();

function load(){
  const sandbox = {
    console, Math, Date, JSON, isFinite, isNaN, parseFloat, parseInt,
    Set, Map, Array, Object, String, Number, Promise, RegExp, Error,
    setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0),
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, appendChild() {}, classList: { add() {}, remove() {} } }),
    addEventListener: () => {}, body: {}, documentElement: {},
  };
  sandbox.navigator = { userAgent: "node", onLine: true };
  sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sandbox.location = { href: "http://localhost/", search: "", protocol: "http:" };
  sandbox.addEventListener = () => {};
  sandbox.L = new Proxy(function () {}, { get: () => sandbox.L, apply: () => sandbox.L, construct: () => sandbox.L });
  let bundle = "";
  for (const f of FILES) bundle += readFileSync(join(ROOT, f), "utf8") + "\n;\n";
  bundle += `globalThis.__exported = {
    isOnLand, isPredictWater, isFishableBaySound, classifyWaterType,
    speciesAllowedInWater, effectiveSpeciesHabitat, seaDepth
  };\n`;
  vm.runInContext(bundle, vm.createContext(sandbox), { filename: "gulf-bay.js" });
  return sandbox.__exported;
}

const api = load();

console.log("\nChoctawhatchee Bay (Destin) is fishable inshore water:");
{
  const lat = 30.43, lng = -86.40;
  check("bay center sits inside the coarse land polygon", api.isOnLand(lat, lng));
  check("bay center is a fishable bay", api.isFishableBaySound(lat, lng));
  check("bay center is predict water", api.isPredictWater(lat, lng));
  check("bay center classifies as bay", api.classifyWaterType(lat, lng) === "bay");
  check("redfish allowed in the bay", api.speciesAllowedInWater("redfish", "bay", lat, lng));
  check("sheepshead allowed in the bay", api.speciesAllowedInWater("sheepshead", "bay", lat, lng));
}

console.log("\nNearshore reef water off Destin is Gulf, not land:");
{
  // ~5 nm south of the beach, about 80 ft. The old coast vertex at 30.20
  // classified this whole band as land, so the heat map started offshore
  // of the 100 ft reefs.
  check("80 ft water off Destin is not land", !api.isOnLand(30.32, -86.50));
  check("80 ft water off Destin is fishable", api.isPredictWater(30.32, -86.50));
  check("that water is not the bay", !api.isFishableBaySound(30.32, -86.50));
  check("Okaloosa Island stays land", api.isOnLand(30.40, -86.50));
}

console.log("\nOpen Gulf off Destin is not a bay:");
{
  const lat = 30.10, lng = -86.50;
  check("gulf cell is not inside the land polygon", !api.isOnLand(lat, lng));
  check("gulf cell is not a fishable bay", !api.isFishableBaySound(lat, lng));
  check("gulf cell is not classified as bay", api.classifyWaterType(lat, lng) !== "bay");
  const water = api.classifyWaterType(lat, lng);
  check("sheepshead are not allowed on that gulf cell",
    !api.speciesAllowedInWater("sheepshead", water, lat, lng));
  check("redfish are not allowed on that gulf cell",
    !api.speciesAllowedInWater("redfish", water, lat, lng));
}

console.log("\nPanhandle bays that were missing:");
{
  check("Pensacola Bay is fishable", api.isPredictWater(30.42, -87.20));
  check("St. Andrews Bay is fishable", api.isPredictWater(30.15, -85.67));
  check("St. Andrews is bay habitat, not the shelf", api.classifyWaterType(30.15, -85.67) === "bay");
}

console.log("\nSheepshead stay inside 30 ft:");
{
  const hab = api.effectiveSpeciesHabitat("sheepshead");
  check("sheepshead habitat has no nearshore bucket", !hab.includes("nearshore"));
  check("sheepshead habitat has no offshore bucket", !hab.includes("offshore"));
  check("sheepshead still include bay and inshore", hab.includes("bay") && hab.includes("inshore"));
}

done();
