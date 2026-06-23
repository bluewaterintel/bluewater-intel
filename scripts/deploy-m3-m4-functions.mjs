#!/usr/bin/env node
/**
 * Deploy M3 (brief) + M4 (ocean) Supabase Edge Functions.
 * Requires: supabase login OR SUPABASE_ACCESS_TOKEN in .env / env
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_REF = "mealpzwbjamkjdrsszqe";
const SITE = "https://coruscating-bunny-42b64d.netlify.app";
const SUPABASE = join(ROOT, "node_modules", ".bin", "supabase");

function loadEnv() {
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    out[t.slice(0, i)] = t.slice(i + 1).replace(/^["']|["']$/g, "");
  }
  return out;
}

function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const envFile = loadEnv();
const cliEnv = {
  ...process.env,
  ...(envFile.SUPABASE_ACCESS_TOKEN
    ? { SUPABASE_ACCESS_TOKEN: envFile.SUPABASE_ACCESS_TOKEN }
    : {}),
};

if (!cliEnv.SUPABASE_ACCESS_TOKEN) {
  console.error(
    "Supabase CLI needs auth. Run `npx supabase login` in your terminal, or add\n" +
      "SUPABASE_ACCESS_TOKEN=... to .env (from https://supabase.com/dashboard/account/tokens)\n"
  );
  process.exit(1);
}

run(SUPABASE, ["link", "--project-ref", PROJECT_REF], cliEnv);

const secrets = [`ALLOWED_ORIGINS=${SITE}`];
if (envFile.ANTHROPIC_API_KEY) secrets.push(`ANTHROPIC_API_KEY=${envFile.ANTHROPIC_API_KEY}`);
else console.warn("⚠ ANTHROPIC_API_KEY missing from .env — brief will return 503.");

run(SUPABASE, ["secrets", "set", ...secrets], cliEnv);
run(SUPABASE, ["functions", "deploy", "brief"], cliEnv);
run(SUPABASE, ["functions", "deploy", "ocean", "--no-verify-jwt"], cliEnv);
console.log("\n✓ Secrets set; edge functions deployed (brief + ocean)");
