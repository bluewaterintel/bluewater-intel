import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ocean = readFileSync(join(root, "supabase/functions/ocean/index.ts"), "utf8");
const oceanJs = readFileSync(join(root, "bw-ocean.js"), "utf8");
const core = readFileSync(join(root, "bw-core.js"), "utf8");

assert.match(ocean, /sstOverlayMurTimeoutMs/);
assert.match(ocean, /SST_OVERLAY_MUR_TIMEOUT_MS/);
assert.match(ocean, /timeoutMs: sstOverlayMurTimeoutMs\(\)/);
assert.match(ocean, /retries: 0/);
assert.match(ocean, /Historical MUR slider — no Open-Meteo substitute/);
assert.match(ocean, /open-meteo-marine-sst/);

assert.match(oceanJs, /fetchTimeout\(35000\)/);

assert.match(core, /sstOverlaySourceHint/);
assert.match(core, /open-meteo-marine-sst/);
assert.match(core, /local · model fallback/);

console.log("sst-pfeg-fallback.test.mjs OK");
