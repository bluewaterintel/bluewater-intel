#!/usr/bin/env node
/**
 * Deploy Stripe billing edge functions (checkout, portal, webhook, sync).
 * Requires SUPABASE_ACCESS_TOKEN in .env or env (from Supabase dashboard → Account → Tokens).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_REF = "mealpzwbjamkjdrsszqe";
const SUPABASE = join(ROOT, "node_modules", ".bin", "supabase");

function loadEnv() {
  if (!existsSync(join(ROOT, ".env"))) return {};
  const out = {};
  for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
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
    "Missing SUPABASE_ACCESS_TOKEN. Add to .env or run `npx supabase login`.\n" +
      "https://supabase.com/dashboard/account/tokens\n"
  );
  process.exit(1);
}

run(SUPABASE, ["link", "--project-ref", PROJECT_REF], cliEnv);
run(SUPABASE, ["functions", "deploy", "stripe-checkout", "--no-verify-jwt"], cliEnv);
run(SUPABASE, ["functions", "deploy", "stripe-portal", "--no-verify-jwt"], cliEnv);
run(SUPABASE, ["functions", "deploy", "stripe-webhook", "--no-verify-jwt"], cliEnv);
run(SUPABASE, ["functions", "deploy", "stripe-sync"], cliEnv);
run(SUPABASE, ["functions", "deploy", "admin", "--no-verify-jwt"], cliEnv);

console.log("\n✓ Stripe functions deployed (checkout, portal, webhook, sync, admin)");
console.log("Verify Stripe Dashboard → Webhooks points to:");
console.log(`  https://${PROJECT_REF}.supabase.co/functions/v1/stripe-webhook`);
