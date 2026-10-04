import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ocean = readFileSync(join(root, "supabase/functions/ocean/index.ts"), "utf8");
const oceanJs = readFileSync(join(root, "bw-ocean.js"), "utf8");
const core = readFileSync(join(root, "bw-core.js"), "utf8");

assert.match(ocean, /daysBack\?: number/);
assert.match(ocean, /singleDayBack != null/);
assert.match(ocean, /daysBackRaw = num\(u\.searchParams\.get\("daysBack"\)\)/);

assert.match(oceanJs, /daysBack = null\)/);
assert.match(oceanJs, /params\.set\("daysBack"/);

assert.match(core, /sstMurDaysBackParam/);
assert.match(core, /sstMurDaysBackParam\(\)/);
assert.match(core, /SST_FORECAST_GRID = null;\s*\n\s*_sstFcFetchSeq\+\+;/);
assert.match(core, /g\.daysBack !== wantMur/);
assert.match(core, /sstLayer = window\.buildSstLayer\(satDayOffset\)/);

console.log("sst-history-slider.test.mjs OK");
