/* Audit the species-dependent half of the bite score.
 *
 * Reproduces the parts of scoreCell (bw-core.js) that differ between two species
 * scored on the SAME cell: bottom/surface temp match, depth-band match, the
 * seasonal curve, the season gate and its ceilings, the bluewater depth gate,
 * and the final normalizeScore contrast stretch. Every shared environmental
 * factor (chlorophyll, thermal break, convergence, pressure, solunar, tide,
 * wind, weather change, moon) is held at one fixed value, which is exactly what
 * happens in the app when two species are scored at the same place and time —
 * so the differences this prints are the whole difference the app would show.
 *
 * Run: node tests/bite-score-audit.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadGlobals(files, names) {
  const src = files.map((f) => readFileSync(join(root, f), "utf8")).join("\n;\n") +
    `\n;({ ${names.join(", ")} });`;
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  return vm.runInContext(src, ctx, { filename: "bw-data-bundle.js" });
}

const {
  SPECIES, PREDICT_SPECIES_PREFS, PREDICT_WEIGHTS, MIGRATION_PHASE,
  REGIONAL_SEASONS, ENC_SPECIES, PORTS,
} = loadGlobals(
  ["bw-data-species.js", "bw-data-encyclopedia.js", "bw-data-ports.js"],
  ["SPECIES", "PREDICT_SPECIES_PREFS", "PREDICT_WEIGHTS", "MIGRATION_PHASE",
    "REGIONAL_SEASONS", "ENC_SPECIES", "PORTS"]);

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── mirrored helpers from bw-core.js ───────────────────────────────────────
function nmBetween(la1, lo1, la2, lo2) {
  const R = 3440.065, t = (d) => (d * Math.PI) / 180;
  const dLa = t(la2 - la1), dLo = t(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 +
    Math.cos(t(la1)) * Math.cos(t(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function getRegionalSeasons(speciesId, lat, lng) {
  const regions = REGIONAL_SEASONS[speciesId];
  if (!regions || regions.length === 0) return null;
  const matches = [];
  for (const r of regions) {
    const d = nmBetween(lat, lng, r.centerLat, r.centerLng);
    if (d <= r.radiusNm) matches.push({ region: r, weight: 1 / (d + 1) });
  }
  if (!matches.length) return null;
  const total = matches.reduce((s, m) => s + m.weight, 0);
  const curve = {};
  for (const m of MONTHS) {
    let v = 0;
    for (const mt of matches) v += (mt.region.seasons[m] || 0) * mt.weight;
    curve[m] = v / total;
  }
  return { curve, labels: matches.map((m) => m.region.label) };
}

function seasonTerm(speciesId, lat, lng, calMonth) {
  const enc = ENC_SPECIES.find((s) => s.id === speciesId);
  if (!enc || !enc.seasons) return { score: 0.5, path: "no-curve", gateActive: false };
  const hasTable = Array.isArray(REGIONAL_SEASONS[speciesId]) && REGIONAL_SEASONS[speciesId].length > 0;
  const regional = getRegionalSeasons(speciesId, lat, lng);
  if (hasTable && !regional) return { score: 0.04, path: "out-of-range", gateActive: true };
  const curve = regional ? regional.curve : enc.seasons;
  let mi = calMonth;
  if (!regional) {
    const p = MIGRATION_PHASE[speciesId];
    if (p && typeof p.latPhase === "number") mi -= (lat - p.refLat) * p.latPhase;
  }
  mi = ((mi % 12) + 12) % 12;
  const m0 = Math.floor(mi), m1 = (m0 + 1) % 12, f = mi - m0;
  const v = (curve[MONTHS[m0]] || 0) * (1 - f) + (curve[MONTHS[m1]] || 0) * f;
  return { score: v / 3, path: regional ? "regional" : "generic", gateActive: true };
}

function bottomTempF(depth) {
  if (depth <= 50) return 68;
  if (depth <= 100) return 68 - ((depth - 50) / 50) * 8;
  if (depth <= 200) return 60 - ((depth - 100) / 100) * 6;
  if (depth <= 350) return 54 - ((depth - 200) / 150) * 4;
  if (depth <= 600) return 50 - ((depth - 350) / 250) * 3;
  return 47;
}

function gaussTempScore(t, prefs) {
  if (t == null) return 0;
  const [iLo, iHi] = prefs.tempIdeal, [wLo, wHi] = prefs.tempWorking;
  let s;
  if (t >= iLo && t <= iHi) s = 1;
  else if (t < iLo) {
    const sigma = Math.max(0.5, iLo - wLo) / 2.355;
    s = Math.exp(-((iLo - t) ** 2) / (2 * sigma * sigma));
  } else {
    const sigma = Math.max(0.5, wHi - iHi) / 2.355;
    s = Math.exp(-((t - iHi) ** 2) / (2 * sigma * sigma));
  }
  return s < 0.01 ? 0 : s;
}

function depthTerm(depth, prefs) {
  const bands = prefs.depthBands || [[0, 2000]];
  let best = 0;
  for (const [lo, hi] of bands) {
    let s;
    if (depth >= lo && depth <= hi) s = 1;
    else if (depth < lo) s = Math.max(0, 1 - (lo - depth) / 12);
    else s = Math.max(0, 1 - (depth - hi) / 120);
    if (s > best) best = s;
  }
  const wantsCanyon = bands.some(([, hi]) => hi >= 150);
  const boost = wantsCanyon && depth > 100 && depth < 500 ? 0.1 : 0;
  return Math.min(1, best + boost);
}

const ANCHORS = [[0,0],[0.15,0.07],[0.28,0.24],[0.42,0.52],[0.55,0.74],[0.70,0.93],[1,1]];
function normalizeScore(raw) {
  if (raw <= 0) return 0;
  if (raw >= 1) return 1;
  for (let i = 1; i < ANCHORS.length; i++) {
    if (raw <= ANCHORS[i][0]) {
      const [x0, y0] = ANCHORS[i - 1], [x1, y1] = ANCHORS[i];
      return y0 + (y1 - y0) * ((raw - x0) / (x1 - x0));
    }
  }
  return raw;
}

function weightsFor(speciesId) {
  const sp = SPECIES.find((s) => s.id === speciesId);
  const cat = sp ? sp.cat : "offshore";
  if (cat === "nearshore") {
    const p = PREDICT_SPECIES_PREFS[speciesId];
    if (p && (p.demersal || p.bottom)) return PREDICT_WEIGHTS.nearshoreReef;
  }
  return PREDICT_WEIGHTS[cat] || PREDICT_WEIGHTS.offshore;
}

// Shared environmental factors: identical for both species on the same cell.
// Set to a plausible "decent day on good water" so absolute numbers land in the
// same range the app shows; the SPREAD between species is what matters.
const ENV = {
  chlor: 0.75, break: 0.75, convergence: 0.70, pressure: 0.60,
  solunar: 0.65, tide: 0.60, wind: 0.60, weather: 0.50, moon: 0.55,
};

function scoreSpecies(speciesId, { lat, lng, depth, sst, calMonth }) {
  const prefs = PREDICT_SPECIES_PREFS[speciesId];
  const sp = SPECIES.find((s) => s.id === speciesId);
  if (!prefs || !sp) return null;
  const cat = sp.cat;
  const W = weightsFor(speciesId);
  const isBottom = !!prefs.bottom;

  let tempForScore = sst;
  if (isBottom && depth > 0) tempForScore = bottomTempF(depth);
  let tempScore = gaussTempScore(tempForScore, prefs);

  const season = seasonTerm(speciesId, lat, lng, calMonth);

  // peak-season heat coupling
  if (tempForScore != null && season.score >= 0.66 &&
      tempForScore > prefs.tempIdeal[1] && tempForScore < prefs.tempWorking[1]) {
    tempScore = Math.max(tempScore, 0.7);
  }
  // offshore pelagic warm bias — excludes bluefin and bottom-dwellers
  if (cat === "offshore" && speciesId !== "bluefin" && !isBottom && sst != null) {
    const warmEdge = prefs.tempWorking[1];
    if (sst >= prefs.tempIdeal[1]) {
      tempScore = sst <= warmEdge ? 1 : Math.max(0, 1 - (sst - warmEdge) / 4);
    }
    const span = Math.max(1, warmEdge - prefs.tempIdeal[0]);
    const bias = Math.max(0, Math.min(1, (sst - prefs.tempIdeal[0]) / span));
    tempScore = Math.min(1, tempScore * (0.7 + 0.4 * bias));
  }

  const depthScore = depthTerm(depth, prefs);
  // `structure` weight exists only in the offshore table; treat structure as a
  // shared property of the cell, so both species see the same value.
  const structureScore = 0.70;

  let raw =
    tempScore * W.temperature +
    ENV.chlor * W.chlorophyll +
    depthScore * W.depthStruct +
    structureScore * (W.structure || 0) +
    ENV.break * W.thermalBreak +
    ENV.convergence * (W.convergence || 0) +
    season.score * W.season +
    ENV.pressure * W.pressure +
    ENV.solunar * W.solunar +
    ENV.tide * W.tide +
    ENV.wind * W.wind +
    ENV.weather * W.weatherChange +
    ENV.moon * (W.moonPhase || 0);

  const preGate = raw;
  // bluewater depth gate — exempts bluefin and deep bottom-dwellers
  let bluewaterGate = 1;
  if (cat === "offshore" && speciesId !== "bluefin" && !isBottom && depth > 0) {
    if (depth >= 180) bluewaterGate = 1;
    else if (depth >= 50) bluewaterGate = 0.35 + 0.65 * ((depth - 50) / 130);
    else bluewaterGate = 0.1 + 0.25 * (depth / 50);
  }
  raw *= bluewaterGate;

  let gate = 1, ceiling = null;
  if (season.gateActive) {
    gate = 0.06 + 0.94 * Math.pow(season.score, 0.55);
    raw *= gate;
    if (season.score < 0.2) { ceiling = 0.22; raw = Math.min(raw, 0.22); }
    else if (season.score < 0.4) { ceiling = 0.45; raw = Math.min(raw, 0.45); }
  }

  return {
    id: speciesId, name: sp.name, cat,
    tempForScore, tempScore, depthScore,
    seasonScore: season.score, seasonPath: season.path,
    preGate, bluewaterGate, gate, ceiling,
    raw, display: normalizeScore(raw),
  };
}

// ── Oregon Inlet head-to-head ──────────────────────────────────────────────
const now = new Date();
const calMonth = now.getMonth() + (now.getDate() - 1) / 30;
const pct = (v) => `${(v * 100).toFixed(0)}%`;

console.log("=".repeat(78));
console.log("OREGON INLET TILEFISH HEAD-TO-HEAD");
console.log("=".repeat(78));
console.log(`month ${MONTHS[Math.floor(calMonth)]}  (index ${calMonth.toFixed(2)})`);

// Each species scored on the depth it is actually fished at out of Oregon Inlet,
// then both on a shared cell to isolate the season term.
const CELLS = [
  { label: "blueline ledges  ~120 m (400 ft)", depth: 120, sst: 82 },
  { label: "shared cell      ~200 m (660 ft)", depth: 200, sst: 82 },
  { label: "golden tile mud  ~300 m (985 ft)", depth: 300, sst: 82 },
];
for (const c of CELLS) {
  console.log(`\n-- ${c.label} --`);
  console.log(`   ${"species".padEnd(18)}${"btmT".padStart(6)}${"temp".padStart(7)}` +
    `${"depth".padStart(7)}${"season".padStart(8)}${"gate".padStart(7)}` +
    `${"raw".padStart(7)}${"DISPLAY".padStart(9)}`);
  for (const id of ["tilefish", "bluelinetile"]) {
    const r = scoreSpecies(id, { lat: 35.6, lng: -74.9, depth: c.depth, sst: c.sst, calMonth });
    console.log(`   ${r.name.padEnd(18)}${r.tempForScore.toFixed(0).padStart(6)}` +
      `${r.tempScore.toFixed(2).padStart(7)}${r.depthScore.toFixed(2).padStart(7)}` +
      `${r.seasonScore.toFixed(2).padStart(8)}${("x" + r.gate.toFixed(2)).padStart(7)}` +
      `${r.raw.toFixed(3).padStart(7)}${pct(r.display).padStart(9)}` +
      (r.ceiling ? `   <- capped at ${r.ceiling}` : ""));
  }
}

console.log("\n-- displayed score by month, shared 200 m cell --");
console.log(`   ${"species".padEnd(16)}` + MONTHS.map((m) => m.padStart(6)).join(""));
for (const id of ["tilefish", "bluelinetile"]) {
  const row = MONTHS.map((_, i) =>
    pct(scoreSpecies(id, { lat: 35.6, lng: -74.9, depth: 200, sst: 82, calMonth: i }).display).padStart(6)).join("");
  console.log(`   ${(SPECIES.find((s) => s.id === id).name).padEnd(16)}` + row);
}

// ── structural defect sweep ────────────────────────────────────────────────
console.log("\n" + "=".repeat(78));
console.log("DEFECT SWEEP — species whose seasonal suppressors are all disabled");
console.log("=".repeat(78));
console.log("A species is 'unsuppressible' when its season curve never dips AND it has");
console.log("no regional table (so no out-of-range guard). It then scores peak season");
console.log("every month, everywhere the depth band matches.\n");

const rows = [];
for (const enc of ENC_SPECIES) {
  const prefs = PREDICT_SPECIES_PREFS[enc.id];
  if (!prefs || !enc.seasons) continue;
  const vals = MONTHS.map((m) => enc.seasons[m]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const hasTable = Array.isArray(REGIONAL_SEASONS[enc.id]) && REGIONAL_SEASONS[enc.id].length > 0;
  const flat = min === max;
  // seasonScore can never fall below this anywhere, for any month
  const floor = hasTable ? 0.04 : min / 3;
  if (floor >= 0.66 && !hasTable) {
    rows.push({ id: enc.id, name: enc.name, curve: vals.join(","), flat, hasTable, floor });
  }
}
if (!rows.length) console.log("  none");
for (const r of rows) {
  console.log(`  ${r.id.padEnd(14)} ${r.name.padEnd(20)} curve ${r.curve}`);
  console.log(`  ${"".padEnd(14)} minimum seasonScore anywhere/anytime = ${r.floor.toFixed(2)} -> gate x1.00, never suppressed`);
}
// Treat this class as a regression: it is invisible in the UI (the species just
// looks great everywhere) but it silently outranks every species that is
// genuinely peaking. Fail the run so it can gate a commit.
const FAILURES = rows.slice();

console.log("\n-- every species: does its season term ever suppress it? --");
console.log(`  ${"species".padEnd(15)}${"table".padStart(7)}${"latRange".padStart(10)}` +
  `${"minSeason".padStart(11)}  curve`);
for (const enc of ENC_SPECIES) {
  const prefs = PREDICT_SPECIES_PREFS[enc.id];
  if (!prefs || !enc.seasons) continue;
  const vals = MONTHS.map((m) => enc.seasons[m]);
  const hasTable = Array.isArray(REGIONAL_SEASONS[enc.id]) && REGIONAL_SEASONS[enc.id].length > 0;
  const min = Math.min(...vals) / 3;
  const flag = !hasTable && min >= 0.66 ? "  <== UNSUPPRESSIBLE" : "";
  console.log(`  ${enc.id.padEnd(15)}${(hasTable ? "yes" : "NO").padStart(7)}` +
    `${"".padStart(10)}${min.toFixed(2).padStart(11)}  ${vals.join(",")}${flag}`);
}

// ── port sweep for the affected species ────────────────────────────────────
console.log("\n" + "=".repeat(78));
console.log("PORT SWEEP — golden tilefish displayed score at its ideal depth");
console.log("=".repeat(78));
console.log("Scored on a 300 m cell offshore of each port, August. A real fishery");
console.log("exists in the Mid-Atlantic and the Gulf; note what it reads elsewhere.\n");
const PORT_SAMPLE = [
  "Portland, ME", "Gloucester, MA", "Point Judith, RI", "Montauk, NY",
  "Cape May, NJ", "Ocean City, MD", "Virginia Beach, VA", "Oregon Inlet, NC",
  "Hatteras, NC", "Charleston, SC", "Key West, FL", "Venice, LA",
  "Galveston, TX", "San Diego, CA",
];
// Two hard exclusions in bw-core.js run BEFORE scoring, so mirror them here or
// the sweep prints scores the app would never show:
//   • PACIFIC_SPECIES is an allow-list; neither tilefish is on it.
//   • SPECIES_LAT_RANGE bounds blueline to 33.0-40.5 N. Golden has no entry.
const isPacific = (lat, lng) => lng < -117 && lat > 28 && lat < 49;
// Rough Gulf test, enough to pick a coast for the per-coast band.
const isGulf = (lat, lng) => lng < -81.5 && lat < 31;
const LAT_RANGE = { bluelinetile: { atlantic: [28.0, 40.5], gulf: [25.0, 30.5] } };
function excludedAt(id, lat, lng) {
  if (isPacific(lat, lng)) return "Pacific water (not in PACIFIC_SPECIES)";
  const entry = LAT_RANGE[id];
  if (!entry) return null;
  const coast = isGulf(lat, lng) ? "gulf" : "atlantic";
  const r = Array.isArray(entry) ? entry : entry[coast];
  if (!r) return `no ${coast} range`;
  if (lat < r[0] || lat > r[1]) return `outside ${coast} range ${r[0]}-${r[1]}`;
  return null;
}
const cell = (id, p, depth) => {
  const ex = excludedAt(id, p.lat, p.lng);
  if (ex) return `  --  ${ex}`;
  const r = scoreSpecies(id, { lat: p.lat, lng: p.lng, depth, sst: 80, calMonth: 7 });
  return `${pct(r.display).padStart(5)} ${r.seasonPath}`;
};

for (const name of PORT_SAMPLE) {
  const p = PORTS[name];
  if (!p) { console.log(`  ${name.padEnd(22)} (not in PORTS)`); continue; }
  console.log(`  ${name.padEnd(22)} golden ${cell("tilefish", p, 300).padEnd(24)}` +
    ` blueline ${cell("bluelinetile", p, 200)}`);
}

// ── seasonal swap check ────────────────────────────────────────────────────
// The pair should trade places across the year out of Oregon Inlet: blueline
// owns May-Aug (the only months it is legal to keep one there), golden carries
// the rest because it never closes.
console.log("\n" + "=".repeat(78));
console.log("OREGON INLET — month-by-month after the fix");
console.log("=".repeat(78));
console.log(`  ${"species".padEnd(18)}` + MONTHS.map((m) => m.padStart(6)).join(""));
for (const [id, depth] of [["tilefish", 300], ["bluelinetile", 120]]) {
  const row = MONTHS.map((_, i) =>
    pct(scoreSpecies(id, { lat: 35.6, lng: -74.9, depth, sst: 82, calMonth: i }).display).padStart(6)).join("");
  console.log(`  ${SPECIES.find((s) => s.id === id).name.padEnd(18)}` + row);
}
console.log("\n  label thresholds: EXCELLENT >=75, GOOD >=60, FAIR >=40, POOR <40");

if (FAILURES.length) {
  console.error(`\nFAIL: ${FAILURES.length} species can never be suppressed by season ` +
    `(${FAILURES.map((r) => r.id).join(", ")}). Give each a REGIONAL_SEASONS table, ` +
    `or a default curve that dips.`);
  process.exit(1);
}
console.log("\nPASS: every species can be seasonally suppressed somewhere.");
