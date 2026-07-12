#!/usr/bin/env node
/**
 * Approach A modularization: extract large, pure-literal data arrays out of the
 * monolithic index.html into companion `bw-data-*.js` files loaded via plain
 * <script src> (classic scripts, so top-level `const` stays in the shared global
 * lexical scope — no window.* rewiring, and file:// offline still works).
 *
 * Usage:
 *   node scripts/extract-data-modules.mjs --dry   # report boundaries only
 *   node scripts/extract-data-modules.mjs         # perform extraction
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = join(root, "index.html");
const DRY = process.argv.includes("--dry");

// Grouping: which globals go into which companion file, and the load order.
// Order matters only relative to first use (all uses are inside functions that
// run after load), but we keep a sensible dependency-free order anyway.
const MODULES = [
  { file: "bw-data-ports.js",        title: "Ports (home ports + metadata)",              names: ["PORTS"] },
  { file: "bw-data-species.js",      title: "Species list + prediction preferences/weights", names: ["SPECIES", "PREDICT_SPECIES_PREFS", "MIGRATION_PHASE", "REGIONAL_SEASONS", "PREDICT_WEIGHTS"] },
  { file: "bw-data-canyons.js",      title: "Canyons / offshore grounds",                 names: ["CANYONS"] },
  { file: "bw-data-closures.js",     title: "Marine closures & protected areas",          names: ["MARINE_CLOSURES"] },
  { file: "bw-data-bathy.js",        title: "Bathymetry reference points",                names: ["BATHY_REFS"] },
  { file: "bw-data-encyclopedia.js", title: "Fish encyclopedia entries",                  names: ["ENC_SPECIES"] },
  { file: "bw-data-tackle.js",       title: "Tackle box catalog",                         names: ["TB_TACKLE"] },
];

// Find [start,end) char span of `const NAME = <literal>;` respecting strings and
// comments. Data arrays are pure literals (no regex/functions), so a string +
// comment aware bracket matcher is exact.
function findConstSpan(src, name) {
  const declRe = new RegExp(`(^|\\n)const ${name}\\b`);
  const m = declRe.exec(src);
  if (!m) throw new Error(`declaration not found: const ${name}`);
  const start = m.index + (m[1] ? 1 : 0); // skip the leading newline captured
  let i = start;
  let depth = 0;
  let entered = false;
  let str = null; // current string delimiter or null
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (str) {
      if (c === "\\") { i += 2; continue; }
      if (c === str) str = null;
      i++;
      continue;
    }
    // not in a string
    if (c === "/" && c2 === "/") { // line comment
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      continue;
    }
    if (c === "/" && c2 === "*") { // block comment
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { str = c; i++; continue; }
    if (c === "[" || c === "{") { depth++; entered = true; i++; continue; }
    if (c === "]" || c === "}") {
      depth--;
      i++;
      if (entered && depth === 0) {
        // consume trailing whitespace + a single semicolon
        while (i < n && /\s/.test(src[i])) i++;
        if (src[i] === ";") i++;
        return [start, i];
      }
      continue;
    }
    i++;
  }
  throw new Error(`unbalanced brackets while scanning const ${name}`);
}

let html = readFileSync(htmlPath, "utf8");

// Compute all spans up front against the ORIGINAL text.
const found = [];
for (const mod of MODULES) {
  for (const name of mod.names) {
    const [s, e] = findConstSpan(html, name);
    const startLine = html.slice(0, s).split("\n").length;
    const endLine = html.slice(0, e).split("\n").length;
    found.push({ mod, name, s, e, startLine, endLine, lines: endLine - startLine + 1 });
  }
}

// Report
let totalLines = 0;
for (const f of found) {
  totalLines += f.lines;
  console.log(`${f.name.padEnd(24)} lines ${String(f.startLine).padStart(6)}–${String(f.endLine).padEnd(6)} (${f.lines})  → ${f.mod.file}`);
}
console.log(`\nTotal extracted lines: ${totalLines}`);

if (DRY) {
  console.log("\n[dry run] no files written.");
  process.exit(0);
}

// Build companion file contents (group by module, preserve source order).
const HEADER = (title) =>
  `/* Bluewater Intel — data module: ${title}\n` +
  ` * Extracted from index.html (Approach A modularization). Loaded as a plain\n` +
  ` * classic <script src> before the main app script, so these top-level\n` +
  ` * const declarations remain global and file:// offline still works.\n` +
  ` * DO NOT convert to an ES module (breaks file:// via CORS). */\n\n`;

for (const mod of MODULES) {
  const parts = mod.names
    .map((name) => found.find((f) => f.name === name))
    .sort((a, b) => a.s - b.s)
    .map((f) => html.slice(f.s, f.e));
  const content = HEADER(mod.title) + parts.join("\n\n") + "\n";
  writeFileSync(join(root, mod.file), content);
  console.log(`wrote ${mod.file} (${content.split("\n").length} lines)`);
}

// Splice extracted spans out of index.html, highest offset first so earlier
// offsets stay valid. Replace each with a one-line marker comment.
const spans = [...found].sort((a, b) => b.s - a.s);
for (const f of spans) {
  const marker = `// ${f.name} moved to ${f.mod.file} (Approach A modularization)`;
  html = html.slice(0, f.s) + marker + html.slice(f.e);
}

// Insert companion <script src> tags right after bw-platforms-gom.js so they
// load before every inline app <script> block.
const anchor = `<script src="bw-platforms-gom.js"></script>`;
if (!html.includes(anchor)) throw new Error("script anchor not found");
const tags = MODULES.map((m) => `<script src="${m.file}"></script>`).join("\n");
html = html.replace(anchor, `${anchor}\n${tags}`);

writeFileSync(htmlPath, html);
console.log("\nindex.html updated.");
