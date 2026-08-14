/* Tests for species-aware bite-map range gating (bw-core.js).

   Background: portFishingRangeNm() is an OFFSHORE reach number (how far a boat
   leaves a given port). It used to gate every species, which put flounder
   hotspots ~100 nm out on the wide west Florida shelf — depth-plausible water
   nobody would run to for a flatfish. speciesRunRangeNm() applies a realistic
   run cap per fishery and takes the tighter of that and the port's own reach.

   These tests also lock in the FL peninsula fix for isGulfContext(), which had a
   flat lng < -82.0 test that misfiled Naples (-81.80) and Fort Myers (-81.95) as
   Atlantic ports. */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");

// bw-core.js is a browser script; stub just enough of the DOM/Leaflet surface
// that its top-level code runs to completion under node.
const sandbox = {
  console, Math, Date, JSON, isFinite, isNaN, parseFloat, parseInt,
  Set, Map, Array, Object, String, Number, Promise, RegExp, Error,
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, appendChild(){}, setAttribute(){}, classList:{add(){},remove(){}} }),
  addEventListener: () => {},
  body: { appendChild(){}, classList:{add(){},remove(){}} },
  documentElement: { style: {}, classList:{add(){},remove(){}} },
};
sandbox.navigator = { userAgent: "node", onLine: true };
sandbox.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };
sandbox.location = { href: "http://localhost/", search: "", protocol: "http:" };
sandbox.addEventListener = () => {};
sandbox.fetch = () => Promise.reject(new Error("no network in tests"));
sandbox.L = new Proxy(function(){}, {
  get: () => sandbox.L, apply: () => sandbox.L, construct: () => sandbox.L,
});

// Top-level `const` stays in script scope under vm, so concatenate every file
// into ONE script and hand the bindings out explicitly at the end.
const FILES = [
  "bw-data-ports.js", "bw-data-species.js", "bw-data-canyons.js",
  "bw-data-bathy.js", "bw-data-closures.js", "bw-breaks.js", "bw-core.js",
];
const WANT = [
  "PORTS", "SPECIES", "PREDICT_SPECIES_PREFS", "SPECIES_RUN_NM",
  "speciesRunRangeNm", "portFishingRangeNm", "isGulfContext", "flPeninsulaDivide",
];
let bundle = "";
for (const f of FILES) bundle += readFileSync(join(root, f), "utf8") + "\n;\n";
bundle += `globalThis.__t = { ${WANT.join(", ")} };\n`;
vm.runInContext(bundle, vm.createContext(sandbox), { filename: "bundle.js" });

const T = sandbox.__t;
const {
  PORTS, SPECIES, PREDICT_SPECIES_PREFS, SPECIES_RUN_NM,
  speciesRunRangeNm, portFishingRangeNm, isGulfContext,
} = T;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗ FAIL:", name); }
}
const catOf = Object.fromEntries(SPECIES.map((s) => [s.id, s.cat]));
const rangeAt = (portName, sp) => speciesRunRangeNm(sp, PORTS[portName]);

console.log("\nthe reported bug — inshore species no longer reach the shelf edge:");
{
  // The original complaint: flounder from Naples painted spots ~100 nm out.
  check("flounder from Naples is capped well inside 40 nm", rangeAt("Naples, FL", "flounder") <= 40);
  check("flounder from Tampa Bay is capped well inside 40 nm", rangeAt("Tampa Bay, FL", "flounder") <= 40);
  check("flounder depth band no longer reaches the outer shelf",
    Math.max(...PREDICT_SPECIES_PREFS.flounder.depthBands.map((b) => b[1])) <= 40);
  check("redfish from Naples stays inshore", rangeAt("Naples, FL", "redfish") <= 30);
  check("bonefish from Key West is a flats range, not a shelf range",
    rangeAt("Key West, FL", "bonefish") <= 20);
}

console.log("\noffshore species are untouched:");
{
  for (const [port, sp] of [
    ["Hatteras, NC", "bluemarlin"], ["Venice, LA", "yellowfin"],
    ["Montauk, NY", "bigeye"], ["Naples, FL", "sailfish"],
  ]) {
    check(`${sp} from ${port} still gets the full port range`,
      rangeAt(port, sp) === portFishingRangeNm(PORTS[port]));
  }
  check("'all species' gets the full port range",
    rangeAt("Morehead City, NC", "all") === portFishingRangeNm(PORTS["Morehead City, NC"]));
  check("an unknown species id falls back to the port range",
    rangeAt("Morehead City, NC", "notafish") === portFishingRangeNm(PORTS["Morehead City, NC"]));
}

