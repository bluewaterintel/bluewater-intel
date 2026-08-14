#!/usr/bin/env node
/**
 * Build fishing-waypoint artifacts from Master_Waypoint_Combined_1.csv.
 *
 * Outputs:
 *   - data/Master_Waypoint_Combined_1.csv   (source copy, if --copy)
 *   - supabase-m1/seed/waypoints.ndjson      (DB seed)
 *   - bw-waypoints.js                         (offline embedded fallback)
 *
 * Usage:
 *   node scripts/build-waypoints.mjs [path/to/Master_Waypoint_Combined_1.csv]
 *   node scripts/build-waypoints.mjs --copy "/path/to/source.csv"
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CSV = join(root, 'data/Master_Waypoint_Combined_1.csv');

// Legacy Master_Waypoint_Combined_1.csv: singular `Type` column.
const TYPE_MAP = {
  Wreck: 'wk',
  Reef: 'rf',
  Rf: 'rf',
  RF: 'rf',
  rf: 'rf',
  Structure: 'st',
  Ledge: 'ld',
  Rock: 'rk',
  Hole: 'hl',
  Hump: 'hp',
  Canyon: 'cy',
  Tower: 'tw',
  Platform: 'pf',
  Rig: 'rg',
};

// Current sheet export: plural `category` column, which maps 1:1 onto the type
// codes. Its sibling `type` column is free text — "Subway cars", "Reef Balls",
// and a handful of rows where a ship name landed in the type field — so the
// category is the only trustworthy grouping and `type` is deliberately unused.
const CATEGORY_MAP = {
  Wrecks: 'wk',
  Reefs: 'rf',
  Structure: 'st',
  Ledges: 'ld',
  Rocks: 'rk',
  Holes: 'hl',
  Humps: 'hp',
  Canyons: 'cy',
  Towers: 'tw',
  Platforms: 'pf',
  Rigs: 'rg',
};

const TYPES = {
  wk: 'Wreck',
  rf: 'Reef',
  st: 'Structure',
  ld: 'Ledge',
  rk: 'Rock',
  hl: 'Hole',
  hp: 'Hump',
  cy: 'Canyon',
  tw: 'Tower',
  pf: 'Platform',
  rg: 'Rig',
};

function parseCoord(s, isLat) {
  const raw = String(s || '').trim();
  const plain = Number(raw);
  if (Number.isFinite(plain) && !/[NSEW]/i.test(raw)) {
    if (isLat && plain >= -90 && plain <= 90) return plain;
    if (!isLat && plain >= -180 && plain <= 180) return plain;
  }
  const parts = raw.split(/\s+/);
  const val = parseFloat(parts[0]);
  if (!Number.isFinite(val)) throw new Error(`bad coord: ${s}`);
  const hem = (parts[1] || '').toUpperCase();
  if (isLat) return hem === 'S' ? -val : val;
  return hem === 'E' ? val : -val;
}

function parseCsv(text) {
  const rows = [];
  let i = 0;
  const len = text.length;

  function readField() {
    if (text[i] === '"') {
      i++;
      let field = '';
      while (i < len) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          field += text[i++];
        }
      }
      if (text[i] === ',') i++;
      return field;
    }
    let field = '';
    while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
      field += text[i++];
    }
    if (text[i] === ',') i++;
    return field;
  }

  function readRow() {
    const fields = [];
    while (i < len) {
      fields.push(readField());
      if (text[i] === '\r') i++;
      if (text[i] === '\n') {
        i++;
        break;
      }
      if (i >= len) break;
    }
    return fields;
  }

  // Header case differs between the two exports, so match on lowercase.
  const header = readRow();
  const idx = Object.fromEntries(header.map((h, n) => [h.trim().toLowerCase(), n]));
  for (const need of ['name', 'latitude', 'longitude']) {
    if (idx[need] == null) throw new Error(`CSV missing column: ${need}`);
  }
  if (idx.category == null && idx.type == null) {
    throw new Error('CSV needs a `category` (current export) or `Type` (legacy) column');
  }
  // The current export carries signed decimal coordinates; the legacy one has
  // unsigned values with hemisphere letters. Pick the reader from the header.
  const byCategory = idx.category != null;

  while (i < len) {
    const fields = readRow();
    if (!fields.length || (fields.length === 1 && !fields[0])) continue;
    const name = fields[idx.name]?.trim();
    if (!name) continue;

    let code, lat, lng;
    if (byCategory) {
      const cat = fields[idx.category]?.trim();
      if (!cat) continue;
      code = CATEGORY_MAP[cat];
      if (!code) throw new Error(`Unknown category "${cat}" on row: ${name}`);
      lat = Number(fields[idx.latitude]);
      lng = Number(fields[idx.longitude]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error(`bad coords on row: ${name}`);
      }
    } else {
      const typeLabel = fields[idx.type]?.trim();
      if (!typeLabel) continue;
      code = TYPE_MAP[typeLabel];
      if (!code) throw new Error(`Unknown type "${typeLabel}" on row: ${name}`);
      lat = parseCoord(fields[idx.latitude], true);
      lng = parseCoord(fields[idx.longitude], false);
    }

    // This feeds a production table captains navigate against, so a transposed
    // or unsigned coordinate must fail the build rather than ship.
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error(`coord out of range on row "${name}": ${lat},${lng}`);
    }
    rows.push({ name, lat, lng, t: code });
  }
  return rows;
}

function dedupeKey(w) {
  return `${w.name}|${w.lat.toFixed(5)}|${w.lng.toFixed(5)}`;
}

function mergeRows(primary, extra) {
  const seen = new Set(primary.map(dedupeKey));
  let added = 0;
  for (const w of extra) {
    const k = dedupeKey(w);
    if (seen.has(k)) continue;
    seen.add(k);
    primary.push(w);
    added++;
  }
  return added;
}

function supplementaryCsvPaths(rootDir) {
  const dir = join(rootDir, 'data', 'supplementary');
  try {
    return readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.csv'))
      .map((f) => join(dir, f))
      .sort();
  } catch {
    return [];
  }
}

function main() {
  const args = process.argv.slice(2);
  let csvPath = DEFAULT_CSV;
  let copyFrom = null;

  for (let a = 0; a < args.length; a++) {
    if (args[a] === '--copy' && args[a + 1]) {
      copyFrom = args[++a];
    } else if (!args[a].startsWith('-')) {
      csvPath = args[a];
    }
  }

  if (copyFrom) {
    // Keep the source filename so a new export lands beside the legacy CSV
    // rather than overwriting it — the two are different formats.
    mkdirSync(join(root, 'data'), { recursive: true });
    const dest = join(root, 'data', basename(copyFrom));
    copyFileSync(copyFrom, dest);
    csvPath = dest;
    console.log(`Copied source CSV → data/${basename(copyFrom)}`);
  }

  const text = readFileSync(csvPath, 'utf8');
  const rows = parseCsv(text);
  console.log(`Parsed ${rows.length} waypoints from ${csvPath}`);

  for (const supPath of supplementaryCsvPaths(root)) {
    const supText = readFileSync(supPath, 'utf8');
    const supRows = parseCsv(supText);
    const added = mergeRows(rows, supRows);
    console.log(`Merged ${added} new waypoints from ${supPath} (${supRows.length} parsed)`);
  }

  const ndjson = rows.map((w) => JSON.stringify(w)).join('\n') + '\n';
  writeFileSync(join(root, 'supabase-m1/seed/waypoints.ndjson'), ndjson);

  const wp = rows.map((w) => [w.name, w.lat, w.lng, w.t]);
  const blob = { version: 6, types: TYPES, count: rows.length, wp };
  const js = `/* Auto-generated by scripts/build-waypoints.mjs — do not edit manually */\nwindow.BW_WAYPOINTS=${JSON.stringify(blob)};\n`;
  writeFileSync(join(root, 'bw-waypoints.js'), js);

  const byType = {};
  for (const w of rows) byType[w.t] = (byType[w.t] || 0) + 1;
  console.log('Types:', byType);
  console.log(`Wrote supabase-m1/seed/waypoints.ndjson (${rows.length} rows)`);
  console.log(`Wrote bw-waypoints.js (${(js.length / 1024).toFixed(0)} KB)`);
}

main();
