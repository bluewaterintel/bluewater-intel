/* Bluewater Intel — habitat mask vs. depth band consistency
 *
 * classifyWaterType() buckets a map cell by REAL bathymetry, in feet:
 *   <30 ft "inshore" · 30-100 ft "nearshore" · >=100 ft "offshore"
 * The bite-map grid then hard-vetoes any species whose habitat mask omits that
 * bucket — before the far more carefully curated depthBands are ever consulted.
 *
 * That let the coarse 3-bucket mask override the precise per-species depth
 * research: whenever the two disagreed, the mask won and the species silently
 * vanished at a bucket boundary. The lived example is black sea bass, which
 * carries depthBands reaching 427 ft but was masked ["nearshore","inshore"], so
 * every cell at or past 100 ft was classified "offshore" and vetoed — deleting
 * the 100-115 ft Virginia Beach wrecks that hold the biggest fish.
 *
 * bw-core.js now derives the depth buckets from each species' own depthBands and
 * unions them into the curated mask (effectiveSpeciesHabitat). This test pins
 * that invariant so the class of bug cannot come back:
 *
 *   if a species' depthBands reach a depth bucket, its effective habitat must
 *   not veto that bucket.
 *
 * "bay" is geometric (BAY_BOXES), not depth-derived, so it is never inferred.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = f => readFileSync(join(root, f), "utf8");

// bw-data-species.js is a classic browser script (top-level const, no exports),
// so eval it in a scope where the globals it declares become readable.
const { PREDICT_SPECIES_PREFS, SPECIES } = new Function(
  `${read("bw-data-species.js")}\nreturn {PREDICT_SPECIES_PREFS, SPECIES};`)();

// bw-core.js cannot be evaluated outside a browser, so slice out just the two
// pieces under test: the curated mask and the derivation block between its
// markers. Keeping the real implementation (rather than a copy of the rule)
// means a regression in bw-core.js actually fails this test.
const coreSrc = read("bw-core.js");

function slice(re, what){
  const m = coreSrc.match(re);
  if(!m) throw new Error(`could not locate ${what} in bw-core.js`);
  return m[0];
}

const habitatSrc  = slice(/const SPECIES_HABITAT = \{[\s\S]*?\n\};/, "SPECIES_HABITAT");
const derivedSrc  = slice(/\/\/ ── habitat-derivation:begin[\s\S]*?\/\/ ── habitat-derivation:end/,
                          "the habitat-derivation block");

const { SPECIES_HABITAT, effectiveSpeciesHabitat } = new Function(
  "PREDICT_SPECIES_PREFS",
  `${habitatSrc}\n${derivedSrc}\nreturn {SPECIES_HABITAT, effectiveSpeciesHabitat};`
)(PREDICT_SPECIES_PREFS);

const M_TO_FT = 3.281;
const BUCKETS = [["inshore", 0, 30], ["nearshore", 30, 100], ["offshore", 100, Infinity]];

function bucketsWanted(bands){
  const out = new Set();
  for(const [name, loFt, hiFt] of BUCKETS){
    for(const [mn, mx] of bands){
      if(mn * M_TO_FT < hiFt && mx * M_TO_FT >= loFt){ out.add(name); break; }
    }
  }
  return out;
}

let failures = 0, checked = 0, widened = 0;

console.log("every species' effective habitat covers the depth buckets its own bands ask for:");
for(const sp of SPECIES){
  if(sp.id === "all") continue;
  const prefs = PREDICT_SPECIES_PREFS[sp.id];
  const curated = SPECIES_HABITAT[sp.id];
  // No curated mask means "allowed everywhere" (see speciesAllowedInWater), so
  // there is nothing to contradict. No prefs means the species is never scored.
  if(!prefs || !prefs.depthBands || !curated) continue;
  checked++;

  const effective = effectiveSpeciesHabitat(sp.id);
  const missing = [...bucketsWanted(prefs.depthBands)].filter(b => !effective.includes(b));
  if(missing.length){
    failures++;
    console.log(`  ✗ ${sp.id} wants [${missing.join(", ")}] but effective habitat is [${effective.join(", ")}]`);
  }
  const added = effective.filter(b => !curated.includes(b));
  if(added.length){
    widened++;
    console.log(`  ✓ ${sp.id.padEnd(14)} curated [${curated.join(", ")}] + depth-derived [${added.join(", ")}]`);
  }
}
console.log(`  ${checked} species checked, ${widened} widened by their own depth bands`);

// Guard the specific regression that started all this: black sea bass must be
// allowed in "offshore" water, because classifyWaterType() calls the 100-115 ft
// Virginia Beach wrecks offshore.
console.log("\nblack sea bass reaches the 100-115 ft Virginia Beach wrecks:");
const bsb = effectiveSpeciesHabitat("blackseabass");
if(bsb.includes("offshore")) console.log("  ✓ blackseabass allowed in offshore (>=100 ft) water");
else { failures++; console.log(`  ✗ blackseabass still vetoed at >=100 ft — habitat [${bsb.join(", ")}]`); }

const bsbBands = PREDICT_SPECIES_PREFS.blackseabass.depthBands;
const bsbMaxFt = Math.max(...bsbBands.map(b => b[1])) * M_TO_FT;
if(bsbMaxFt >= 115 && bsbMaxFt <= 500){
  console.log(`  ✓ blackseabass depth band tops out at ${Math.round(bsbMaxFt)} ft (covers VA Beach wrecks + NJ/NY winter deep wrecks, no canyon over-reach)`);
} else {
  failures++;
  console.log(`  ✗ blackseabass depth band tops out at ${Math.round(bsbMaxFt)} ft — expected 115-500 ft`);
}

// The derived buckets must never REMOVE a curated one; the union is widening only.
console.log("\nderivation is widening-only:");
let narrowed = 0;
for(const id of Object.keys(SPECIES_HABITAT)){
  const eff = effectiveSpeciesHabitat(id);
  const lost = SPECIES_HABITAT[id].filter(b => !eff.includes(b));
  if(lost.length){ narrowed++; failures++; console.log(`  ✗ ${id} lost curated bucket(s) ${lost.join(", ")}`); }
}
if(!narrowed) console.log("  ✓ no species lost a curated water type");

if(failures){
  console.log(`\n✗ ${failures} failure(s)`);
  process.exit(1);
}
console.log("\n✓ habitat/depth consistency OK");