console.log("\nlong-run nearshore fisheries keep enough reach:");
{
  // Gulf of Maine groundfish: Stellwagen ~25, Jeffreys ~30, Cashes Ledge ~90.
  check("cod from Gloucester reaches the offshore banks (>=80 nm)",
    rangeAt("Gloucester, MA", "cod") >= 80);
  check("haddock from Portland reaches the offshore banks (>=80 nm)",
    rangeAt("Portland, ME", "haddock") >= 80);
  // Wide west FL shelf: legal red snapper / gag are a 60-100 nm run.
  check("red snapper from Tampa Bay reaches the shelf (>=80 nm)",
    rangeAt("Tampa Bay, FL", "snapper") >= 80);
  check("gag grouper from Clearwater reaches the shelf (>=80 nm)",
    rangeAt("Clearwater, FL", "gaggrouper") >= 80);
  // Mid-Atlantic winter wrecks are 40-70 nm out.
  check("black sea bass from Toms River reaches winter wrecks (>=60 nm)",
    rangeAt("Toms River, NJ", "blackseabass") >= 60);
  // SoCal islands/banks: San Clemente ~55 nm.
  check("CA yellowtail from San Diego reaches the islands (>=60 nm)",
    rangeAt("San Diego, CA", "cayellowtail") >= 60);
}

console.log("\nshort-run fisheries stay short:");
{
  check("spanish mackerel is a beach fishery", rangeAt("Charleston, SC", "spanishmack") <= 30);
  check("sheepshead is a structure/inshore fishery", rangeAt("Charleston, SC", "sheepshead") <= 25);
  check("snook stays inshore", rangeAt("Naples, FL", "snook") <= 25);
  check("speckled trout stays inshore", rangeAt("Venice, LA", "speckledtrout") <= 30);
  check("striper gets NE rip/shoal reach but not offshore reach",
    rangeAt("Point Judith, RI", "striper") >= 25 && rangeAt("Point Judith, RI", "striper") <= 40);
}

console.log("\nthe port's own reach still wins when it is tighter:");
{
  // Oregon Inlet is capped at 85 nm, below the 100 nm cod/haddock cap.
  const oi = portFishingRangeNm(PORTS["Oregon Inlet, NC"]);
  check("Oregon Inlet port range is the binding limit for cod",
    rangeAt("Oregon Inlet, NC", "cod") === Math.min(100, oi));
  check("no species ever exceeds its port's range", SPECIES.every((s) =>
    Object.keys(PORTS).every((p) => speciesRunRangeNm(s.id, PORTS[p]) <= portFishingRangeNm(PORTS[p]))));
  check("every range is a positive finite number", SPECIES.every((s) =>
    Object.keys(PORTS).every((p) => {
      const v = speciesRunRangeNm(s.id, PORTS[p]);
      return isFinite(v) && v > 0;
    })));
}

console.log("\nevery inshore/nearshore species has an explicit cap:");
{
  const missing = SPECIES
    .filter((s) => s.cat === "inshore" || s.cat === "nearshore")
    .filter((s) => SPECIES_RUN_NM[s.id] == null)
    .map((s) => s.id);
  check(`no gaps in the cap table (${missing.join(", ") || "none"})`, missing.length === 0);
  check("inshore caps are all <= nearshore-scale runs", SPECIES
    .filter((s) => s.cat === "inshore")
    .every((s) => SPECIES_RUN_NM[s.id] <= 40));
}

console.log("\nFL peninsula divide — Gulf ports classify as Gulf:");
{
  check("Naples is Gulf", isGulfContext(PORTS["Naples, FL"].lat, PORTS["Naples, FL"].lng));
  check("Fort Myers is Gulf", isGulfContext(PORTS["Fort Myers, FL"].lat, PORTS["Fort Myers, FL"].lng));
  check("Naples now gets the FL Gulf range, not the SE-Atlantic 70",
    portFishingRangeNm(PORTS["Naples, FL"]) === 100);
  check("Fort Myers now gets the FL Gulf range",
    portFishingRangeNm(PORTS["Fort Myers, FL"]) === 100);

  // Atlantic-side ports must NOT flip.
  for (const p of ["Miami, FL", "Fort Lauderdale, FL", "Palm Beach, FL", "Stuart, FL",
                   "Vero Beach, FL", "Port Canaveral, FL", "Jacksonville, FL",
                   "St. Augustine, FL", "Daytona Beach, FL"]) {
    check(`${p} is still Atlantic`, !isGulfContext(PORTS[p].lat, PORTS[p].lng));
  }
  // Keys ports keep their prior two-ocean behavior.
  for (const p of ["Key West, FL", "Marathon, FL", "Islamorada, FL"]) {
    check(`${p} classification unchanged (not Gulf)`, !isGulfContext(PORTS[p].lat, PORTS[p].lng));
  }
  // Gulf ports that were already correct must stay correct.
  for (const p of ["Sarasota, FL", "Clearwater, FL", "Tampa Bay, FL", "Crystal River, FL",
                   "Cedar Key, FL", "Apalachicola, FL", "Panama City, FL", "Destin, FL",
                   "Pensacola, FL", "Dauphin Island, AL", "Biloxi, MS", "Venice, LA",
                   "Grand Isle, LA", "Cameron, LA"]) {
    check(`${p} is still Gulf`, isGulfContext(PORTS[p].lat, PORTS[p].lng));
  }
  // Non-FL Atlantic must be unaffected.
  for (const p of ["Charleston, SC", "Savannah, GA", "Morehead City, NC", "Montauk, NY"]) {
    check(`${p} is not Gulf`, !isGulfContext(PORTS[p].lat, PORTS[p].lng));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
