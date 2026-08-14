/* Shared test harness: load the browser-side app scripts under node.

   bw-core.js and the bw-data-* modules are classic <script> files, not ES
   modules (deliberately — file:// offline breaks with modules). To test them we
   run them in a vm context with enough of the DOM/Leaflet surface stubbed that
   their top-level code completes.

   Top-level `const` in a vm script stays in script scope rather than landing on
   the context object, so every file is concatenated into ONE script and the
   requested bindings are handed out explicitly at the end. */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load order matches index.html: data modules before bw-core.js.
const DEFAULT_FILES = [
  "bw-data-ports.js",
  "bw-data-species.js",
  "bw-data-canyons.js",
  "bw-data-bathy.js",
  "bw-data-closures.js",
  "bw-breaks.js",
  "bw-core.js",
];

function makeSandbox() {
  const sandbox = {
    console, Math, Date, JSON, isFinite, isNaN, parseFloat, parseInt,
    Set, Map, Array, Object, String, Number, Promise, RegExp, Error,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const stubEl = () => ({
    style: {}, appendChild() {}, setAttribute() {},
    classList: { add() {}, remove() {}, toggle() {} },
  });
  sandbox.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: stubEl,
    addEventListener: () => {},
    body: stubEl(),
    documentElement: stubEl(),
  };
  sandbox.navigator = { userAgent: "node", onLine: true };
  sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sandbox.location = { href: "http://localhost/", search: "", protocol: "http:" };
  sandbox.addEventListener = () => {};
  sandbox.fetch = () => Promise.reject(new Error("no network in tests"));
  // Leaflet is only touched by map wiring we never exercise here.
  sandbox.L = new Proxy(function () {}, {
    get: () => sandbox.L, apply: () => sandbox.L, construct: () => sandbox.L,
  });
  return sandbox;
}

/**
 * Load the app scripts and return the named globals.
 * @param {string[]} want  global identifiers to extract
 * @param {string[]} [files]  override the file list
 */
export function loadBw(want, files = DEFAULT_FILES) {
  const sandbox = makeSandbox();
  let bundle = "";
  for (const f of files) bundle += readFileSync(join(ROOT, f), "utf8") + "\n;\n";
  bundle += `globalThis.__exported = { ${want.join(", ")} };\n`;
  vm.runInContext(bundle, vm.createContext(sandbox), { filename: "bw-bundle.js" });
  const out = sandbox.__exported;
  const missing = want.filter((n) => typeof out?.[n] === "undefined");
  if (missing.length) throw new Error("missing globals: " + missing.join(", "));
  return out;
}

/** Minimal check/report helper shared by the suites. */
export function makeChecker() {
  const state = { pass: 0, fail: 0 };
  const check = (name, cond) => {
    if (cond) { state.pass++; console.log("  ✓", name); }
    else { state.fail++; console.log("  ✗ FAIL:", name); }
  };
  const done = () => {
    console.log(`\n${state.pass} passed, ${state.fail} failed`);
    process.exit(state.fail ? 1 : 0);
  };
  return { check, done, state };
}
