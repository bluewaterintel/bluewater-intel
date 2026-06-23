#!/usr/bin/env node
/**
 * Bluewater Intel — Milestone 1 seed loader
 * ----------------------------------------------------------------------------
 * Loads waypoint_types, waypoints (12,027) and ramps (643) into Supabase Postgres.
 *
 * RUN THIS SERVER-SIDE ONLY. It uses the SERVICE ROLE key, which bypasses RLS.
 * The service role key must NEVER ship to the client or be committed to git.
 *
 * Usage (from your repo, with the Supabase project linked):
 *   SUPABASE_URL=https://YOURPROJECT.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node seed/load.mjs
 *
 * Idempotent: it truncates the three tables first, then re-inserts. Safe to
 * re-run. (Truncate is appropriate here because this is public reference data
 * with no foreign keys from user tables yet — Milestone 2 will add those, and
 * at that point reference data should be updated, not truncated.)
 *
 * Requires: @supabase/supabase-js v2  (npm i @supabase/supabase-js)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from '../../scripts/load-env.mjs';

loadEnv(join(dirname(fileURLToPath(import.meta.url)), '../..'));

const __dirname = dirname(fileURLToPath(import.meta.url));

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

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

async function main() {
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
  console.log(`\nDone. waypoints=${wpCount} (expect 12027), ramps=${rpCount} (expect 643).`);
  if (wpCount !== 12027 || rpCount !== 643) {
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
