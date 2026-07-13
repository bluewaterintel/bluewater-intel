#!/usr/bin/env node
/**
 * Approach A (phase 2): lift whole inline <script> logic blocks out of
 * index.html into named companion files. Moving an entire inline block to an
 * external classic <script src> AT THE SAME DOCUMENT POSITION is
 * behavior-preserving: classic scripts are parser-blocking and execute in
 * document order sharing one global scope, so cross-block references and load
 * timing are identical. file:// offline still works (plain <script src>).
 *
 * Usage:
 *   node scripts/extract-logic-blocks.mjs --dry
 *   node scripts/extract-logic-blocks.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = join(root, "index.html");
const DRY = process.argv.includes("--dry");

// Each target is identified by a unique anchor string that lives inside exactly
// one inline <script> block. Order here = source order (not required, just tidy).
const TARGETS = [
  { anchor: `_planOnboardCheckedFor = null;`,                        file: "bw-authgate.js",      title: "Auth-gate UI wiring (sign in/out, plan onboarding)" },
  { anchor: `// ── Client billing glue`,                             file: "bw-billing.js",        title: "Stripe billing + entitlement glue" },
  { anchor: `Static HEAT zone data removed`,                          file: "bw-core.js",           title: "Core engine — map, layers, prediction/bite-map, ports & canyons" },
  { anchor: `// ENCYCLOPEDIA LOGIC`,                                  file: "bw-encyclopedia.js",   title: "Fish encyclopedia UI logic" },
  { anchor: `// SPECIES DATABASE — length-to-weight`,                 file: "bw-catch-measure.js",  title: "Catch measure — length-to-weight formulas + regulations" },
  { anchor: `// TACKLE DATABASE — curated`,                           file: "bw-tackle-engine.js",  title: "Tackle box scoring engine + UI" },
  { anchor: `// FISHING REPORTS PAGE`,                                file: "bw-reports.js",        title: "Fishing reports page + tutorial overlay" },
  { anchor: `// TERMINAL TACKLE DATA`,                                file: "bw-knots.js",          title: "Terminal tackle — animated fishing knots" },
  { anchor: `// WAYPOINTS DATA`,                                      file: "bw-waypoints-ui.js",   title: "Waypoints POI data + waypoint drop/list UI" },
];

let html = readFileSync(htmlPath, "utf8");

function countOccurrences(hay, needle) {
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

// Locate the enclosing no-attribute <script>...</script> for an anchor.
function blockSpan(src, anchor) {
  const occ = countOccurrences(src, anchor);
  if (occ !== 1) throw new Error(`anchor not unique (${occ}x): ${anchor}`);
  const at = src.indexOf(anchor);
  const open = src.lastIndexOf("<script>", at); // exact tag; "<script src=" never matches
  if (open === -1) throw new Error(`no <script> before anchor: ${anchor}`);
  const innerStart = open + "<script>".length;
  const close = src.indexOf("</script>", at);
  if (close === -1) throw new Error(`no </script> after anchor: ${anchor}`);
  return { open, innerStart, close, tagEnd: close + "</script>".length };
}

const found = TARGETS.map((t) => {
  const span = blockSpan(html, t.anchor);
  const startLine = html.slice(0, span.open).split("\n").length;
  const endLine = html.slice(0, span.tagEnd).split("\n").length;
  return { ...t, ...span, startLine, endLine, lines: endLine - startLine + 1 };
});

let total = 0;
for (const f of found) {
  total += f.lines;
  console.log(`${f.file.padEnd(22)} lines ${String(f.startLine).padStart(6)}–${String(f.endLine).padEnd(6)} (${f.lines})`);
}
console.log(`\nTotal inline lines relocated: ${total}`);

if (DRY) { console.log("\n[dry run] no files written."); process.exit(0); }

const HEADER = (title) =>
  `/* Bluewater Intel — ${title}\n` +
  ` * Extracted verbatim from an inline <script> block in index.html (Approach A).\n` +
  ` * Loaded as a plain classic <script src> at the SAME document position, so\n` +
  ` * execution order, global scope, and file:// offline all behave identically.\n` +
  ` * DO NOT reorder relative to the other bw-*.js tags. */\n\n`;

// Write files from original text.
for (const f of found) {
  const inner = html.slice(f.innerStart, f.close).replace(/^\n/, "");
  writeFileSync(join(root, f.file), HEADER(f.title) + inner.replace(/\s*$/, "") + "\n");
}

// Splice out highest-offset first so earlier offsets stay valid.
for (const f of [...found].sort((a, b) => b.open - a.open)) {
  html = html.slice(0, f.open) + `<script src="${f.file}"></script>` + html.slice(f.tagEnd);
}

writeFileSync(htmlPath, html);
console.log("\nindex.html updated.");
