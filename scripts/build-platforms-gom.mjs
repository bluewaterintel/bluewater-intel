#!/usr/bin/env node
/**
 * Build Gulf of Mexico oil & gas platform markers from BSEE platloc.DAT.
 *
 * Source: https://www.data.bsee.gov/Platform/Files/platlocfixed.zip
 * (Bureau of Safety and Environmental Enforcement — federal OCS structures)
 *
 * Outputs:
 *   - data/gom-platforms.json
 *   - bw-platforms-gom.js   (offline embedded fallback for the map layer)
 *
 * Usage:
 *   node scripts/build-platforms-gom.mjs
 *   node scripts/build-platforms-gom.mjs --fetch   # re-download from BSEE
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DAT = join(root, "data/bsee-platloc.DAT");
const ZIP_URL = "https://www.data.bsee.gov/Platform/Files/platlocfixed.zip";
const OUT_JSON = join(root, "data/gom-platforms.json");
const OUT_JS = join(root, "bw-platforms-gom.js");

function fetchDat() {
  const tmp = join(root, "data/tmp-platloc");
  mkdirSync(tmp, { recursive: true });
  const zip = join(tmp, "platlocfixed.zip");
  execFileSync("curl", ["-sS", "-A", "BluewaterIntel/1.0 (+https://bluewaterintel.com)", "-o", zip, ZIP_URL], { stdio: "inherit" });
  execFileSync("unzip", ["-o", zip, "-d", tmp], { stdio: "inherit" });
  const dat = join(tmp, "platloc.DAT");
  if (!existsSync(dat)) throw new Error("platloc.DAT missing after unzip");
  writeFileSync(DAT, readFileSync(dat));
  console.log("Fetched platloc.DAT from BSEE");
}

function parseDat(text) {
  const rows = [];
  const seen = new Set();
  for (const raw of text.split("\n")) {
    if (raw.length < 110) continue;
    const lat = parseFloat(raw.slice(99, 112).trim());
    const lng = parseFloat(raw.slice(85, 99).trim());
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < 23 || lat > 31 || lng > -81 || lng < -98) continue;
    const name = raw.slice(51, 68).trim() || raw.slice(22, 37).trim() || "Platform";
    const area = raw.slice(22, 37).trim();
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ n: name, la: Math.round(lat * 1e5) / 1e5, ln: Math.round(lng * 1e5) / 1e5, a: area });
  }
  rows.sort((a, b) => a.la - b.la || a.ln - b.ln);
  return rows;
}

const fetch = process.argv.includes("--fetch");
if (fetch || !existsSync(DAT)) {
  if (!fetch && !existsSync(DAT)) console.log("No cached platloc.DAT — fetching…");
  fetchDat();
}

const rows = parseDat(readFileSync(DAT, "utf8"));
writeFileSync(OUT_JSON, JSON.stringify({ source: "BSEE platloc", updated: new Date().toISOString().slice(0, 10), count: rows.length, rows }));

const compact = rows.map((r) => [r.n, r.la, r.ln, r.a]);
const js = `// Gulf of Mexico federal OCS platforms — BSEE platloc (${rows.length} structures)
// Source: https://www.data.bsee.gov/Main/Mapping.aspx  Rebuild: npm run build:platforms
// Format: [name, lat, lng, areaCode]
// Informational only — not for navigation. Positions are approximate GIS exports.
window.BW_GOM_PLATFORMS = ${JSON.stringify(compact)};
`;
writeFileSync(OUT_JS, js);
console.log(`✓ ${rows.length} platforms → ${OUT_JS}`);
