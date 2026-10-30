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
assert.equal(coastForPort("San Diego, CA"), "socal");
assert.equal(coastForPort("Santa Barbara, CA"), "socal");
assert.equal(coastForPort("Ventura, CA"), "socal");
assert.equal(coastForPort("Monterey, CA"), "centralca");
assert.equal(coastForPort("Moss Landing, CA"), "centralca");
assert.equal(coastForPort("Morro Bay, CA"), "centralca");
assert.equal(coastForPort("Port San Luis, CA"), "centralca");
assert.equal(COASTS.socal.lo, 64);
assert.equal(COASTS.socal.hi, 82);
assert.equal(COASTS.centralca.lo, 50);
assert.equal(COASTS.centralca.hi, 72);
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

// SoCal's old 52–74°F picture pinned 74°F and 80°F to the same top red.
// 64–82°F keeps 68, 74, and 80 on different colors, and 80 is not clamped.
assert.equal(rampUnit(80, 52, 74), 1);
const u68 = rampUnit(68, 64, 82);
const u74 = rampUnit(74, 64, 82);
const u80 = rampUnit(80, 64, 82);
assert.ok(u68 > 0.2 && u68 < 0.3, String(u68));
assert.ok(u74 > 0.5 && u74 < 0.62, String(u74));
assert.ok(u80 > 0.85 && u80 < 0.95, String(u80));
const c68 = sstRampRGBA(68, 64, 82);
const c74p = sstRampRGBA(74, 64, 82);
const c80 = sstRampRGBA(80, 64, 82);
assert.notDeepEqual(c68, c74p);
assert.notDeepEqual(c74p, c80);
assert.ok(c80[0] > c74p[0] && c74p[0] > c68[0], "warmer SoCal water gets more red");
assert.ok(c74p[1] > c80[1], "80°F has left the yellows");
// Fall Central Coast water runs about 63–70°F. A 66°F ceiling would pin that
// to one color. 50–72°F keeps 70°F on scale, separates 63 from 70, and still
// leaves a 55°F upwelling day above the floor.
assert.ok(rampUnit(70, 50, 72) < 1, "70°F is not clamped");
assert.equal(rampUnit(66, 50, 66), 1);
const u55 = rampUnit(55, 50, 72);
const u63 = rampUnit(63, 50, 72);
const u70c = rampUnit(70, 50, 72);
assert.ok(u55 > 0.15 && u55 < 0.3, String(u55));
assert.ok(u70c - u63 > 0.25, String(u70c - u63));
assert.ok(sstRampRGBA(63, 50, 72)[0] < sstRampRGBA(70, 50, 72)[0], "70 is redder than 63");

function contains(coast, lat, lng){
  return lat >= coast.s && lat <= coast.n && lng >= coast.w && lng <= coast.e;
}
assert.ok(contains(COASTS.socal, 32.723, -117.174), "San Diego");
assert.ok(contains(COASTS.socal, 32.45, -119.18), "Cortes Bank");
assert.ok(contains(COASTS.socal, 31.95, -117.35), "Upper Hidden Bank");
assert.ok(contains(COASTS.socal, 34.403, -119.692), "Santa Barbara");
assert.ok(!contains(COASTS.centralca, 34.403, -119.692), "Santa Barbara stays off the cold ramp");
assert.ok(COASTS.socal.n - 34.403 >= 0.5, "Santa Barbara sits clear of the SoCal fade");
assert.ok(contains(COASTS.centralca, 36.604, -121.888), "Monterey");
assert.ok(contains(COASTS.centralca, 36.804, -121.786), "Moss Landing");
assert.ok(contains(COASTS.centralca, 35.369, -120.854), "Morro Bay");
assert.ok(contains(COASTS.centralca, 35.171, -120.754), "Port San Luis");
assert.ok(35.171 - COASTS.centralca.s >= 0.5, "Port San Luis sits clear of the Central Coast fade");
assert.ok(contains(COASTS.socal, 35.171, -120.754), "Port San Luis also sits in the SoCal overlap");
assert.ok(COASTS.socal.n - COASTS.centralca.s >= 0.5, "overlap covers the half-degree feather");

const manifest = JSON.parse(readFileSync(new URL("../sst-composite.json", import.meta.url), "utf8"));
assert.equal(manifest.rev, MANIFEST_REV);
assert.equal(manifest.coasts.pacific, undefined);
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

// Every home port in the picker has a picture.
const groups = core.slice(core.indexOf("const PORT_GROUPS = "), core.indexOf("function buildPortDropdown"));
const names = [...groups.matchAll(/"([^"]+)"/g)].map(m => m[1]).filter(n => n.includes(","));
assert.ok(names.length > 80, String(names.length));
for(const name of names){
  assert.ok(PORT_COAST[name], "missing picture for " + name);
}

console.log("sst-composite.test.mjs OK", { u79, u84, ports: names.length });
