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

console.log("\nwind speed shading:");
check("calm wind (<2kt) has no shaded fill", colorForSpeed(1) === "rgba(0,0,0,0)");
check("light wind (3kt) is faintly shaded, not transparent", colorForSpeed(3) !== "rgba(0,0,0,0)");
check("strong wind has visible orange/red fill", /rgba\((200|201|202|203|204|205|206|207|208|209|210|211|212|213|214|215|216|217|218|219|220|221|222|223|224|225|226|227|228|229|230|231|232),/.test(colorForSpeed(28)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
