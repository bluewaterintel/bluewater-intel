#!/usr/bin/env node
/**
 * Push Supabase credentials from local .env to GitHub Actions secrets
 * for the weekly pull-waypoints workflow.
 *
 * Prerequisites:
 *   brew install gh
 *   gh auth login
 *
 * Usage:
 *   node scripts/setup-github-waypoint-secrets.mjs
 *   node scripts/setup-github-waypoint-secrets.mjs --repo bluewaterintel/bluewater-intel
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');

function loadEnv() {
  if (!existsSync(envPath)) {
    console.error('Missing .env — copy .env.example and add your Supabase keys.');
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith('#')) continue;
    env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function haveGh() {
  const r = spawnSync('gh', ['--version'], { encoding: 'utf8' });
  return r.status === 0;
}

function ghAuthOk() {
  const r = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
  return r.status === 0;
}

function setSecret(name, value, repoFlag) {
  execFileSync('gh', ['secret', 'set', name, ...repoFlag], {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  console.log(`  ✓ ${name}`);
}

function main() {
  const args = process.argv.slice(2);
  let repo = 'bluewaterintel/bluewater-intel';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo' && args[i + 1]) repo = args[++i];
  }
  const repoFlag = ['--repo', repo];

  if (!haveGh()) {
    console.error(
      'GitHub CLI (gh) is not installed.\n\n' +
      '  brew install gh\n' +
      '  gh auth login\n\n' +
      'Then re-run: node scripts/setup-github-waypoint-secrets.mjs',
    );
    process.exit(1);
  }
  if (!ghAuthOk()) {
    console.error('Run `gh auth login` first, then re-run this script.');
    process.exit(1);
  }

  const env = loadEnv();
  const dbUrl = env.SUPABASE_DB_URL?.trim();
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!dbUrl && !(url && key)) {
    console.error(
      'Need SUPABASE_DB_URL or both SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env',
    );
    process.exit(1);
  }

  console.log(`Setting Actions secrets on ${repo}…`);
  if (dbUrl) {
    setSecret('SUPABASE_DB_URL', dbUrl, repoFlag);
  } else {
    setSecret('SUPABASE_URL', url, repoFlag);
    setSecret('SUPABASE_SERVICE_ROLE_KEY', key, repoFlag);
  }

  console.log('\nDone. Test: GitHub → Actions → "Snapshot waypoints" → Run workflow');
}

main();
