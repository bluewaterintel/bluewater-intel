import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import {
  COASTS, MANIFEST_REV, PORT_COAST, SST_RAMP_STOPS, coastForPort, sstRampRGBA, rampUnit,
} from "../scripts/sst-composite-lib.mjs";

const core = readFileSync(new URL("../bw-core.js", import.meta.url), "utf8");

assert.equal(coastForPort("Oregon Inlet, NC"), "carolinas");
assert.equal(coastForPort("Portland, ME"), "newengland");
assert.equal(coastForPort("Virginia Beach, VA"), "midatlantic");
assert.equal(coastForPort("Stuart, FL"), "southflorida");
assert.equal(coastForPort("Vero Beach, FL"), "carolinas");
assert.equal(coastForPort("Venice, LA"), "gulf");
assert.equal(coastForPort("San Diego, CA"), "california");
assert.equal(coastForPort("Santa Barbara, CA"), "california");
assert.equal(coastForPort("Ventura, CA"), "california");
assert.equal(coastForPort("Monterey, CA"), "california");
assert.equal(coastForPort("Moss Landing, CA"), "california");
assert.equal(coastForPort("Morro Bay, CA"), "california");
assert.equal(coastForPort("Port San Luis, CA"), "california");
assert.equal(COASTS.california.lo, 62);
assert.equal(COASTS.california.hi, 82);
assert.equal(COASTS.socal, undefined);
assert.equal(COASTS.centralca, undefined);
assert.equal(COASTS.pacific, undefined);
assert.equal(COASTS.carolinas.lo, 66);
assert.equal(COASTS.carolinas.hi, 88);
assert.ok(COASTS.carolinas.n >= 39, "Carolinas picture covers the Virginia canyons");
assert.ok(COASTS.carolinas.e <= -66, "Carolinas picture continues east of the Stream");
assert.ok(COASTS.midatlantic.s <= 36, "Mid-Atlantic picture sits under the Carolinas edge");

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

// One California ramp. The old 52–74 picture pinned 80°F. Split ramps painted
// 68°F red on the Central Coast and blue in SoCal. 62–82°F keeps 66, 72, and
// 78 on different colors, keeps 80°F on the scale, and puts spring upwelling
// below 62°F on the bottom color.
assert.equal(rampUnit(80, 52, 74), 1);
assert.equal(rampUnit(55, 62, 82), 0);
const u66 = rampUnit(66, 62, 82);
const u72 = rampUnit(72, 62, 82);
const u78 = rampUnit(78, 62, 82);
const u80 = rampUnit(80, 62, 82);
assert.ok(u66 > 0.15 && u66 < 0.25, String(u66));
assert.ok(u72 > 0.45 && u72 < 0.55, String(u72));
assert.ok(u78 > 0.75 && u78 < 0.85, String(u78));
assert.ok(u80 > 0.85 && u80 < 1, String(u80));
const c66 = sstRampRGBA(66, 62, 82);
const c72 = sstRampRGBA(72, 62, 82);
const c78 = sstRampRGBA(78, 62, 82);
assert.notDeepEqual(c66, c72);
assert.notDeepEqual(c72, c78);
assert.ok(c78[0] > c72[0] && c72[0] > c66[0], "warmer California water gets more red");
// The two old ramps disagreed on the same 68°F water at Point Conception.
assert.notDeepEqual(sstRampRGBA(68, 50, 72), sstRampRGBA(68, 64, 82));

function contains(coast, lat, lng){
  return lat >= coast.s && lat <= coast.n && lng >= coast.w && lng <= coast.e;
}
assert.ok(contains(COASTS.california, 32.723, -117.174), "San Diego");
assert.ok(contains(COASTS.california, 32.45, -119.18), "Cortes Bank");
assert.ok(contains(COASTS.california, 31.95, -117.35), "Upper Hidden Bank");
assert.ok(contains(COASTS.california, 34.403, -119.692), "Santa Barbara");
assert.ok(contains(COASTS.california, 35.171, -120.754), "Port San Luis");
assert.ok(contains(COASTS.california, 35.369, -120.854), "Morro Bay");
assert.ok(contains(COASTS.california, 36.604, -121.888), "Monterey");
assert.ok(contains(COASTS.california, 36.804, -121.786), "Moss Landing");
assert.ok(contains(COASTS.california, 37.8, -122.5), "San Francisco water");

const manifest = JSON.parse(readFileSync(new URL("../sst-composite.json", import.meta.url), "utf8"));
assert.equal(manifest.rev, MANIFEST_REV);
assert.equal(manifest.coasts.pacific, undefined);
assert.equal(manifest.coasts.socal, undefined);
assert.equal(manifest.coasts.centralca, undefined);
for(const [id, coast] of Object.entries(COASTS)){
  const painted = manifest.coasts[id];
  assert.ok(painted, "manifest missing " + id);
  assert.equal(painted.file, id + ".png");
  assert.equal(painted.label, coast.label);
  assert.equal(painted.lo, coast.lo);
  assert.equal(painted.hi, coast.hi);
  assert.equal(painted.s, coast.s);
  assert.equal(painted.n, coast.n);
  assert.equal(painted.w, coast.w);
  assert.equal(painted.e, coast.e);
  assert.equal(painted.coreLat, coast.coreLat);
  assert.equal(painted.coreLng, coast.coreLng);
}

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
const reveal = core.slice(core.indexOf("function revealSstCoastPicture"), core.indexOf("function mountSstCoastOverlay"));
assert.match(reveal, /updateSatDateControlVisibility/);

// Every home port in the picker has a picture.
const groups = core.slice(core.indexOf("const PORT_GROUPS = "), core.indexOf("function buildPortDropdown"));
const names = [...groups.matchAll(/"([^"]+)"/g)].map(m => m[1]).filter(n => n.includes(","));
assert.ok(names.length > 80, String(names.length));
for(const name of names){
  assert.ok(PORT_COAST[name], "missing picture for " + name);
}

console.log("sst-composite.test.mjs OK", { u79, u84, ports: names.length });
