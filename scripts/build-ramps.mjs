#!/usr/bin/env node
/**
 * Build boat-ramp artifacts from boat_ramps_standardized.csv.
 *
 * Outputs:
 *   - data/boat_ramps_standardized.csv   (source copy, if --copy)
 *   - supabase-m1/seed/ramps.ndjson       (DB seed)
 *   - index.html inline window.BW_RAMPS   (offline embedded fallback)
 *
 * Usage:
 *   node scripts/build-ramps.mjs [path/to/boat_ramps_standardized.csv]
 *   node scripts/build-ramps.mjs --copy "/path/to/source.csv"
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CSV = join(root, 'data/boat_ramps_standardized.csv');
const HTML = join(root, 'index.html');

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

  const header = readRow();
  const idx = Object.fromEntries(header.map((h, n) => [h.trim(), n]));
  for (const need of ['Name', 'Latitude', 'Longitude']) {
    if (idx[need] == null) throw new Error(`CSV missing column: ${need}`);
  }

  while (i < len) {
    const fields = readRow();
    if (!fields.length || (fields.length === 1 && !fields[0])) continue;
    const name = fields[idx.Name]?.trim();
    if (!name) continue;
    const lat = parseFloat(fields[idx.Latitude]);
    const lng = parseFloat(fields[idx.Longitude]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(`bad coords for ramp: ${name}`);
    }
    rows.push({ name, lat, lng });
  }
  return rows;
}

function patchHtml(rows) {
  const rp = rows.map((r) => [r.name, r.lat, r.lng]);
  const blob = { version: 4, count: rows.length, rp };
  const script = `<script>window.BW_RAMPS=${JSON.stringify(blob)};</script>`;
  const html = readFileSync(HTML, 'utf8');
  const re = /<script>window\.BW_RAMPS=\{[^]*?\};<\/script>/;
  if (!re.test(html)) throw new Error('BW_RAMPS script block not found in index.html');
  writeFileSync(HTML, html.replace(re, script));
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
    mkdirSync(join(root, 'data'), { recursive: true });
    copyFileSync(copyFrom, DEFAULT_CSV);
    csvPath = DEFAULT_CSV;
    console.log('Copied source CSV → data/boat_ramps_standardized.csv');
  }

  const text = readFileSync(csvPath, 'utf8');
  const rows = parseCsv(text);
  console.log(`Parsed ${rows.length} ramps from ${csvPath}`);

  const ndjson = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(join(root, 'supabase-m1/seed/ramps.ndjson'), ndjson);

  patchHtml(rows);

  console.log(`Wrote supabase-m1/seed/ramps.ndjson (${rows.length} rows)`);
  console.log(`Patched index.html window.BW_RAMPS (${rows.length} ramps)`);
}

main();
