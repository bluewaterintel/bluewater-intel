/* Tests for bw-freshness.js — run with: node supabase-m4/tests/freshness.test.mjs
   Validates the freshness tiers and confidence-degradation behavior against the
   scenarios in the product spec. No network, no synthetic data — pure logic. */

import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dir, "../bw-freshness.js"), "utf8");
const sandbox = { globalThis: null };
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox);
const { freshnessOf, combine, FRESHNESS } = sandbox.BW_FRESHNESS;

let pass = 0, fail = 0;
const approx = (a, b, tol = 0.001) => Math.abs(a - b) <= tol;
function check(name, cond) { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗ FAIL:", name); } }

const H = 3600000;
const now = Date.UTC(2026, 5, 19, 12, 0, 0);

console.log("freshnessOf tiers:");
check("SST 1h = fresh, full weight", (() => { const f = freshnessOf("sst", now - 1 * H, now); return f.tier === "fresh" && f.weightFactor === 1; })());
check("SST 48h = aging (your example), partial weight", (() => { const f = freshnessOf("sst", now - 48 * H, now); return f.tier === "aging" && f.weightFactor < 1 && f.weightFactor >= 0.6; })());
check("SST 80h = stale, dropped", (() => { const f = freshnessOf("sst", now - 80 * H, now); return f.tier === "stale" && f.weightFactor === 0; })());
check("Wind 2h = fresh", freshnessOf("wind", now - 2 * H, now).tier === "fresh");
check("Wind 7h = aging", freshnessOf("wind", now - 7 * H, now).tier === "aging");
check("Wind 12h = stale (fast variable)", freshnessOf("wind", now - 12 * H, now).tier === "stale");
check("Chlorophyll 100h = aging (slow variable still usable)", freshnessOf("chlor", now - 100 * H, now).tier === "aging");
check("Depth never stale", freshnessOf("depth", now - 10000 * H, now).tier === "fresh");
check("missing observedAt = missing tier, 0 weight", freshnessOf("sst", null, now).weightFactor === 0);

console.log("\naging decay is linear from 1.0→floor:");
check("SST at freshH boundary (24h) ~ 1.0", approx(freshnessOf("sst", now - 24 * H, now).weightFactor, 1.0, 0.01));
check("SST at staleH boundary (72h) ~ floor 0.6", approx(freshnessOf("sst", now - 72 * H, now).weightFactor, 0.6, 0.02));
check("SST midpoint (48h) ~ 0.8", approx(freshnessOf("sst", now - 48 * H, now).weightFactor, 0.8, 0.02));

// Build a representative factor set (env + astro). baseWeights need not sum to 1.
const baseFactors = (overrides = {}) => ([
  { key: "temp",    variable: "sst",      baseWeight: 0.25, score: 0.9, observedAtMs: overrides.sst ?? now - 1 * H },
  { key: "chlor",   variable: "chlor",    baseWeight: 0.15, score: 0.8, observedAtMs: overrides.chlor ?? now - 1 * H },
  { key: "wind",    variable: "wind",     baseWeight: 0.15, score: 0.7, observedAtMs: overrides.wind ?? now - 1 * H },
  { key: "depth",   variable: "depth",    baseWeight: 0.20, score: 0.85, observedAtMs: now },
  // astro/calendar factors — always full weight, no feed
  { key: "solunar", variable: null,       baseWeight: 0.10, score: 0.6 },
  { key: "tide",    variable: null,       baseWeight: 0.10, score: 0.5 },
  { key: "season",  variable: null,       baseWeight: 0.05, score: 0.7 },
]);

console.log("\nall-fresh baseline:");
{
  const r = combine(baseFactors(), now);
  check("confidence high when all fresh", r.confidence >= 75);
  check("no stale annotations", r.annotations.filter(a => a.tier === "stale").length === 0);
  check("score in 0..1", r.finalScore >= 0 && r.finalScore <= 1);
}

console.log("\nyour scenario: SST 48h stale-ish (aging), everything else fresh:");
{
  const r = combine(baseFactors({ sst: now - 48 * H }), now);
  const sstNote = r.annotations.find(a => a.variable === "sst");
  check("SST still USED (aging, not dropped)", r.usedFactors.some(f => f.key === "temp"));
  check("SST annotated as aging with age", sstNote && sstNote.tier === "aging" && sstNote.ageH === 48);
  check("confidence dips but stays decent", r.confidence >= 60 && r.confidence < 90);
}

console.log("\nwind goes stale (fast variable dropped):");
{
  const r = combine(baseFactors({ wind: now - 12 * H }), now);
  check("wind dropped from used factors", !r.usedFactors.some(f => f.key === "wind"));
  check("wind annotated as excluded", r.annotations.some(a => a.variable === "wind" && a.tier === "stale"));
  check("still returns a real score (no gap)", r.finalScore > 0);
  check("confidence reduced vs all-fresh", r.confidence < combine(baseFactors(), now).confidence);
}

console.log("\nworst case: all env feeds stale, only depth+astro remain:");
{
  const r = combine(baseFactors({ sst: now - 200 * H, chlor: now - 400 * H, wind: now - 50 * H }), now);
  check("still returns a best spot (never a gap)", r.finalScore > 0);
  check("confidence is low (structure/season only)", r.confidence <= 55);
  check("confidence not zero (depth+astro real)", r.confidence >= 10);
  check("multiple exclusion annotations present", r.annotations.filter(a => a.tier === "stale").length >= 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
