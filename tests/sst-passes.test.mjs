// Hourly SST passes: one GOES-19 hour for the viewport, clouds left blank,
// nothing written to file storage. The bite-score path stays on daily MUR.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ocean = readFileSync(join(root, "supabase/functions/ocean/index.ts"), "utf8");
const oceanJs = readFileSync(join(root, "bw-ocean.js"), "utf8");
const core = readFileSync(join(root, "bw-core.js"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");

assert.match(ocean, /goes19SSThourly/);
assert.match(ocean, /back \* 3600/);
assert.match(ocean, /mode === "sstpass"/);
assert.match(ocean, /No granules are stored/);
assert.doesNotMatch(ocean, /storage\.from|sat-passes/);

assert.match(oceanJs, /mode: "sstpass"/);
assert.match(oceanJs, /fetchSstPass/);
assert.match(oceanJs, /data\.cloud/);

assert.match(core, /sstProduct === "goes"/);
assert.match(core, /keepClouds/);
assert.match(core, /GOES-19 hourly · clouds stay blank/);
assert.match(html, /id="sst-product-goes"/);
assert.match(html, /Hourly passes/);
assert.match(html, /does not use file storage/);

const passStart = core.indexOf("_requestGoesPass:");
const passEnd = core.indexOf("_draw: function()", passStart);
assert.ok(passStart > 0 && passEnd > passStart);
const passBody = core.slice(passStart, passEnd);
assert.match(passBody, /fetchSstPass/);
assert.match(passBody, /_sstHideGibsFallback/);
assert.doesNotMatch(passBody, /_sstShowGibsFallback/);

// Time axis is seconds since 1970, so N hours back is last-(N*3600), not last-N.
function goesTimeConstraint(hoursBack){
  const h = Math.max(0, Math.min(48, Math.round(hoursBack)));
  return h <= 0 ? "(last)" : `(last-${h * 3600})`;
}
assert.equal(goesTimeConstraint(0), "(last)");
assert.equal(goesTimeConstraint(6), "(last-21600)");
assert.equal(goesTimeConstraint(48), "(last-172800)");
assert.equal(goesTimeConstraint(99), "(last-172800)");

function goesStride(targetDeg){
  const step = Math.max(0.02, Math.min(0.10, targetDeg));
  return Math.max(1, Math.round(step / 0.02));
}
assert.equal(goesStride(0.04), 2);
assert.equal(goesStride(0.02), 1);

console.log("sst-passes.test.mjs OK");
