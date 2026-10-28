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
assert.match(core, /const step = _sstStepFromRows\(data\.rows, data\.stepDeg \|\| 0\.0833\)/);

const stepStart = core.indexOf("function _sstStepFromRows");
const stepEnd = core.indexOf("function applySstForecastGrid");
assert.ok(stepStart > 0 && stepEnd > stepStart);
const stepBox = { Math, Set, isFinite };
vm.runInNewContext(core.slice(stepStart, stepEnd) + "\nglobalThis._sstStepFromRows = _sstStepFromRows;", stepBox);
const stepFromRows = stepBox._sstStepFromRows;

// Open-Meteo snaps to 1/12° and still reports the requested 0.05° step.
const snapped = [];
for(let i = 0; i < 12; i++){
  for(let j = 0; j < 12; j++) snapped.push([35 + i / 12, -76 + j / 12, 70]);
}
const snappedStep = stepFromRows(snapped, 0.05);
assert.ok(Math.abs(snappedStep - 1 / 12) < 0.001, String(snappedStep));

// A matching MUR/GOES stride stays put, including one cloud-skipped row.
const aligned = [];
for(let i = 0; i < 10; i++){
  for(let j = 0; j < 8; j++){
    if(i === 4) continue;
    aligned.push([35 + i * 0.06, -76 + j * 0.06, 72]);
  }
}
assert.equal(stepFromRows(aligned, 0.06), 0.06);

console.log("sst-color-range.test.mjs OK", { shelfAndStream, wall, summer, snappedStep });
