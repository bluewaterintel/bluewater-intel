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
const start = core.indexOf("function sstWindowAround");
const end = core.indexOf("function _sstForecastRGBA");
assert.ok(start > 0 && end > start);
const sandbox = { Math };
vm.runInNewContext(core.slice(start, end) + "\nglobalThis.sstDisplayEnds = sstDisplayEnds;\nglobalThis.sstWindowAround = sstWindowAround;", sandbox);
const sstDisplayEnds = sandbox.sstDisplayEnds;

function ends(vals, span){
  return sstDisplayEnds([...vals].sort((a, b) => a - b), span);
}

const mixed = [];
for(let i = 0; i < 80; i++) mixed.push(68);
for(let i = 0; i < 120; i++) mixed.push(80);
const shelfAndStream = ends(mixed, 20);
assert.ok(shelfAndStream.lo <= 68, JSON.stringify(shelfAndStream));
assert.ok(shelfAndStream.hi >= 80, JSON.stringify(shelfAndStream));
assert.ok(shelfAndStream.hi - shelfAndStream.lo >= 20, JSON.stringify(shelfAndStream));
assert.ok(shelfAndStream.hi - shelfAndStream.lo <= 21, JSON.stringify(shelfAndStream));

const wide = ends(mixed, 25);
assert.ok(wide.lo <= 68 && wide.hi >= 80, JSON.stringify(wide));
assert.ok(wide.hi - wide.lo >= 25 && wide.hi - wide.lo <= 26, JSON.stringify(wide));
// Same center: widening the lock does not slide the window onto new water.
assert.ok(Math.abs(((shelfAndStream.lo + shelfAndStream.hi) / 2) - ((wide.lo + wide.hi) / 2)) < 1);

const hatteras = [];
for(let i = 0; i < 50; i++) hatteras.push(65 + (i % 8));
for(let i = 0; i < 50; i++) hatteras.push(78 + (i % 5));
const wall = ends(hatteras, 20);
assert.ok(wall.lo <= 67, JSON.stringify(wall));
assert.ok(wall.hi >= 80, JSON.stringify(wall));

const flat = [];
for(let i = 0; i < 100; i++) flat.push(80 + (i % 5) * 0.2);
const summer = ends(flat, 20);
assert.ok(summer.hi - summer.lo >= 20, JSON.stringify(summer));
assert.ok(summer.hi - summer.lo <= 21, JSON.stringify(summer));
assert.ok(summer.lo <= 80 && summer.hi >= 81, JSON.stringify(summer));

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

assert.match(core, /const SST_RUN_RADIUS_NM = 100/);
assert.match(core, /_sstScaleLocked/);
assert.match(core, /function setSstScaleSpan/);
assert.doesNotMatch(core, /g\._requestStep - want/);

const runStart = core.indexOf("function _sstRunBox");
const runEnd = core.indexOf("function _sstBoxTooBig");
assert.ok(runStart > 0 && runEnd > runStart);
const runBox = { Math };
vm.runInNewContext(
  "const SST_RUN_RADIUS_NM = 100; const SST_CELL_BUDGET = 6000; const SST_STEP_MAX = 0.10;\n"
  + core.slice(runStart, runEnd)
  + "\nglobalThis._sstRunBox = _sstRunBox;\nglobalThis._sstStepForRunBox = _sstStepForRunBox;",
  runBox,
);
const held = runBox._sstRunBox(
  { s: 35.7, n: 35.9, w: -75.6, e: -75.4 },
  { lat: 35.8, lng: -75.55 },
);
assert.ok(held.n - held.s >= 3.2 && held.n - held.s <= 3.5, JSON.stringify(held));
assert.ok(held.s <= 35.7 && held.n >= 35.9, JSON.stringify(held));
const zoomedOut = runBox._sstRunBox(
  { s: 30, n: 40, w: -80, e: -70 },
  { lat: 35, lng: -75 },
);
assert.equal(zoomedOut.s, 30);
assert.equal(zoomedOut.n, 40);
assert.equal(runBox._sstStepForRunBox(held), 0.05);

console.log("sst-color-range.test.mjs OK", { shelfAndStream, wide, wall, summer, snappedStep, held });
