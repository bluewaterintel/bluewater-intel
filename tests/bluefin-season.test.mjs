/* Atlantic bluefin presence by month, end to end through scoreCell with the
   ocean readers stubbed so every spot sees the same water. Summer fish are in
   New England. Virginia and North Carolina water is too warm for them in
   summer. In the fall they come down the coast: Ocean City in November,
   Virginia Beach in December, Hatteras mid-December through March. */
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
  const env = { nowMs: Date.UTC(2026, 10, 13, 17, 0) };
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
    function solunarScore(){ return 0.5; }
    function nearestSample(){
      const o = __obs;
      return { sst: o(__cell.sst), chlor: o(__cell.chlor), pressure: o(0.5),
        wind: { value: 10, dir: 315, observedAtMs: Date.now() }, waves: o(3),
        tide: { value: null, observedAtMs: null } };
    }
    globalThis.__exported = { scoreCell, getRegionalSeasons, speciesOfferedAt, PORTS };
  `;
  vm.runInContext(bundle, vm.createContext(sandbox), { filename: "bw-bluefin-season.js" });
  return { ...sandbox.__exported, env, cell: sandbox.__cell };
}

const { scoreCell, speciesOfferedAt, PORTS, env, cell } = load();

// Identical bluefin water everywhere, so only the season can separate spots.
Object.assign(cell, { sst: 64, chlor: 0.9, chlorBreak: 0.6, tBreak: 2.5, depthM: 40, structure: 1 });

const SPOTS = {
  oceanCity:   { lat: 38.15, lng: -74.70, name: "20 nm off Ocean City" },
  virginia:    { lat: 36.90, lng: -75.65, name: "Chesapeake Light Tower" },
  oregonInlet: { lat: 36.007, lng: -75.444, name: "off Oregon Inlet" },
  hatteras:    { lat: 35.20, lng: -75.30, name: "Diamond Shoals" },
  jersey:      { lat: 39.60, lng: -73.30, name: "New Jersey canyons" },
  capeCod:     { lat: 42.10, lng: -70.30, name: "Cape Cod Bay" },
};

function at(spot, y, m, d) {
  env.nowMs = Date.UTC(y, m - 1, d, 17, 0);
  const r = scoreCell(spot.lat, spot.lng, "bluefin");
  return { score: r ? r.headlineScore : 0, season: r ? r.seasonStrength : 0 };
}
const pct = (x) => Math.round(x * 100);
function show(label, rows) {
  console.log(`\n${label}:`);
  for (const [k, v] of Object.entries(rows)) console.log(`  ${SPOTS[k].name.padEnd(24)} score ${pct(v.score)}%  season ${v.season}`);
}

{
  const r = Object.fromEntries(Object.keys(SPOTS).map((k) => [k, at(SPOTS[k], 2026, 11, 13)]));
  show("November 13", r);
  check("mid-November Ocean City is at peak season", r.oceanCity.season >= 0.9);
  check("mid-November Ocean City outscores Oregon Inlet", r.oceanCity.score > r.oregonInlet.score);
  check("mid-November Oregon Inlet is not bluefin season yet", r.oregonInlet.season < 0.2);
  check("mid-November Hatteras is not bluefin season yet", r.hatteras.season < 0.2);
  check("mid-November Virginia is building, under Ocean City", r.virginia.season >= 0.4 && r.virginia.season < r.oceanCity.season);
}

{
  const r = Object.fromEntries(Object.keys(SPOTS).map((k) => [k, at(SPOTS[k], 2026, 7, 15)]));
  show("July 15", r);
  check("summer bluefin are in New England", r.capeCod.season >= 0.9);
  check("July Oregon Inlet has no bluefin", r.oregonInlet.season < 0.05);
  check("July Hatteras has no bluefin", r.hatteras.season < 0.05);
  check("July Virginia has no bluefin", r.virginia.season < 0.05);
  check("July Ocean City has no bluefin", r.oceanCity.season < 0.05);
  check("July Cape Cod outscores Oregon Inlet", r.capeCod.score > r.oregonInlet.score);
}

{
  const aug = at(SPOTS.jersey, 2026, 8, 15);
  const jul = at(SPOTS.jersey, 2026, 7, 15);
  console.log(`\nNew Jersey canyons: Aug 15 season ${aug.season}, Jul 15 season ${jul.season}`);
  check("August is the best summer month north of Ocean City", aug.season > jul.season);
  check("August north of Ocean City is light, not peak", aug.season > 0.3 && aug.season < 0.8);
  const oc = at(SPOTS.oceanCity, 2026, 8, 15);
  check("August Ocean City stays off", oc.season < 0.05);
}

{
  const r = Object.fromEntries(Object.keys(SPOTS).map((k) => [k, at(SPOTS[k], 2026, 12, 20)]));
  show("December 20", r);
  check("late-December Virginia is near peak", r.virginia.season >= 0.85);
  check("late-December Hatteras has started", r.hatteras.season >= 0.6);
}

{
  const r = Object.fromEntries(Object.keys(SPOTS).map((k) => [k, at(SPOTS[k], 2027, 1, 20)]));
  show("January 20", r);
  check("January Hatteras is peak", r.hatteras.season >= 0.9);
  check("January Ocean City is off", r.oceanCity.season < 0.05);
  check("January Hatteras outscores Ocean City", r.hatteras.score > r.oceanCity.score);
}

console.log("\nBluefin on the port menu:");
for (const name of ["Ocean City, MD", "Virginia Beach, VA", "Oregon Inlet, NC", "Hatteras, NC", "Cape May, NJ", "Cape Cod, MA"]) {
  const p = PORTS[name];
  check(`${name} offers bluefin`, speciesOfferedAt("bluefin", p.lat, p.lng));
}

done();
