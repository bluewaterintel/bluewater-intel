#!/usr/bin/env node
/**
 * Build Gulf of Mexico oil & gas platform markers from BSEE Platform shapefile.
 *
 * Includes only:
 *   • Current structures (no REMOVAL_DATE in BSEE TIMS)
 *   • Above-water / fishable platforms (excludes subsea manifolds, PLETs, templates)
 *
 * Source: https://www.data.bsee.gov/Mapping/Files/Platform.zip
 * (Bureau of Safety and Environmental Enforcement — federal OCS structures, NAD27)
 *
 * Outputs:
 *   - data/gom-platforms.json
 *   - bw-platforms-gom.js   (offline embedded fallback for the map layer)
 *
 * Usage:
 *   node scripts/build-platforms-gom.mjs
 *   node scripts/build-platforms-gom.mjs --fetch   # re-download Platform.zip from BSEE
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ZIP_CACHED = join(root, "data/bsee-Platform.zip");
const ZIP_URL = "https://www.data.bsee.gov/Mapping/Files/Platform.zip";
const OUT_JSON = join(root, "data/gom-platforms.json");
const OUT_JS = join(root, "bw-platforms-gom.js");
const EXTRACT_DIR = join(root, "data/tmp-bsee-platform");

// BSEE subsea / seabed equipment — not fishable surface platforms.
const SUBSEA_NAME_RE = /\b(MANIFOLD|PLET|PLEM|SUBSEA|TEMPLATE|SSMANIFO|SSTMP|SSMNF|UCOMP|SS PLET|SS PLEM)\b/i;

function fetchZip() {
  const tmp = join(root, "data/tmp-platloc");
  mkdirSync(tmp, { recursive: true });
  const zip = join(tmp, "Platform.zip");
  execFileSync("curl", ["-sS", "-A", "BluewaterIntel/1.0 (+https://bluewaterintel.com)", "-o", zip, ZIP_URL], { stdio: "inherit" });
  mkdirSync(dirname(ZIP_CACHED), { recursive: true });
  copyFileSync(zip, ZIP_CACHED);
  console.log("Fetched Platform.zip from BSEE");
}

function ensureShapefile() {
  let zip = ZIP_CACHED;
  if (!existsSync(zip)) {
    const alt = join(root, "data/tmp-bsee/Platform.zip");
    if (existsSync(alt)) zip = alt;
    else return null;
  }
  mkdirSync(EXTRACT_DIR, { recursive: true });
  execFileSync("unzip", ["-o", zip, "-d", EXTRACT_DIR], { stdio: "pipe" });
  const shp = join(EXTRACT_DIR, "platform.shp");
  const dbf = join(EXTRACT_DIR, "platform.dbf");
  if (!existsSync(shp) || !existsSync(dbf)) return null;
  return { shp, dbf };
}

function parseShpPoints(path) {
  const buf = readFileSync(path);
  if (buf.readInt32BE(0) !== 9994) throw new Error(`Invalid shapefile: ${path}`);
  const pts = [];
  let off = 100;
  while (off + 12 <= buf.length) {
    const contentLen = buf.readInt32BE(off + 4) * 2;
    const shapeType = buf.readInt32LE(off + 8);
    if (shapeType === 1 && off + 28 <= buf.length) {
      pts.push({ lng: buf.readDoubleLE(off + 12), lat: buf.readDoubleLE(off + 20) });
    }
    off += 8 + contentLen;
  }
  return pts;
}

function parseDbf(path) {
  const dbf = readFileSync(path);
  const recCount = dbf.readUInt32LE(4);
  const headerLen = dbf.readUInt16LE(8);
  const recLen = dbf.readUInt16LE(10);
  let off = 32;
  const fields = [];
  while (off < headerLen - 1) {
    fields.push({
      name: dbf.slice(off, off + 11).toString("ascii").replace(/\0/g, "").trim(),
      len: dbf[off + 16],
    });
    off += 32;
  }
  const rows = [];
  for (let i = 0; i < recCount; i++) {
    const start = headerLen + i * recLen;
    const rec = dbf.slice(start, start + recLen);
    if (rec[0] === 0x2a) {
      rows.push(null);
      continue;
    }
    const obj = {};
    let roff = 1;
    for (const f of fields) {
      obj[f.name] = rec.slice(roff, roff + f.len).toString("ascii").trim();
      roff += f.len;
    }
    rows.push(obj);
  }
  return rows;
}

function hasRemovalDate(val) {
  if (!val) return false;
  const v = String(val).trim();
  return v.length > 0 && v !== "0" && v !== "/  /" && !/^0+$/.test(v);
}

function isSubseaName(name) {
  return SUBSEA_NAME_RE.test(String(name || ""));
}

function parseShapefile(shp, dbf) {
  const pts = parseShpPoints(shp);
  const attrs = parseDbf(dbf);
  const rows = [];
  const seen = new Set();
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    const p = pts[i];
    if (!a || !p) continue;
    if (hasRemovalDate(a.REMOVAL_DA)) continue;
    const name = (a.STRUCTURE1 || "Platform").trim();
    if (isSubseaName(name)) continue;
    const lat = p.lat;
    const lng = p.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < 23 || lat > 31 || lng > -81 || lng < -98) continue;
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      n: name,
      la: Math.round(lat * 1e5) / 1e5,
      ln: Math.round(lng * 1e5) / 1e5,
      cid: a.COMPLEX_ID || "",
    });
  }
  rows.sort((a, b) => a.la - b.la || a.ln - b.ln);
  return rows;
}

const fetch = process.argv.includes("--fetch");
if (fetch || !existsSync(ZIP_CACHED)) {
  if (!fetch && !existsSync(ZIP_CACHED)) console.log("No cached Platform.zip — fetching…");
  fetchZip();
}

const paths = ensureShapefile();
if (!paths) {
  console.error("Could not locate BSEE Platform shapefile. Run with --fetch or place data/bsee-Platform.zip");
  process.exit(1);
}

const rows = parseShapefile(paths.shp, paths.dbf);
const meta = {
  source: "BSEE Platform shapefile (active, above-water)",
  updated: new Date().toISOString().slice(0, 10),
  count: rows.length,
  filter: "REMOVAL_DATE empty; excludes subsea manifolds/PLETs/templates by name",
  rows,
};
writeFileSync(OUT_JSON, JSON.stringify(meta));

const compact = rows.map((r) => [r.n, r.la, r.ln, r.cid]);
const js = `// Gulf of Mexico federal OCS platforms — BSEE active surface structures (${rows.length})
// Source: BSEE Platform.zip  Rebuild: npm run build:platforms
// Filter: current (no removal date) + above-water only (no subsea manifolds/PLETs)
// Format: [name, lat, lng, complexId]
// Informational only — not for navigation. Positions are NAD27 GIS exports.
window.BW_GOM_PLATFORMS = ${JSON.stringify(compact)};
`;
writeFileSync(OUT_JS, js);
console.log(`✓ ${rows.length} active surface platforms → ${OUT_JS}`);
