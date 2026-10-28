import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import {
  COASTS, PORT_COAST, SST_RAMP_STOPS, coastForPort, sstRampRGBA, rampUnit,
} from "../scripts/sst-composite-lib.mjs";

const core = readFileSync(new URL("../bw-core.js", import.meta.url), "utf8");

assert.equal(coastForPort("Oregon Inlet, NC"), "carolinas");
assert.equal(coastForPort("Portland, ME"), "newengland");
assert.equal(coastForPort("Virginia Beach, VA"), "midatlantic");
assert.equal(coastForPort("Stuart, FL"), "southflorida");
assert.equal(coastForPort("Vero Beach, FL"), "carolinas");
assert.equal(coastForPort("Venice, LA"), "gulf");
assert.equal(coastForPort("San Diego, CA"), "pacific");
assert.equal(COASTS.carolinas.lo, 66);
assert.equal(COASTS.carolinas.hi, 88);

// A summer Carolina break has to land on different colors. 79°F is still
// in the yellow-greens; 84°F has crossed into the oranges.
const u79 = rampUnit(79, 66, 88);
const u84 = rampUnit(84, 66, 88);
assert.ok(u79 > 0.5 && u79 < 0.66, String(u79));
assert.ok(u84 > 0.75 && u84 < 0.9, String(u84));
const c79 = sstRampRGBA(79, 66, 88);
const c84 = sstRampRGBA(84, 66, 88);
assert.ok(c79[1] > c84[1], "79 stays greener than 84");
assert.ok(c84[0] > c79[0], "84 is redder than 79");

const portBlock = core.slice(core.indexOf("const SST_PORT_COAST = "), core.indexOf("function coastForPort"));
const clientPorts = vm.runInNewContext(portBlock + "\nSST_PORT_COAST;");
assert.deepEqual(
  Object.entries(clientPorts).sort(([a], [b]) => a.localeCompare(b)),
  Object.entries(PORT_COAST).sort(([a], [b]) => a.localeCompare(b)),
);

const stopBlock = core.slice(core.indexOf("const SST_PICTURE_STOPS = "), core.indexOf("function sstPictureRampCss"));
const clientStops = vm.runInNewContext(stopBlock + "\nSST_PICTURE_STOPS;");
assert.equal(JSON.stringify(clientStops), JSON.stringify(SST_RAMP_STOPS));

assert.match(core, /function sstPictureMode\(/);
assert.match(core, /L\.imageOverlay/);
assert.match(core, /sst-composite\.json/);
assert.match(core, /\/sst\/v1\//);
assert.match(core, /sstPictureMode\(\)\)/);

// Every home port in the picker has a picture.
const groups = core.slice(core.indexOf("const PORT_GROUPS = "), core.indexOf("function buildPortDropdown"));
const names = [...groups.matchAll(/"([^"]+)"/g)].map(m => m[1]).filter(n => n.includes(","));
assert.ok(names.length > 80, String(names.length));
for(const name of names){
  assert.ok(PORT_COAST[name], "missing picture for " + name);
}

console.log("sst-composite.test.mjs OK", { u79, u84, ports: names.length });
