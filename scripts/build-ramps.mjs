#!/usr/bin/env node
/**
 * Build boat-ramp artifacts from NDJSON or boat_ramps_standardized.csv.
 *
 * Outputs:
 *   - data/ramps.ndjson                      (source copy, if --copy-ndjson)
 *   - data/boat_ramps_standardized.csv        (source copy, if --copy)
 *   - supabase-m1/seed/ramps.ndjson           (DB seed)
 *   - index.html inline window.BW_RAMPS       (offline embedded fallback)
 *
 * Usage:
 *   node scripts/build-ramps.mjs --copy-ndjson "/path/to/ramps.ndjson"
 *   node scripts/build-ramps.mjs [path/to/ramps.ndjson]
 *   node scripts/build-ramps.mjs --copy "/path/to/boat_ramps_standardized.csv"
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_NDJSON = join(root, 'data/ramps.ndjson');
const DEFAULT_CSV = join(root, 'data/boat_ramps_standardized.csv');
const HTML = join(root, 'index.html');

function parseNdjson(text) {
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line, i) => {
      const row = JSON.parse(line);
      const { name, lat, lng } = row;
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error(`bad ramp row ${i + 1}: ${line}`);
      }
      return { name, lat, lng };
    });
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

function writeArtifacts(rows, version) {
  const ndjson = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(join(root, 'supabase-m1/seed/ramps.ndjson'), ndjson);
  patchHtml(rows, version);
  console.log(`Wrote supabase-m1/seed/ramps.ndjson (${rows.length} rows)`);
  console.log(`Patched index.html window.BW_RAMPS (${rows.length} ramps)`);
}

function patchHtml(rows, version) {
  const rp = rows.map((r) => [r.name, r.lat, r.lng]);
  const blob = { version, count: rows.length, rp };
  const script = `<script>window.BW_RAMPS=${JSON.stringify(blob)};</script>`;
  const html = readFileSync(HTML, 'utf8');
  const re = /<script>window\.BW_RAMPS=\{[^]*?\};<\/script>/;
  if (!re.test(html)) throw new Error('BW_RAMPS script block not found in index.html');
  writeFileSync(HTML, html.replace(re, script));
}

function main() {
  const args = process.argv.slice(2);
  let csvPath = DEFAULT_CSV;
  let ndjsonPath = DEFAULT_NDJSON;
  let copyFrom = null;
  let copyNdjsonFrom = null;
  let useNdjson = false;

  for (let a = 0; a < args.length; a++) {
    if (args[a] === '--copy' && args[a + 1]) {
      copyFrom = args[++a];
    } else if (args[a] === '--copy-ndjson' && args[a + 1]) {
      copyNdjsonFrom = args[++a];
    } else if (args[a] === '--ndjson') {
      useNdjson = true;
      if (args[a + 1] && !args[a + 1].startsWith('-')) ndjsonPath = args[++a];
    } else if (!args[a].startsWith('-')) {
      if (args[a].endsWith('.ndjson')) {
        useNdjson = true;
        ndjsonPath = args[a];
      } else {
        csvPath = args[a];
      }
    }
  }

  if (copyNdjsonFrom) {
    mkdirSync(join(root, 'data'), { recursive: true });
    copyFileSync(copyNdjsonFrom, DEFAULT_NDJSON);
    ndjsonPath = DEFAULT_NDJSON;
    useNdjson = true;
    console.log('Copied source NDJSON → data/ramps.ndjson');
  }

  if (copyFrom) {
    mkdirSync(join(root, 'data'), { recursive: true });
    copyFileSync(copyFrom, DEFAULT_CSV);
    csvPath = DEFAULT_CSV;
    console.log('Copied source CSV → data/boat_ramps_standardized.csv');
  }

  if (useNdjson || copyNdjsonFrom) {
    const text = readFileSync(ndjsonPath, 'utf8');
    const rows = parseNdjson(text);
    console.log(`Parsed ${rows.length} ramps from ${ndjsonPath}`);
    writeArtifacts(rows, 5);
    return;
  }

  const text = readFileSync(csvPath, 'utf8');
  const rows = parseCsv(text);
  console.log(`Parsed ${rows.length} ramps from ${csvPath}`);

  writeArtifacts(rows, 4);
}

main();
