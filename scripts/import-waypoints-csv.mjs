#!/usr/bin/env node
/**
 * Fold an edited waypoints-editable.csv back into the master CSV.
 *
 * Validates before writing anything — a bad type code or a longitude with the
 * sign dropped would otherwise sail through the build and put waypoints in the
 * wrong ocean. Reports added / changed / removed so the diff is reviewable
 * before it reaches Supabase.
 *
 * Rows are matched by id. A blank id is a new waypoint; an id present in the
 * master but absent from the edited file is a deletion.
 *
 * Usage:
 *   node scripts/import-waypoints-csv.mjs data/waypoints-editable.csv
 *   node scripts/import-waypoints-csv.mjs edited.csv --apply
 *   node scripts/import-waypoints-csv.mjs edited.csv --partial --apply
 *
 * --partial: the edited file is a subset (e.g. exported with --type/--near), so
 *            unlisted master rows are kept instead of treated as deletions.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = join(root, 'data/Master_Waypoint_Combined_1.csv');

const TYPES = ['Wreck', 'Reef', 'Structure', 'Ledge', 'Rock', 'Hole', 'Hump',
  'Canyon', 'Tower', 'Platform', 'Rig'];
const TYPE_BY_LOWER = Object.fromEntries(TYPES.map((t) => [t.toLowerCase(), t]));

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
  const header = readRow().map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, n) => [h, n]));
  while (i < len) {
    const f = readRow();
    if (!f.length || (f.length === 1 && !f[0])) continue;
    rows.push({ f, idx });
  }
  return { rows, idx, header };
}

function signed(s, isLat) {
  const parts = String(s).trim().split(/\s+/);
  const v = parseFloat(parts[0]);
  if (!Number.isFinite(v)) return null;
  const hem = (parts[1] || '').toUpperCase();
  return isLat ? (hem === 'S' ? -v : v) : (hem === 'E' ? v : -v);
}

function toDms(dec, isLat) {
  const hem = isLat ? (dec < 0 ? 'S' : 'N') : (dec < 0 ? 'W' : 'E');
  const a = Math.abs(dec);
  const d = Math.floor(a);
  const mFull = (a - d) * 60;
  const m = Math.floor(mFull);
  const s = ((mFull - m) * 60).toFixed(2);
  return `${d}° ${m}' ${s}" ${hem}`;
}

function hemi(dec, isLat) {
  const hem = isLat ? (dec < 0 ? 'S' : 'N') : (dec < 0 ? 'W' : 'E');
  return `${Math.abs(dec)} ${hem}`;
}

function csvCell(s) {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function main() {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith('-'));
  const apply = args.includes('--apply');
  const partial = args.includes('--partial');
  if (!input) {
    console.error('Usage: node scripts/import-waypoints-csv.mjs <edited.csv> [--apply] [--partial]');
    process.exit(1);
  }
  if (!existsSync(input)) {
    console.error(`Not found: ${input}`);
    process.exit(1);
  }

  // Master, in original order, keyed by 1-based data row = the exported id.
  const master = parseCsv(readFileSync(MASTER, 'utf8'));
  const mi = master.idx;
  const current = master.rows.map((r, n) => ({
    id: n + 1,
    name: (r.f[mi.Name] || '').trim(),
    lat: signed(r.f[mi.Latitude], true),
    lng: signed(r.f[mi.Longitude], false),
    type: (r.f[mi.Type] || '').trim(),
  }));
  const byId = new Map(current.map((r) => [r.id, r]));

  const edited = parseCsv(readFileSync(input, 'utf8'));
  const ei = edited.idx;
  for (const need of ['name', 'lat', 'lng', 'type']) {
    if (ei[need] == null) {
      console.error(`Edited CSV missing column: ${need} (found: ${edited.header.join(', ')})`);
      process.exit(1);
    }
  }

  const errors = [];
  const incoming = [];
  const seenIds = new Set();
  edited.rows.forEach((r, n) => {
    const line = n + 2;
    const rawId = (r.f[ei.id] ?? '').trim();
    const name = (r.f[ei.name] || '').trim();
    const lat = Number((r.f[ei.lat] || '').trim());
    const lng = Number((r.f[ei.lng] || '').trim());
    const typeRaw = (r.f[ei.type] || '').trim();
    const type = TYPE_BY_LOWER[typeRaw.toLowerCase()];

    if (!name) errors.push(`line ${line}: empty name`);
    if (!type) errors.push(`line ${line}: unknown type "${typeRaw}" (valid: ${TYPES.join(', ')})`);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push(`line ${line}: bad lat "${r.f[ei.lat]}"`);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.push(`line ${line}: bad lng "${r.f[ei.lng]}"`);
    // Every waypoint in this dataset is western hemisphere; a positive
    // longitude means the minus sign was lost, which spreadsheets do.
    if (Number.isFinite(lng) && lng > 0) errors.push(`line ${line}: "${name}" lng ${lng} is positive — western-hemisphere data, sign likely dropped`);

    let id = null;
    if (rawId) {
      id = Number(rawId);
      if (!Number.isInteger(id) || !byId.has(id)) errors.push(`line ${line}: unknown id "${rawId}"`);
      else if (seenIds.has(id)) errors.push(`line ${line}: duplicate id ${id}`);
      else seenIds.add(id);
    }
    incoming.push({ id, name, lat, lng, type });
  });

  if (errors.length) {
    console.error(`${errors.length} problem(s) — nothing written:\n`);
    for (const e of errors.slice(0, 40)) console.error('  ' + e);
    if (errors.length > 40) console.error(`  … and ${errors.length - 40} more`);
    process.exit(1);
  }

  const changed = [];
  const added = [];
  for (const r of incoming) {
    if (r.id == null) { added.push(r); continue; }
    const was = byId.get(r.id);
    const diffs = [];
    if (was.name !== r.name) diffs.push(`name "${was.name}" -> "${r.name}"`);
    if (was.type !== r.type) diffs.push(`type ${was.type} -> ${r.type}`);
    if (Math.abs(was.lat - r.lat) > 1e-9 || Math.abs(was.lng - r.lng) > 1e-9) {
      diffs.push(`pos ${was.lat},${was.lng} -> ${r.lat},${r.lng}`);
    }
    if (diffs.length) changed.push({ r, was, diffs });
  }
  const removed = partial ? [] : current.filter((r) => !seenIds.has(r.id));

  console.log(`master   : ${current.length} waypoints`);
  console.log(`edited   : ${edited.rows.length} rows${partial ? ' (partial — unlisted rows kept)' : ''}`);
  console.log(`\nadded    : ${added.length}`);
  for (const a of added.slice(0, 20)) console.log(`  + ${a.name} (${a.type}) ${a.lat},${a.lng}`);
  if (added.length > 20) console.log(`  … and ${added.length - 20} more`);
  console.log(`changed  : ${changed.length}`);
  for (const c of changed.slice(0, 20)) console.log(`  ~ #${c.r.id} ${c.was.name}: ${c.diffs.join('; ')}`);
  if (changed.length > 20) console.log(`  … and ${changed.length - 20} more`);
  console.log(`removed  : ${removed.length}`);
  for (const r of removed.slice(0, 20)) console.log(`  - #${r.id} ${r.name} (${r.type})`);
  if (removed.length > 20) console.log(`  … and ${removed.length - 20} more`);

  // Preserve master order; edits stay in place, new rows append.
  const editedById = new Map(incoming.filter((r) => r.id != null).map((r) => [r.id, r]));
  const final = [];
  for (const r of current) {
    if (editedById.has(r.id)) final.push(editedById.get(r.id));
    else if (partial || seenIds.has(r.id)) final.push(r);
  }
  for (const a of added) final.push(a);

  console.log(`\nresult   : ${final.length} waypoints`);

  if (!apply) {
    console.log('\ndry run — re-run with --apply to write data/Master_Waypoint_Combined_1.csv');
    return;
  }

  copyFileSync(MASTER, MASTER + '.bak');
  const out = ['Name,Latitude,Longitude,Latitude_DMS,Longitude_DMS,Type'];
  for (const r of final) {
    out.push([
      csvCell(r.name),
      csvCell(hemi(r.lat, true)),
      csvCell(hemi(r.lng, false)),
      csvCell(toDms(r.lat, true)),
      csvCell(toDms(r.lng, false)),
      csvCell(r.type),
    ].join(','));
  }
  writeFileSync(MASTER, out.join('\n') + '\n');
  console.log(`\nwrote ${MASTER} (backup at Master_Waypoint_Combined_1.csv.bak)`);
  console.log('next:\n  npm run build:waypoints\n  npm run seed');
}

main();
