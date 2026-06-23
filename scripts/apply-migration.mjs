#!/usr/bin/env node
/** Apply all SQL migrations in supabase/migrations/ in order */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadEnv } from './load-env.mjs';
import { execFileSync } from 'node:child_process';

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

const migDir = join(root, 'supabase/migrations');
const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (const f of files) {
    const sql = readFileSync(join(migDir, f), 'utf8');
    console.log(`Applying ${f}…`);
    await client.query(sql);
  }
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log(`Applied ${files.length} migration(s).`);
} finally {
  await client.end();
}
