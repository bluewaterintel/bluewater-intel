#!/usr/bin/env node
/**
 * Delete the tiles named in a manifest from Supabase Storage.
 *
 * A render can stop producing a tile it used to produce — a coarser contour
 * ladder draws nothing where a finer one drew a line. Leaving the old object
 * published would keep serving contours that no longer exist at that zoom, so
 * those keys have to be removed rather than overwritten.
 *
 * Usage:
 *   node scripts/delete-tiles-manifest.mjs --prefix contours/v2 \
 *        --manifest chart-basemap/delete_manifest.txt [--dry-run]
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "chart-tiles";
const PROJECT_REF = "mealpzwbjamkjdrsszqe";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const DRY_RUN = process.argv.includes("--dry-run");
const prefix = (arg("--prefix") || "").replace(/\/$/, "");
const manifestPath = arg("--manifest");

function loadEnv() {
  const env = { ...process.env };
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return env;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

async function fetchServiceRoleKey(accessToken) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`api-keys fetch failed: ${res.status} ${await res.text()}`);
  const keys = await res.json();
  const sr = keys.find((k) => k.name === "service_role");
  if (!sr?.api_key?.startsWith("eyJ")) throw new Error("No JWT service_role key");
  return sr.api_key;
}

async function main() {
  if (!prefix || !manifestPath) {
    console.error("Usage: --prefix contours/v2 --manifest <file> [--dry-run]");
    process.exit(1);
  }
  const env = loadEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_ACCESS_TOKEN) {
    console.error("Missing SUPABASE_URL or SUPABASE_ACCESS_TOKEN in .env");
    process.exit(1);
  }

  const keys = readFileSync(join(root, manifestPath), "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((rel) => `${prefix}/${rel}`);

  console.log(`${DRY_RUN ? "Would delete" : "Deleting"} ${keys.length} objects under ${BUCKET}/${prefix}/`);
  if (DRY_RUN) {
    keys.slice(0, 10).forEach((k) => console.log("  ", k));
    return;
  }

  const serviceRole = await fetchServiceRoleKey(env.SUPABASE_ACCESS_TOKEN);
  const supabase = createClient(env.SUPABASE_URL, serviceRole, {
    auth: { persistSession: false },
  });

  let done = 0;
  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) throw new Error(`remove batch at ${i}: ${error.message}`);
    done += batch.length;
    if (done % 500 === 0 || done === keys.length) {
      console.log(`  deleted ${done}/${keys.length}`);
    }
  }

  // Keep the upload log honest: these keys are no longer published, so a later
  // audit comparing log to disk should not still count them.
  const logPath = join(root, ".upload-contours-v2.log");
  if (existsSync(logPath)) {
    const gone = new Set(keys.map((k) => k.slice(prefix.length + 1)));
    const kept = readFileSync(logPath, "utf8")
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s && !gone.has(s));
    writeFileSync(logPath, kept.map((s) => `${s}\n`).join(""));
  }

  console.log(`Done — removed ${done} objects.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
