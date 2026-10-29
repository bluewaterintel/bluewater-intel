/* SoCal wahoo / yellowfin bite score, end to end through scoreCell with the
   ocean readers stubbed: solunar stays a light nudge, the explainer names the
   factor that actually costs points, warm late-season water keeps the fish,
   and the outer banks are inside the yellowfin fishery. */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeChecker } from "./load-bw.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "bw-freshness.js", "bw-breaks.js", "bw-data-ports.js", "bw-data-species.js",
  "bw-data-canyons.js", "bw-data-closures.js", "bw-data-bathy.js",
  "bw-data-encyclopedia.js", "bw-core.js",
];

const { check, done } = makeChecker();

function load() {
  const env = { nowMs: Date.UTC(2026, 9, 28, 20, 0) };
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
    function bottomStructureStrengthAt(){ return __cell.structure; }
    function sshBreakAt(){ return null; }
    function currentShearAt(){ return null; }
    function reportsBoost(){ return 0; }
    function solunarScore(){ return __cell.solunar; }
    function nearestSample(){
      const o = __obs;
      return { sst: o(__cell.sst), chlor: o(__cell.chlor), pressure: o(0.5),
        wind: { value: 7, dir: 300, observedAtMs: Date.now() }, waves: o(2.8),
        tide: { value: null, observedAtMs: null } };
    }
    globalThis.__exported = { scoreCell, PORTS };
  `;
  vm.runInContext(bundle, vm.createContext(sandbox), { filename: "bw-socal-pelagic.js" });
  return { ...sandbox.__exported, env, cell: sandbox.__cell };
}

const { scoreCell, env, cell } = load();

// The reported pin: 38 nm off San Diego, 608 ft, on a 4°F break and color edge.
const PIN = { lat: 33.27, lng: -117.56 };
const BASE = { sst: 73.7, chlor: 0.28, chlorBreak: 0.86, tBreak: 4.0, depthM: 185, structure: 1, solunar: 0 };

function score(species, over = {}, at = PIN, whenMs) {
  Object.assign(cell, BASE, over);
  if (whenMs) env.nowMs = whenMs;
  return scoreCell(at.lat, at.lng, species);
}
const pct = (r) => Math.round(r.headlineScore * 100);
const OCT28 = Date.UTC(2026, 9, 28, 20, 0);
const DEC05 = Date.UTC(2026, 11, 5, 20, 0);

console.log("\nSolunar is a light nudge for SoCal pelagics:");
for (const sp of ["wahoo", "yellowfin"]) {
  const off = score(sp, { solunar: 0 }, PIN, OCT28);
  const major = score(sp, { solunar: 1 }, PIN, OCT28);
  const swing = pct(major) - pct(off);
  console.log(`  ${sp}: solunar off ${pct(off)}% → MAJOR ${pct(major)}% (${swing} pts)`);
  check(`${sp} MAJOR vs off moves the headline 1-4 points`, swing >= 1 && swing <= 4);
  check(`${sp} limiter is not solunar`, !off.limiter || off.limiter.key !== "solunar");
}

console.log("\nExplainer names the real drag:");
{
  const r = score("wahoo", { sst: 67 }, PIN, OCT28);
  console.log(`  wahoo 67°F: ${pct(r)}% · limiter ${JSON.stringify(r.limiter)}`);
  check("cold 67°F wahoo water blames water temperature", r.limiter && r.limiter.key === "temp");
  const late = score("wahoo", {}, PIN, Date.UTC(2026, 10, 12, 20, 0));
  console.log(`  wahoo Nov 12 73.7°F: ${pct(late)}% · limiter ${JSON.stringify(late.limiter)}`);
  check("mid-November wahoo blames the season", late.limiter && late.limiter.key === "season");
  check("season limiter reads as % of peak", late.limiter && /% of peak season/.test(late.limiter.raw));
}

console.log("\nWahoo want 70°F+ bight water:");
{
  const warm = score("wahoo", {}, PIN, OCT28);
  const cold = score("wahoo", { sst: 67 }, PIN, OCT28);
  console.log(`  73.7°F ${pct(warm)}% vs 67°F ${pct(cold)}%`);
  check("73.7°F late-October front still fishes (≥ 55%)", pct(warm) >= 55);
  check("67°F reads well under the warm front", cold.headlineScore < 0.6 * warm.headlineScore);
  const yfCold = score("yellowfin", { sst: 67 }, PIN, OCT28);
  check("67°F is still yellowfin water (beats wahoo there)", yfCold.headlineScore > cold.headlineScore);
}

console.log("\nWarm water extends the shoulder, never a dead month:");
{
  const oct = score("wahoo", {}, PIN, OCT28);
  check("late-October warm water notes the eased season", oct.freshnessAnnotations.some(a => /still warm/.test(a.message)));
  const dec = score("wahoo", {}, PIN, DEC05);
  console.log(`  wahoo Dec 5 at 73.7°F: ${pct(dec)}%`);
  check("December wahoo stays poor even in warm water", dec.headlineScore <= 0.22);
  const yfDec = score("yellowfin", {}, PIN, DEC05);
  check("December yellowfin stays poor", yfDec.headlineScore <= 0.22);
}

console.log("\nOuter banks are SoCal yellowfin water:");
for (const [name, at] of [["Cortes Bank", { lat: 32.45, lng: -119.18 }], ["Tanner Bank", { lat: 32.72, lng: -119.12 }], ["Upper Hidden Bank", { lat: 31.95, lng: -117.35 }]]) {
  const r = score("yellowfin", { sst: 70 }, at, Date.UTC(2026, 8, 15, 20, 0));
  console.log(`  ${name}: ${pct(r)}% outOfRange=${r.outOfRange}`);
  check(`${name} yellowfin is in range in September`, !r.outOfRange && r.inSeason);
  check(`${name} September yellowfin scores well`, pct(r) >= 60);
}

done();
