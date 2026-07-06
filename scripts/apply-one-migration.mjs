#!/usr/bin/env node
/** Apply a single migration file by name (e.g. 0011_pro_includes_all_waypoints.sql) */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { loadEnv } from './load-env.mjs';
import { execFileSync } from 'node:child_process';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/apply-one-migration.mjs <filename.sql>');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(root);

let dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl && process.env.SUPABASE_DB_PASSWORD) {
  dbUrl = execFileSync('node', ['scripts/resolve-db-url.mjs'], { cwd: root, encoding: 'utf8' }).trim();
}
if (!dbUrl) {
  console.error('No database connection — set SUPABASE_DB_URL in .env');
  process.exit(1);
}

const path = join(root, 'supabase/migrations', file);
if (!existsSync(path)) {
  console.error('Migration not found:', path);
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const sql = readFileSync(path, 'utf8');
  console.log(`Applying ${file}…`);
  await client.query(sql);
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Done.');
} finally {
  await client.end();
}
