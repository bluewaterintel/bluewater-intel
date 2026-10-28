// The SST rainbow has to cover shelf water and Stream water in the same view.
// A 10°F window centered on the middle was pinning the shelf to one navy and
// the Stream to one maroon.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const core = readFileSync(join(root, "bw-core.js"), "utf8");
const start = core.indexOf("function sstDisplayEnds");
const end = core.indexOf("function _sstForecastRGBA");
assert.ok(start > 0 && end > start);
const sandbox = { Math };
vm.runInNewContext(core.slice(start, end) + "\nglobalThis.sstDisplayEnds = sstDisplayEnds;", sandbox);
const sstDisplayEnds = sandbox.sstDisplayEnds;

function ends(vals){
  return sstDisplayEnds([...vals].sort((a, b) => a - b));
}

const mixed = [];
for(let i = 0; i < 80; i++) mixed.push(68);
for(let i = 0; i < 120; i++) mixed.push(80);
const shelfAndStream = ends(mixed);
assert.ok(shelfAndStream.lo <= 69, JSON.stringify(shelfAndStream));
assert.ok(shelfAndStream.hi >= 79, JSON.stringify(shelfAndStream));
assert.ok(shelfAndStream.hi - shelfAndStream.lo >= 11, JSON.stringify(shelfAndStream));
assert.ok(shelfAndStream.hi - shelfAndStream.lo <= 20.5, JSON.stringify(shelfAndStream));

const hatteras = [];
for(let i = 0; i < 50; i++) hatteras.push(65 + (i % 8));
for(let i = 0; i < 50; i++) hatteras.push(78 + (i % 5));
const wall = ends(hatteras);
assert.ok(wall.lo <= 67, JSON.stringify(wall));
assert.ok(wall.hi >= 80, JSON.stringify(wall));

const flat = [];
for(let i = 0; i < 100; i++) flat.push(80 + (i % 5) * 0.2);
const summer = ends(flat);
assert.ok(summer.hi - summer.lo >= 6, JSON.stringify(summer));
assert.ok(summer.hi - summer.lo <= 8, JSON.stringify(summer));

assert.match(core, /g\.step <= 0\.03 \? 4 : \(g\.step <= 0\.06 \? 6 : 8\)/);

console.log("sst-color-range.test.mjs OK", { shelfAndStream, wall, summer });
