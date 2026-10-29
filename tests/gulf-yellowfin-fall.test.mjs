/* Venice fall yellowfin, end to end through scoreCell with stubbed readers:
   a strong warm current must not trim a peak month, 78-82°F Loop water is full
   temperature credit, and the BSEE floaters count as yellowfin structure. */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeChecker } from "./load-bw.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "bw-freshness.js", "bw-breaks.js", "bw-data-ports.js", "bw-data-species.js",
  "bw-data-canyons.js", "bw-data-closures.js", "bw-data-bathy.js",
  "bw-data-encyclopedia.js", "bw-platforms-gom.js", "bw-core.js",
];

const { check, done } = makeChecker();

function load() {
  const env = { nowMs: Date.UTC(2026, 9, 28, 18, 0) };
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [env.nowMs])); }
    static now() { return env.nowMs; }
  }
  const sandbox = {
    console, Math, Date: FixedDate, JSON, isFinite, isNaN, parseFloat, parseInt,
    Set, Map, Array, Object, String, Number, Promise, RegExp, Error,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const el = () => ({ style: {}, appendChild() {}, setAttribute() {}, classList: { add() {}, remove() {}, toggle() {} } });
  sandbox.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: el, addEventListener: () => {}, body: el(), documentElement: el(),
  };
  sandbox.navigator = { userAgent: "node", onLine: true };
  sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sandbox.location = { href: "http://localhost/", search: "", protocol: "http:" };
  sandbox.addEventListener = () => {};
  sandbox.fetch = () => Promise.reject(new Error("no network in tests"));
  sandbox.L = new Proxy(function () {}, { get: () => sandbox.L, apply: () => sandbox.L, construct: () => sandbox.L });
  sandbox.__cell = {};
  let bundle = "";
  for (const f of FILES) bundle += readFileSync(join(ROOT, f), "utf8") + "\n;\n";
  // Later declarations replace the live-feed readers with this cell's inputs.
  bundle += `
    function __obs(v){ return v == null ? { value: null, observedAtMs: null } : { value: v, observedAtMs: Date.now() }; }
    function sstGridAt(){ return __obs(__cell.sst); }
    function chlorGridAt(){ return __obs(__cell.chlor); }
    function chlorBreakGrid(){ return __cell.chlorBreak; }
    function thermalBreakReal(){ return __cell.tBreak; }
    function predictDepth(){ return __cell.depthM; }
    function bottomStructureStrengthAt(){ return __cell.slope; }
    function sshBreakAt(){ return null; }
    function currentShearAt(){ return null; }
    function sampleCurrentGrid(){ return { driftKts: __cell.driftKt }; }
    function reportsBoost(){ return 0; }
    function solunarScore(){ return 0.5; }
    function nearestSample(){
      const o = __obs;
      return { sst: o(__cell.sst), chlor: o(__cell.chlor), pressure: o(0),
        wind: { value: 13, dir: 60, observedAtMs: Date.now() }, waves: o(4.2),
        tide: { value: null, observedAtMs: null } };
    }
    PREDICT_CUR_GRID = { stub: true };
    function __structure(premium){
      BW_PREMIUM = premium;
      const port = PORTS["Venice, LA"];
      const c = collectPredictStructureCandidates(port, 120, "yellowfin");
      precomputePredictStructureNear(27.6, 29.4, -90.6, -87.6, 0.05, 27.6, -90.6, c);
      return c;
    }
    globalThis.__exported = { scoreCell, __structure };
  `;
  vm.runInContext(bundle, vm.createContext(sandbox), { filename: "bw-gulf-yellowfin.js" });
  return { ...sandbox.__exported, env, cell: sandbox.__cell };
}

const { scoreCell, __structure, env, cell } = load();

// Mars / Ursa / Olympus block, ~66 nm SSE of Venice, 3,000+ ft.
const MARS = { lat: 28.17, lng: -89.22 };
// Open Loop water between the floaters, no platform within 6 nm.
const OPEN = { lat: 28.05, lng: -88.70 };
const BASE = { sst: 80, chlor: 0.4, chlorBreak: 0.3, tBreak: 2.5, depthM: 950, slope: 0.2, driftKt: 1.6 };

function score(at, over = {}, whenMs) {
  Object.assign(cell, BASE, over);
  if (whenMs) env.nowMs = whenMs;
  return scoreCell(at.lat, at.lng, "yellowfin");
}
const pct = (r) => Math.round(r.headlineScore * 100);
const temp = (r) => r.factors.find((f) => f.key === "temp");
const structure = (r) => r.factors.find((f) => f.key === "structure");

console.log("\nPeak season survives a strong warm current:");
{
  const slack = score(OPEN, { driftKt: 0 });
  const flowing = score(OPEN, { driftKt: 1.6 });
  console.log(`  open Loop water, slack ${pct(slack)}% vs 1.6 kt ${pct(flowing)}%`);
  check("late-October Venice yellowfin is peak season", slack.seasonStrength >= 0.99);
  check("a 1.6 kt warm current does not lower the peak-season score", flowing.headlineScore >= slack.headlineScore - 0.005);
}

console.log("\nFall Loop water is full temperature credit:");
for (const sst of [77, 80, 83]) {
  const r = score(OPEN, { sst });
  console.log(`  ${sst}°F quality ${temp(r).quality.toFixed(2)}`);
  check(`${sst}°F Gulf yellowfin water scores full temperature`, temp(r).quality >= 0.99);
}
check("72°F (below the Gulf ideal) is still discounted", temp(score(OPEN, { sst: 72 })).quality < 0.7);

console.log("\nBSEE floaters are yellowfin structure:");
{
  const free = __structure(false);
  const freeMars = score(MARS);
  const prem = __structure(true);
  const premMars = score(MARS);
  const premOpen = score(OPEN);
  console.log(`  candidates free ${free.length} / premium ${prem.length}`);
  console.log(`  Mars ${pct(premMars)}% (${structure(premMars).raw}) · open ${pct(premOpen)}% (${structure(premOpen).raw}) · Mars free ${pct(freeMars)}%`);
  check("premium Gulf yellowfin structure includes BSEE platforms", prem.some((c) => c.canyon && c.canyon.type === "pf" && /Mars/.test(c.canyon.name)));
  check("Mars reads as rig structure", structure(premMars).quality >= 0.7 && /rig\/lump/.test(structure(premMars).raw));
  check("open water away from rigs keeps the slope score", structure(premOpen).quality <= 0.25);
  check("Mars beats open Loop water", premMars.headlineScore > premOpen.headlineScore);
  check("peak fall Mars headline reads 75%+", pct(premMars) >= 75);
}

done();
