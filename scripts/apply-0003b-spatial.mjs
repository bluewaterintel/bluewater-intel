#!/usr/bin/env node
/** Apply 0003b via Supabase Management API (needs superuser; pooler cannot). */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const env = { ...process.env };
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
}

const token = env.SUPABASE_ACCESS_TOKEN;
const ref = (env.SUPABASE_URL || '').match(/https:\/\/([^.]+)/)?.[1];
if (!token || !ref) {
  console.error('Need SUPABASE_ACCESS_TOKEN and SUPABASE_URL in .env');
  process.exit(1);
}

const sql = readFileSync(join(root, 'supabase/migrations/0003b_spatial_ref_sys_rls.sql'), 'utf8');
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

const body = await res.text();
if (!res.ok) {
  console.error('Management API failed:', res.status, body);
  process.exit(1);
}
console.log('Applied 0003b spatial_ref_sys RLS via Management API');
