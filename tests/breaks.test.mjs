/* Tests for bw-breaks.js — local front gradients and convergence scoring.

   The behaviour under test is the fix for "Front convergence reads 100% at every
   bite-map spot": the detectors must report the gradient AT a point (so it falls
   off away from a front) rather than the sharpest edge anywhere nearby, and the
   0..1 ramps must keep discriminating instead of pegging on the Gulf Stream. */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dir, "../bw-breaks.js"), "utf8");
const sandbox = { globalThis: null };
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox);
const {
  localGradientPer10nm, sstBreak, chlorBreak,
  sstEdgeStrength, chlorEdgeStrength, sshEdgeStrength, currentEdgeStrength,
  convergenceScore, frontConvergence, analyze,
} = sandbox.BW_BREAKS;

let pass = 0, fail = 0;
const approx = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗ FAIL:", name); }
}

// A Hatteras-style wall: SST climbs 79→85°F across a ~4 nm front at lng -75.2,
// chlorophyll drops 0.55→0.06 across the same line. Sampled on the app's grid.
const WALL_LNG = -75.2, MID_LAT = 35.5;
const nmToDegLng = nm => nm / 60 / Math.cos(MID_LAT * Math.PI / 180);
function frontSamples(stepDeg) {
  const out = [];
  for (let la = 34.8; la <= 36.2; la += stepDeg) {
    for (let ln = -76.4; ln <= -74.0; ln += stepDeg) {
      const x = (ln - WALL_LNG) / nmToDegLng(4);
      out.push({ la, ln, p: { sst: { value: 82 + 3 * Math.tanh(x) },
                              chlor: { value: 0.305 - 0.245 * Math.tanh(x) } } });
    }
  }
  return out;
}
const samples = frontSamples(0.05);
const atNm = off => WALL_LNG + nmToDegLng(off);

console.log("local gradient falls off away from a front:");
{
  const onWall = sstBreak(samples, MID_LAT, atNm(0), 18);
  const near   = sstBreak(samples, MID_LAT, atNm(10), 18);
  const far    = sstBreak(samples, MID_LAT, atNm(30), 18);
  check("reads a real gradient on the wall", onWall > 1.5);
  check("decays 10 nm off the wall", near < onWall * 0.75);
  check("30 nm off the wall is nearly flat", far < 0.35);
  check("strictly decreasing with distance", onWall > near && near > far);

  const chl = chlorBreak(samples, MID_LAT, atNm(0), 18);
  check("chlorophyll edge detected on the same line", chl > 0.1);
  check("chlorophyll edge decays off the line", chlorBreak(samples, MID_LAT, atNm(30), 18) < chl * 0.5);
}

console.log("\ngradient magnitude is correct and orientation-independent:");
{
  // Pure north-south ramp: 1°F per nm => 10 per 10 nm.
  const ns = [];
  for (let la = 35.0; la <= 36.0; la += 0.02) ns.push({ la, ln: -75.0, v: (la - 35.0) * 60 });
  check("north-south ramp reads 10/10nm", approx(localGradientPer10nm(ns, 35.5, -75.0, 20), 10, 0.1));

  // Same ramp rotated east-west.
  const ew = [];
  const cos = Math.cos(35.5 * Math.PI / 180);
  for (let ln = -75.6; ln <= -74.4; ln += 0.02) ew.push({ la: 35.5, ln, v: (ln + 75.6) * 60 * cos });
  check("east-west ramp reads the same", approx(localGradientPer10nm(ew, 35.5, -75.0, 20), 10, 0.1));

  const flat = ns.map(s => ({ ...s, v: 77 }));
  check("uniform water reads zero gradient", localGradientPer10nm(flat, 35.5, -75.0, 20) < 1e-6);
  check("too few samples withholds a gradient", localGradientPer10nm(ns.slice(0, 2), 35.5, -75.0, 20) === 0);
}

console.log("\nedge ramps stay continuous instead of pegging:");
{
  check("SST ramp is strictly increasing", sstEdgeStrength(1) < sstEdgeStrength(2)
    && sstEdgeStrength(2) < sstEdgeStrength(4) && sstEdgeStrength(4) < sstEdgeStrength(6));
  check("a 4°F/10nm break is strong but not maxed", sstEdgeStrength(4) > 0.7 && sstEdgeStrength(4) < 1);
  check("only an exceptional wall reaches 1.0", sstEdgeStrength(8) >= 1 && sstEdgeStrength(20) <= 1);
  check("chlor ramp is strictly increasing", chlorEdgeStrength(0.08) < chlorEdgeStrength(0.15)
    && chlorEdgeStrength(0.15) < chlorEdgeStrength(0.30) && chlorEdgeStrength(0.30) < chlorEdgeStrength(0.45));
  check("a 0.30 color front is strong but not maxed", chlorEdgeStrength(0.30) > 0.7 && chlorEdgeStrength(0.30) < 1);
  check("SSH and current ramps stay ordered",
    sshEdgeStrength(0.045) < sshEdgeStrength(0.09) && sshEdgeStrength(0.09) < sshEdgeStrength(0.16)
    && currentEdgeStrength(0.4) < currentEdgeStrength(0.8) && currentEdgeStrength(0.8) < currentEdgeStrength(1.5));
  check("no edge reads zero", sstEdgeStrength(0) === 0 && chlorEdgeStrength(0) === 0
    && sshEdgeStrength(0) === 0 && currentEdgeStrength(0) === 0);
}

console.log("\nconvergence needs both edges and does not saturate:");
{
  check("temp break with no color edge is not a convergence", convergenceScore(5, 0) === 0);
  check("color edge with no temp break is not a convergence", convergenceScore(0, 0.5) === 0);
  check("both edges together score", convergenceScore(4, 0.30) > 0.6);
  check("a strong convergence stops short of 100%", convergenceScore(5, 0.35) < 1);
  check("sharper edges outscore merely strong ones",
    convergenceScore(3, 0.2) < convergenceScore(6, 0.45));

  const strong = convergenceScore(5, 0.35);
  check("dynamic confirmation raises the score", frontConvergence(strong, 0.8, 0.8) > strong);
  check("dynamic confirmation cannot peg it at 100%", frontConvergence(strong, 1, 1) < 1);
  check("full agreement everywhere still stays under 1", frontConvergence(convergenceScore(20, 2), 1, 1) <= 1);
  check("cloud-masked SST/chlor still registers a dynamic front",
    frontConvergence(0, 0.9, 0.9) > 0 && frontConvergence(0, 0.9, 0.9) < 0.6);
}

console.log("\nconvergence discriminates across the bite-map band:");
{
  // The regression that started this: every spot within ~18 nm of the wall used
  // to report an identical 100%.
  const band = [0, 6, 12, 18, 24].map(off => {
    const a = analyze(samples, MID_LAT, atNm(off), 3);
    return { off, conv: a.convergence };
  });
  band.forEach(b => console.log(`    ${String(b.off).padStart(2)} nm off wall → ${(b.conv * 100).toFixed(0)}%`));
  const values = band.map(b => b.conv);
  check("no two distances report the same convergence", new Set(values.map(v => v.toFixed(3))).size === values.length);
  check("nothing in the band pegs at 100%", values.every(v => v < 1));
  check("convergence is highest on the wall", values[0] === Math.max(...values));
  check("convergence decays with distance", values[0] > values[2] && values[2] >= values[4]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
