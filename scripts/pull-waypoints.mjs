#!/usr/bin/env node
/**
 * Snapshot the live Supabase waypoints table into git-tracked artifacts.
 *
 * Supabase is authoritative — edit rows in the dashboard (or SQL), then run:
 *   npm run pull:waypoints
 *   git add supabase-m1/seed/waypoints.ndjson bw-waypoints.js
 *   git commit -m "waypoints: …"
 *
 * Requires SUPABASE_DB_URL or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.
 *
 * Usage:
 *   npm run pull:waypoints
 *   node scripts/pull-waypoints.mjs --no-build   # ndjson only
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { loadEnv } from './load-env.mjs';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(root);

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;
const NDJSON = join(root, 'supabase-m1/seed/waypoints.ndjson');

async function pullViaPg() {
  const client = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const { rows } = await client.query(
    'select name, type_code, lat, lng from public.waypoints order by id',
  );
  await client.end();
  return rows.map((r) => ({
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    t: r.type_code,
  }));
}

async function pullViaRest() {
  const db = createClient(URL, KEY, { auth: { persistSession: false } });
  const pageSize = 1000;
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from('waypoints')
      .select('name, type_code, lat, lng')
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) {
      all.push({ name: r.name, lat: r.lat, lng: r.lng, t: r.type_code });
    }
    if (data.length < pageSize) break;
  }
  return all;
}

async function main() {
  if (!DB_URL && (!URL || !KEY)) {
    console.error('Missing SUPABASE_DB_URL or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const rows = DB_URL ? await pullViaPg() : await pullViaRest();
  if (!rows.length) {
    console.error('No waypoints returned — is the table empty?');
    process.exit(1);
  }

  const ndjson = rows.map((w) => JSON.stringify(w)).join('\n') + '\n';
  writeFileSync(NDJSON, ndjson);

  const byType = {};
  for (const w of rows) byType[w.t] = (byType[w.t] || 0) + 1;
  console.log(`Pulled ${rows.length} waypoints from Supabase → supabase-m1/seed/waypoints.ndjson`);
  console.log('Types:', byType);

  if (!process.argv.includes('--no-build')) {
    execFileSync('node', ['scripts/build-waypoints.mjs'], { cwd: root, stdio: 'inherit' });
  }
}

main().catch((e) => {
  console.error('pull-waypoints failed:', e.message || e);
  process.exit(1);
});
