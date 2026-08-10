#!/usr/bin/env node
/**
 * Bluewater Intel — Milestone 1 seed loader
 * ----------------------------------------------------------------------------
 * Loads waypoint_types, waypoints and ramps into Supabase Postgres from the
 * NDJSON in this directory (regenerate with `npm run build:waypoints`).
 *
 * RUN THIS SERVER-SIDE ONLY. It uses the SERVICE ROLE key, which bypasses RLS.
 * The service role key must NEVER ship to the client or be committed to git.
 *
 * Usage (from your repo, with the Supabase project linked):
 *   SUPABASE_URL=https://YOURPROJECT.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node seed/load.mjs
 *
 * Prefer SUPABASE_DB_URL in .env when using the new sb_secret_ API keys — the
 * REST client rejects them with "Unregistered API key"; direct Postgres works.
 *
 * Idempotent: it truncates the three tables first, then re-inserts. Safe to
 * re-run. (Truncate is appropriate here because this is public reference data
 * with no foreign keys from user tables yet — Milestone 2 will add those, and
 * at that point reference data should be updated, not truncated.)
 *
 * Requires: @supabase/supabase-js v2, pg (for direct Postgres seeding)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { loadEnv } from '../../scripts/load-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
loadEnv(root);

const __dirname = dirname(fileURLToPath(import.meta.url));

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;

if (!DB_URL && (!URL || !KEY)) {
  console.error('Missing SUPABASE_DB_URL or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const db = URL && KEY
  ? createClient(URL, KEY, { auth: { persistSession: false } })
  : null;

const readNdjson = (f) =>
  readFileSync(join(__dirname, f), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

const CHUNK = 1000; // rows per insert request
const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// PostGIS geography literal from lat/lng. SRID 4326, lon-lat order.
const pt = (lat, lng) => `SRID=4326;POINT(${lng} ${lat})`;

async function seedViaPg() {
  const client = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const types = JSON.parse(readFileSync(join(__dirname, 'waypoint_types.json'), 'utf8'));
  const typeRows = Object.entries(types).map(([code, label]) => ({ code, label }));
  const wps = readNdjson('waypoints.ndjson');
  const rps = readNdjson('ramps.ndjson');

  console.log('Truncating tables (Postgres)…');
  await client.query('truncate table public.waypoints, public.ramps, public.waypoint_types restart identity cascade');

  console.log(`Inserting ${typeRows.length} waypoint_types…`);
  for (const row of typeRows) {
    await client.query(
      'insert into public.waypoint_types (code, label) values ($1, $2)',
      [row.code, row.label],
    );
  }

  console.log(`Inserting ${wps.length} waypoints in chunks of ${CHUNK}…`);
  let n = 0;
  for (const c of chunk(wps, CHUNK)) {
    const vals = [];
    const params = [];
    let i = 1;
    for (const w of c) {
      vals.push(`($${i++}, $${i++}, $${i++}, $${i++}, ST_SetSRID(ST_MakePoint($${i++}, $${i++}), 4326)::geography)`);
      params.push(w.name, w.t, w.lat, w.lng, w.lng, w.lat);
    }
    await client.query(
      `insert into public.waypoints (name, type_code, lat, lng, geog) values ${vals.join(',')}`,
      params,
    );
    n += c.length;
    process.stdout.write(`\r  ${n}/${wps.length}`);
  }
  process.stdout.write('\n');

  console.log(`Inserting ${rps.length} ramps…`);
  for (const c of chunk(rps, CHUNK)) {
    const vals = [];
    const params = [];
    let i = 1;
    for (const r of c) {
      vals.push(`($${i++}, $${i++}, $${i++}, ST_SetSRID(ST_MakePoint($${i++}, $${i++}), 4326)::geography)`);
      params.push(r.name, r.lat, r.lng, r.lng, r.lat);
    }
    await client.query(
      `insert into public.ramps (name, lat, lng, geog) values ${vals.join(',')}`,
      params,
    );
  }

  const { rows: [counts] } = await client.query(`
    select
      (select count(*)::int from public.waypoints) as wp,
      (select count(*)::int from public.ramps) as rp
  `);
  // Expect what we actually sent — a hardcoded count silently goes stale every
  // time the dataset is rebuilt, and this check exists to catch partial inserts.
  console.log(`\nDone. waypoints=${counts.wp} (expect ${wps.length}), ramps=${counts.rp} (expect ${rps.length}).`);
  if (counts.wp !== wps.length || counts.rp !== rps.length) {
    await client.end();
    console.error('COUNT MISMATCH — investigate before wiring the client.');
    process.exit(1);
  }

  const { rows: probe } = await client.query(
    'select name, nm from public.waypoints_within($1, $2, $3, $4) limit 1',
    [35.7972, -75.5495, 40, null],
  );
  const hit = probe[0];
  console.log(`RPC probe (Oregon Inlet, 40nm): ${probe.length ? 1 : 0}+ waypoints, nearest "${hit?.name}" @ ${hit?.nm?.toFixed?.(1) ?? '?'} nm.`);
  await client.end();
}

async function main() {
  if (DB_URL) {
    console.log('Seeding via direct Postgres (SUPABASE_DB_URL)…');
    return seedViaPg();
  }
  // ── waypoint_types ────────────────────────────────────────────────────────
  const types = JSON.parse(readFileSync(join(__dirname, 'waypoint_types.json'), 'utf8'));
  const typeRows = Object.entries(types).map(([code, label]) => ({ code, label }));

  console.log('Truncating tables…');
  // RPC-free truncate via delete (service role bypasses RLS). Order: child first.
  for (const t of ['waypoints', 'ramps', 'waypoint_types']) {
    const { error } = await db.from(t).delete().neq('id', -1).select('id', { head: true, count: 'exact' });
    // waypoint_types has no `id`; delete-all differently:
    if (error && t === 'waypoint_types') {
      await db.from('waypoint_types').delete().neq('code', '__none__');
    }
  }

  console.log(`Inserting ${typeRows.length} waypoint_types…`);
  {
    const { error } = await db.from('waypoint_types').insert(typeRows);
    if (error) throw error;
  }

  // ── waypoints ───────────────────────────────────────────────────────────────
  const wps = readNdjson('waypoints.ndjson').map((w) => ({
    name: w.name,
    type_code: w.t,
    lat: w.lat,
    lng: w.lng,
    geog: pt(w.lat, w.lng),
  }));
  console.log(`Inserting ${wps.length} waypoints in chunks of ${CHUNK}…`);
  let n = 0;
  for (const c of chunk(wps, CHUNK)) {
    const { error } = await db.from('waypoints').insert(c);
    if (error) throw error;
    n += c.length;
    process.stdout.write(`\r  ${n}/${wps.length}`);
  }
  process.stdout.write('\n');

  // ── ramps ────────────────────────────────────────────────────────────────────
  const rps = readNdjson('ramps.ndjson').map((r) => ({
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    geog: pt(r.lat, r.lng),
  }));
  console.log(`Inserting ${rps.length} ramps…`);
  for (const c of chunk(rps, CHUNK)) {
    const { error } = await db.from('ramps').insert(c);
    if (error) throw error;
  }

  // ── verify ───────────────────────────────────────────────────────────────────
  const { count: wpCount } = await db.from('waypoints').select('*', { head: true, count: 'exact' });
  const { count: rpCount } = await db.from('ramps').select('*', { head: true, count: 'exact' });
  console.log(`\nDone. waypoints=${wpCount} (expect ${wps.length}), ramps=${rpCount} (expect ${rps.length}).`);
  if (wpCount !== wps.length || rpCount !== rps.length) {
    console.error('COUNT MISMATCH — investigate before wiring the client.');
    process.exit(1);
  }

  // Spot-check one radius query so we know the RPC + index work end-to-end.
  const { data: probe, error: probeErr } = await db.rpc('waypoints_within', {
    p_lat: 35.7972, p_lng: -75.5495, p_radius_nm: 40, // Oregon Inlet, NC (fallback home port)
  });
  if (probeErr) throw probeErr;
  console.log(`RPC probe (Oregon Inlet, 40nm): ${probe.length} waypoints, nearest "${probe[0]?.name}" @ ${probe[0]?.nm?.toFixed(1)} nm.`);
}

main().catch((e) => { console.error('\nSeed failed:', e.message || e); process.exit(1); });
