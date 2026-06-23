#!/usr/bin/env node
/**
 * Apply Milestone 1 migration SQL via direct Postgres connection.
 * Set SUPABASE_DB_URL in .env, e.g.:
 *   postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(join(root, 'supabase/migrations/0001_waypoints_ramps.sql'), 'utf8');

function loadEnv() {
  const envPath = join(root, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trimStart().startsWith('#')) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

loadEnv();

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.log('No SUPABASE_DB_URL — trying supabase db push…');
  execFileSync('npx', ['supabase', 'db', 'push'], { cwd: root, stdio: 'inherit' });
  process.exit(0);
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(migration);
  console.log('Migration applied via Postgres.');
} finally {
  await client.end();
}
