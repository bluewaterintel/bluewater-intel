#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const core = readFileSync(join(root, "bw-core.js"), "utf8");
const enc = readFileSync(join(root, "bw-data-encyclopedia.js"), "utf8");
const tackle = readFileSync(join(root, "bw-data-tackle.js"), "utf8");
const engine = readFileSync(join(root, "bw-tackle-engine.js"), "utf8");
const species = readFileSync(join(root, "bw-data-species.js"), "utf8");

assert.match(core, /function speciesDisplayName/);
assert.match(core, /return "Pacific Bonito"/);
assert.match(core, /function encyclopediaEntryId/);
assert.match(core, /return "pacificbonito"/);
assert.match(species, /id:"bonito".*Atlantic Bonito/s);

assert.match(enc, /id:"bonito", name:"Atlantic Bonito"/);
assert.match(enc, /id:"pacificbonito", name:"Pacific Bonito"/);

assert.match(tackle, /id:"bn-pac-surface-iron"/);
assert.match(tackle, /bn-deadly-dick.*atlanticBonitoOnly:true/s);
assert.match(engine, /tbIsPacificBonitoTarget/);
assert.match(engine, /item\.atlanticBonitoOnly/);

console.log("pacific-bonito-ui.test.mjs: ok");
