import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// Load bw-units in Node (IIFE attaches BW_UNITS to globalThis).
const code = readFileSync(join(root, "bw-units.js"), "utf8");
// eslint-disable-next-line no-new-func
new Function(code)();

const U = globalThis.BW_UNITS;
assert.ok(U);

assert.equal(U.formatDistanceNm(29, "nm"), "29 nm");
assert.equal(U.formatDistanceNm(29, "sm"), "33.4 mi");
assert.equal(U.formatDepthFromMeters(30.48, "feet"), "100 ft");
assert.equal(U.formatDepthFromMeters(30.48, "fathoms"), "17 fm");
assert.equal(U.distanceSuffix("sm"), "mi");

const core = readFileSync(join(root, "bw-core.js"), "utf8");
assert.match(core, /depthUnit/);
assert.match(core, /distanceUnit/);
assert.match(core, /function fmtDist\(/);
assert.match(readFileSync(join(root, "index.html"), "utf8"), /pref-depth-unit/);

console.log("units-format.test.mjs OK");
