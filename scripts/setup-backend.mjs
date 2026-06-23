#!/usr/bin/env node
/**
 * Full M1 backend setup: migrate → seed → regenerate bw-config.js
 * Requires .env with SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Optional: SUPABASE_DB_URL for direct Postgres migration (if not using supabase link)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');

function loadEnv() {
  if (!existsSync(envPath)) {
    console.error('Missing .env — copy .env.example and fill in Supabase keys.');
    console.error('See SUPABASE_SETUP.md for step-by-step instructions.');
    process.exit(1);
  }
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith('#')) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  for (const k of required) {
    if (!process.env[k] || process.env[k].includes('YOUR') || process.env[k].includes('your-')) {
      console.error(`Invalid or missing ${k} in .env`);
      process.exit(1);
    }
  }
}

loadEnv();

console.log('==> Step 1/3: applying database migration');
if (process.env.SUPABASE_DB_URL) {
  execFileSync('node', ['scripts/db-migrate.mjs'], { cwd: root, stdio: 'inherit', env: process.env });
} else if (existsSync(join(root, 'supabase', '.temp', 'project-ref'))) {
  execFileSync('npx', ['supabase', 'db', 'push'], { cwd: root, stdio: 'inherit', env: process.env });
} else {
  console.log('No SUPABASE_DB_URL and project not linked.');
  console.log('Apply migration manually: paste supabase/migrations/0001_waypoints_ramps.sql');
  console.log('into Supabase Dashboard → SQL Editor, then re-run: npm run setup:backend');
  console.log('');
  console.log('Or link CLI: npx supabase link --project-ref YOUR_REF');
  process.exit(1);
}

console.log('==> Step 2/3: seeding waypoints + ramps');
execFileSync('node', ['supabase-m1/seed/load.mjs'], { cwd: root, stdio: 'inherit', env: process.env });

console.log('==> Step 3/3: regenerating bw-config.js');
execFileSync('node', ['scripts/generate-bw-config.mjs'], { cwd: root, stdio: 'inherit', env: process.env });

console.log('');
console.log('Backend setup complete. Next: npm run deploy');
