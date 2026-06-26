/* Tests for bw-wind.js — pure wind-vector and shading behavior. */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dir, "../bw-wind.js"), "utf8");
const sandbox = { globalThis: null };
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox);
const { vectorFromObservation, interpolateWind, colorForSpeed, KTS_TO_MPS } = sandbox.BW_WIND;

let pass = 0;
let fail = 0;
const approx = (a, b, tol = 0.001) => Math.abs(a - b) <= tol;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗ FAIL:", name); }
}

console.log("wind vector conversion:");
{
  const north = vectorFromObservation({ value: 10, dir: 0, observedAtMs: 123 });
  check("wind from north points south", approx(north.u, 0) && approx(north.v, -10 * KTS_TO_MPS));
  check("preserves meteorological from-direction", north.dirDeg === 0 && north.observedAtMs === 123);

  const east = vectorFromObservation({ value: 8, dir: 90 });
  check("wind from east points west", east.u < 0 && approx(east.v, 0));
  check("missing direction withholds vector", vectorFromObservation({ value: 12, dir: null }) === null);
}

console.log("\nwind interpolation:");
{
  const samples = [
    { lat: 35.0, lng: -75.0, wind: { value: 10, dir: 0, observedAtMs: 1 } },
    { lat: 35.5, lng: -75.0, wind: { value: 20, dir: 0, observedAtMs: 2 } },
  ];
  const exact = interpolateWind(samples, 35.0, -75.0);
  check("exact sample returns that real vector", exact.speedKts === 10 && exact.dirDeg === 0);

  const mid = interpolateWind(samples, 35.25, -75.0);
  check("interpolated speed stays between samples", mid.speedKts > 10 && mid.speedKts < 20);
  check("empty samples withhold wind", interpolateWind([], 35, -75) === null);
}

console.log("\nwind speed shading bands:");
const rgba = (s) => { const m = s.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/); return m ? { r:+m[1], g:+m[2], b:+m[3], a:+m[4] } : null; };
{
  const calm = rgba(colorForSpeed(3));
  check("calm (3kt) is blue-dominant", calm && calm.b > calm.r && calm.b > calm.g);
  check("calm (3kt) is faint (low alpha)", calm && calm.a < 0.35);
  const green = rgba(colorForSpeed(12));
  check("10-15kt is green-dominant", green && green.g > green.r && green.g > green.b);
  const yellow = rgba(colorForSpeed(17));
  check("15-20kt is yellow (r&g high, b low)", yellow && yellow.r > 180 && yellow.g > 180 && yellow.b < 130);
  const orange = rgba(colorForSpeed(22));
  check("20-25kt is orange (r high, g mid, b low)", orange && orange.r > 220 && orange.g > 100 && orange.g < 190 && orange.b < 110);
  const red = rgba(colorForSpeed(28));
  check("25-30kt is red-dominant and bold", red && red.r > 190 && red.g < 100 && red.a > 0.6);
  const pink = rgba(colorForSpeed(34));
  check(">30kt is pink (high r AND high b)", pink && pink.r > 200 && pink.b > 120 && pink.g < 130);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
