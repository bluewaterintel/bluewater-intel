/* Charted wrecks/reefs feed bite-map scoring only — never map markers. */
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

function run(extraSetup){
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
  bundle += extraSetup + "\n";
  bundle += `globalThis.__exported = {
    PORTS, collectPredictStructureCandidates, precomputePredictStructureNear,
    nearestMappedStructure, nmBetween, predictChartedStructureAllowed,
  };\n`;
  vm.runInContext(bundle, vm.createContext(sandbox), { filename: "bw-structure.js" });
  return sandbox.__exported;
}

console.log("\nCharted structure for scoring (not map display):");
{
  const setup = `
    BW_PREMIUM = true;
    window.BW_WAYPOINTS = { wp: [
      ["Portland Test Wreck", 43.05, -70.55, "wk"],
      ["Far Canyon", 28.65, -89.15, "cy"],
    ]};
  `;
  const { PORTS, collectPredictStructureCandidates, precomputePredictStructureNear, nearestMappedStructure } = run(setup);
  const portland = PORTS["Portland, ME"];
  const cands = collectPredictStructureCandidates(portland, 70, "blackseabass");
  check("Portland BSB pool includes nearby charted wreck",
    cands.some(c => c.canyon && String(c.canyon.name).includes("Portland Test Wreck")));
  check("Gulf canyon is outside Portland run range",
    !cands.some(c => c.canyon && c.canyon.name === "Far Canyon"));

  precomputePredictStructureNear(42.9, 43.2, -70.8, -70.4, 0.1, 42.9, -70.8, cands);
  const nearWreck = nearestMappedStructure(43.05, -70.55, "blackseabass");
  check("Nearest structure at the wreck coordinate is the charted pin",
    nearWreck && String(nearWreck.canyon?.name || "").includes("Portland Test Wreck"));
  const open = nearestMappedStructure(43.08, -70.72, "blackseabass");
  check("Open bottom cell is farther from structure than the wreck pin",
    open && nearWreck && open.nm > nearWreck.nm);
}

console.log("\nCharted structure gate without Pro (CANYONS-only fallback in code):");
{
  const setup = `
    BW_PREMIUM = false;
    window.BW_DATA_CONFIG = { embeddedFallback: false };
    window.BW_WAYPOINTS = { wp: [["Hidden Wreck", 43.05, -70.55, "wk"]] };
  `;
  const { PORTS, collectPredictStructureCandidates, predictChartedStructureAllowed } = run(setup);
  check("Charted structure scoring gated off without premium/offline",
    !predictChartedStructureAllowed());
  const portland = PORTS["Portland, ME"];
  const cands = collectPredictStructureCandidates(portland, 70, "blackseabass");
  check("Without entitlement, test wreck is not in the candidate pool",
    !cands.some(c => String(c.canyon?.name || "").includes("Hidden Wreck")));
}

done();
