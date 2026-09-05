#!/usr/bin/env node
/**
 * Rename generic waypoint labels (e.g. "Wreck", "Reef") to Garmin-safe codes:
 *   [TYP][REG][####]  e.g. WKGM0001
 *
 * Only updates `name` — type_code, lat, lng, and geog are untouched.
 *
 * Requires SUPABASE_DB_URL or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.
 *
 * Usage:
 *   node scripts/rename-generic-waypoints.mjs           # dry-run (default)
 *   node scripts/rename-generic-waypoints.mjs --apply     # write to Supabase
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { loadEnv } from './load-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(root);

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;
const APPLY = process.argv.includes('--apply');
const TYPES = JSON.parse(
  readFileSync(join(root, 'supabase-m1/seed/waypoint_types.json'), 'utf8'),
);

/** Mirrors regionFor() in bw-core.js → 2-letter Garmin region codes. */
function regionCode(lat, lng) {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (lng <= -117.0 && lat >= 32.0 && lat <= 35.5) return 'CA';
  if (lng < -81.5 && lat < 31) return 'GM';
  if (lat >= 40.5) return 'NE';
  if (lat >= 36.5) return 'MA';
  return 'SE';
}

function isGenericName(name, typeCode) {
  const label = TYPES[typeCode];
  return Boolean(label && name === label);
}

function buildRenames(rows) {
  const candidates = rows.filter((r) => isGenericName(r.name, r.type_code));
  const groups = new Map();

  for (const row of candidates) {
    const reg = regionCode(row.lat, row.lng);
    if (!reg) {
      throw new Error(
        `Cannot assign region for waypoint id=${row.id} (${row.lat}, ${row.lng})`,
      );
    }
    const key = `${row.type_code.toUpperCase()}${reg}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const renames = [];
  for (const [prefix, group] of groups) {
    group.sort((a, b) => b.lat - a.lat || a.lng - b.lng);
    group.forEach((row, i) => {
      const serial = String(i + 1).padStart(4, '0');
      renames.push({
        id: row.id,
        oldName: row.name,
        newName: `${prefix}${serial}`,
        type_code: row.type_code,
        lat: row.lat,
        lng: row.lng,
      });
    });
  }

  renames.sort((a, b) => a.id - b.id);
  return renames;
}

async function fetchRowsViaPg() {
  const client = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const { rows } = await client.query(
    'select id, name, type_code, lat, lng from public.waypoints order by id',
  );
  await client.end();
  return rows;
}

async function fetchRowsViaRest() {
  const db = createClient(URL, KEY, { auth: { persistSession: false } });
  const pageSize = 1000;
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from('waypoints')
      .select('id, name, type_code, lat, lng')
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

async function applyViaPg(renames) {
  const client = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query('begin');
    for (const r of renames) {
      const { rowCount } = await client.query(
        'update public.waypoints set name = $1 where id = $2 and name = $3',
        [r.newName, r.id, r.oldName],
      );
      if (rowCount !== 1) {
        throw new Error(
          `Expected to update id=${r.id} "${r.oldName}" but rowCount=${rowCount}`,
        );
      }
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    await client.end();
  }
}

async function applyViaRest(renames) {
  const db = createClient(URL, KEY, { auth: { persistSession: false } });
  const concurrency = 25;
  let done = 0;
  for (let i = 0; i < renames.length; i += concurrency) {
    const chunk = renames.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (r) => {
        const { data, error } = await db
          .from('waypoints')
          .update({ name: r.newName })
          .eq('id', r.id)
          .eq('name', r.oldName)
          .select('id');
        if (error) throw error;
        if (!data?.length) {
          throw new Error(
            `Expected to update id=${r.id} "${r.oldName}" but no rows matched`,
          );
        }
      }),
    );
    done += chunk.length;
    process.stdout.write(`\rUpdated ${done}/${renames.length}`);
  }
  process.stdout.write('\n');
}

function summarize(renames) {
  const byPrefix = {};
  for (const r of renames) {
    const prefix = r.newName.slice(0, 4);
    byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
  }
  console.log(`Generic rows to rename: ${renames.length}`);
  console.log('By type+region prefix:', byPrefix);
  console.log('Samples:');
  for (const r of renames.slice(0, 8)) {
    console.log(
      `  id=${r.id}  ${r.oldName} (${r.type_code}) → ${r.newName}  [${r.lat}, ${r.lng}]`,
    );
  }
  if (renames.length > 8) console.log(`  … and ${renames.length - 8} more`);
}

async function main() {
  if (!DB_URL && (!URL || !KEY)) {
    console.error('Missing SUPABASE_DB_URL or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const rows = DB_URL ? await fetchRowsViaPg() : await fetchRowsViaRest();
  const renames = buildRenames(rows);

  if (!renames.length) {
    console.log('No generic waypoint names found — nothing to do.');
    return;
  }

  const newNames = new Set(renames.map((r) => r.newName));
  if (newNames.size !== renames.length) {
    console.error('Duplicate generated names — aborting.');
    process.exit(1);
  }

  const existingNames = new Set(
    rows.filter((r) => !isGenericName(r.name, r.type_code)).map((r) => r.name),
  );
  const collisions = renames.filter((r) => existingNames.has(r.newName));
  if (collisions.length) {
    console.error('Generated names collide with existing waypoint names:');
    for (const r of collisions.slice(0, 10)) {
      console.error(`  ${r.newName} (would rename id=${r.id})`);
    }
    process.exit(1);
  }

  summarize(renames);

  if (!APPLY) {
    console.log('\nDry run only — pass --apply to update Supabase.');
    return;
  }

  console.log(`\nApplying ${renames.length} renames via ${DB_URL ? 'Postgres' : 'REST'}…`);
  if (DB_URL) await applyViaPg(renames);
  else await applyViaRest(renames);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
