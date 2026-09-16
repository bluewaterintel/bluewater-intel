/* Bite-map land gate — CUDEM must not score hotspots on coastline polygons. */
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

function runWithFakeBathy(grid) {
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
  bundle += `PREDICT_BATHY_GRID = ${JSON.stringify(grid)};\n`;
  bundle += `globalThis.__exported = { isOnLand, isPredictWater, predictDepth, pickTopHotspotBadges, predictHeatCellVisible };\n`;
  vm.runInContext(bundle, vm.createContext(sandbox), { filename: "bw-land-gate.js" });
  return sandbox.__exported;
}

console.log("\nPredict land gate (Outer Cape / false-positive CUDEM depth):");
{
  const lat = 42.05;
  const lng = -70.08;
  const fakeGrid = {
    step: 0.01,
    minLat: 42.0,
    minLng: -70.1,
    nLat: 11,
    nLng: 11,
    depth: new Array(121).fill(12.5),
  };
  const { isOnLand, isPredictWater, predictDepth, pickTopHotspotBadges } = runWithFakeBathy(fakeGrid);
  check("North Truro is inside the land polygon", isOnLand(lat, lng));
  check("Positive CUDEM on land still fails isPredictWater", !isPredictWater(lat, lng));
  check("predictDepth on land does not use the false grid depth", predictDepth(lat, lng) <= 0);

  const badges = pickTopHotspotBadges([
    { lat, lng, score: 0.96, distNm: 4 },
    { lat: 42.12, lng: -70.05, score: 0.90, distNm: 8 },
    { lat: 41.95, lng: -69.85, score: 0.88, distNm: 12 },
  ], 3);
  check("Land #1 cell is never chosen as a badge",
    !badges.some(b => Math.abs(b.lat - lat) < 1e-6 && Math.abs(b.lng - lng) < 1e-6));
}

console.log("\nCape Cod Bay in-bay water still scores:");
{
  const lat = 41.88;
  const lng = -70.35;
  const fakeGrid = {
    step: 0.02,
    minLat: 41.8,
    minLng: -70.5,
    nLat: 6,
    nLng: 8,
    depth: new Array(48).fill(8),
  };
  const { isPredictWater } = runWithFakeBathy(fakeGrid);
  check("Cape Cod Bay box stays predict water with positive bathy", isPredictWater(lat, lng));
}

console.log("\nHeat visibility gate matches scoring (Gulf of Maine nearshore):");
{
  const fakeGrid = {
    step: 0.02,
    minLat: 42.5,
    minLng: -71.2,
    nLat: 40,
    nLng: 40,
    depth: new Array(1600).fill(18),
  };
  const { predictHeatCellVisible } = runWithFakeBathy(fakeGrid);
  check("Nearshore Gulf of Maine water is visible for black sea bass",
    predictHeatCellVisible(43.05, -70.55, "blackseabass"));
  check("Beach coords fail on land polygon",
    !predictHeatCellVisible(43.32, -70.58, "blackseabass"));
}

console.log("\nDowneast islands stay land even with false-positive CUDEM:");
{
  const fakeGrid = {
    step: 0.02,
    minLat: 44.10,
    minLng: -68.80,
    nLat: 25,
    nLng: 40,
    depth: new Array(1000).fill(18),
  };
  const { isOnLand, isPredictWater, pickTopHotspotBadges } = runWithFakeBathy(fakeGrid);
  check("Northeast Harbor is inside the MDI land polygon", isOnLand(44.294, -68.289));
  check("Seawall is inside the MDI land polygon", isOnLand(44.241, -68.301));
  check("Stonington town is inside Deer Isle", isOnLand(44.156, -68.667));
  check("Positive CUDEM on Northeast Harbor still fails isPredictWater",
    !isPredictWater(44.294, -68.289));
  check("Positive CUDEM on Stonington town still fails isPredictWater",
    !isPredictWater(44.156, -68.667));
  const badges = pickTopHotspotBadges([
    { lat: 44.241, lng: -68.301, score: 0.96, distNm: 8 },
    { lat: 44.156, lng: -68.667, score: 0.94, distNm: 2 },
    { lat: 44.10, lng: -68.50, score: 0.88, distNm: 12 },
  ], 3, "blackseabass");
  check("Seawall is never chosen as a BSB badge",
    !badges.some(b => Math.abs(b.lat - 44.241) < 1e-6));
  check("Stonington town is never chosen as a BSB badge",
    !badges.some(b => Math.abs(b.lat - 44.156) < 1e-6));
}

done();
