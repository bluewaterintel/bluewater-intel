#!/usr/bin/env node
/**
 * Export the master waypoint CSV to a spreadsheet-friendly file for editing.
 *
 * The master carries hemisphere-suffixed coordinates ("39.5435 N") plus DMS
 * columns full of escaped quotes, which spreadsheets mangle on save. This emits
 * signed decimals and drops the DMS entirely — the build regenerates it — so a
 * round trip through Excel/Numbers/Sheets can't corrupt the source.
 *
 * The id column is what makes edits unambiguous on the way back: keep it to
 * edit a row, blank it to add one, delete the line to remove the waypoint.
 *
 * Usage:
 *   node scripts/export-waypoints-csv.mjs
 *   node scripts/export-waypoints-csv.mjs --out data/waypoints-editable.csv
 *   node scripts/export-waypoints-csv.mjs --type Canyon --near 37.45,-74.48 --radius-nm 50
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = join(root, 'data/Master_Waypoint_Combined_1.csv');

function parseCsv(text) {
  const rows = [];
  let i = 0;
  const len = text.length;
  function readField() {
    if (text[i] === '"') {
      i++;
      let f = '';
      while (i < len) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { f += '"'; i += 2; } else { i++; break; }
        } else f += text[i++];
      }
      if (text[i] === ',') i++;
      return f;
    }
    let f = '';
    while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') f += text[i++];
    if (text[i] === ',') i++;
    return f;
  }
  function readRow() {
    const fields = [];
    while (i < len) {
      fields.push(readField());
      if (text[i] === '\r') i++;
      if (text[i] === '\n') { i++; break; }
      if (i >= len) break;
    }
    return fields;
  }
  const header = readRow();
  const idx = Object.fromEntries(header.map((h, n) => [h.trim(), n]));
  while (i < len) {
    const f = readRow();
    if (!f.length || (f.length === 1 && !f[0])) continue;
    rows.push({
      name: (f[idx.Name] || '').trim(),
      latRaw: (f[idx.Latitude] || '').trim(),
      lngRaw: (f[idx.Longitude] || '').trim(),
      type: (f[idx.Type] || '').trim(),
    });
  }
  return rows;
}

function signed(s, isLat) {
  const parts = s.trim().split(/\s+/);
  const v = parseFloat(parts[0]);
  if (!Number.isFinite(v)) return null;
  const hem = (parts[1] || '').toUpperCase();
  return isLat ? (hem === 'S' ? -v : v) : (hem === 'E' ? v : -v);
}

function nmBetween(a, b, c, d) {
  const R = 3440.065;
  const p = Math.PI / 180;
  const dLat = (c - a) * p;
  const dLng = (d - b) * p;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a * p) * Math.cos(c * p) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function csvCell(s) {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function main() {
  const args = process.argv.slice(2);
  let out = join(root, 'data/waypoints-editable.csv');
  let type = null;
  let near = null;
  let radiusNm = 50;
  for (let a = 0; a < args.length; a++) {
    if (args[a] === '--out') out = args[++a];
    else if (args[a] === '--type') type = args[++a];
    else if (args[a] === '--near') near = args[++a].split(',').map(Number);
    else if (args[a] === '--radius-nm') radiusNm = Number(args[++a]);
  }

  const rows = parseCsv(readFileSync(MASTER, 'utf8'));
  let kept = rows.map((r, n) => ({
    id: n + 1,
    name: r.name,
    lat: signed(r.latRaw, true),
    lng: signed(r.lngRaw, false),
    type: r.type,
  })).filter((r) => r.name && r.type && r.lat != null && r.lng != null);

  const total = kept.length;
  if (type) {
    const want = type.toLowerCase();
    kept = kept.filter((r) => r.type.toLowerCase() === want);
  }
  if (near && near.length === 2 && Number.isFinite(near[0])) {
    kept = kept.filter((r) => nmBetween(near[0], near[1], r.lat, r.lng) <= radiusNm);
  }

  const lines = ['id,name,lat,lng,type'];
  for (const r of kept) {
    lines.push([r.id, csvCell(r.name), r.lat, r.lng, r.type].join(','));
  }
  writeFileSync(out, lines.join('\n') + '\n');

  const byType = {};
  for (const r of kept) byType[r.type] = (byType[r.type] || 0) + 1;
  console.log(`Exported ${kept.length} of ${total} waypoints -> ${out}`);
  console.log('Types:', byType);
}

main();
