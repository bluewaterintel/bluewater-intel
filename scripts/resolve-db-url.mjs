#!/usr/bin/env node
/** Resolve a working Supabase Postgres connection string from .env */
import pg from 'pg';
import { loadEnv } from './load-env.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(root);

const ref = process.env.SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1];
const password = process.env.SUPABASE_DB_PASSWORD;
if (!ref || !password) {
  console.error('Need SUPABASE_URL and SUPABASE_DB_PASSWORD in .env');
  process.exit(1);
}

const passwords = [password];
if (!password.startsWith('[')) passwords.push(`[${password}]`);
if (password.startsWith('[') && password.endsWith(']')) {
  passwords.push(password.slice(1, -1));
}

const poolHosts = [
  'aws-1-us-east-2.pooler.supabase.com:6543',
  'aws-1-us-east-2.pooler.supabase.com:5432',
  'aws-0-us-east-1.pooler.supabase.com:6543',
  'aws-0-us-east-1.pooler.supabase.com:5432',
  'aws-1-us-east-1.pooler.supabase.com:6543',
  'aws-0-us-west-1.pooler.supabase.com:6543',
  'aws-0-eu-central-1.pooler.supabase.com:6543',
];

for (const pwd of passwords) {
  const enc = encodeURIComponent(pwd);
  const candidates = [
    process.env.SUPABASE_DB_URL,
    ...poolHosts.map((h) => `postgresql://postgres.${ref}:${enc}@${h}/postgres`),
    `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`,
  ].filter(Boolean);

  for (const url of candidates) {
    const client = new pg.Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    try {
      await client.connect();
      await client.query('select 1');
      await client.end();
      console.log(url);
      process.exit(0);
    } catch (e) {
      const host = url.split('@')[1] || url;
      console.error('FAIL', host, '-', e.code || '', e.message.slice(0, 120));
      try { await client.end(); } catch {}
    }
  }
}
console.error('No working Postgres connection found.');
process.exit(1);
