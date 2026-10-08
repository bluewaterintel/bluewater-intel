import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const core = readFileSync(join(root, "bw-core.js"), "utf8");
const brief = readFileSync(join(root, "supabase/functions/brief/index.ts"), "utf8");

assert.match(core, /function briefForecastLeadHours\(/);
assert.match(core, /fetchOcean\(pinLL\.lat, pinLL\.lng, briefLeadH\)/);
assert.match(core, /forecastSlotNearest/);
assert.match(core, /applyForecastSlotToConditions/);
assert.match(core, /forecastLeadHours: briefLeadH/);
assert.match(core, /withForecastHour\(briefForecastLeadForBiteScore\(\)/);

assert.match(brief, /forecastLeadHours \/ conditionsTimeLabel/);

console.log("brief-forecast-lead.test.mjs OK");
