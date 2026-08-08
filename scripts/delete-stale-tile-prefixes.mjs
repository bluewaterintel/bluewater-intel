#!/usr/bin/env node
/**
 * Remove superseded tile prefixes from Supabase Storage (chart-tiles bucket).
 * The live app reads contours/v2 only — chart/, chart/v1/, and contours/v1/
 * are dead weight once v2 is deployed.
 *
 * Usage:
 *   node scripts/delete-stale-tile-prefixes.mjs --dry-run
 *   node scripts/delete-stale-tile-prefixes.mjs
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ACCESS_TOKEN)
 * in .env at the project root.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const BUCKET = "chart-tiles";
const DRY_RUN = process.argv.includes("--dry-run");
/** Prefixes the client no longer reads (live: contours/v2). */
const STALE_PREFIXES = ["chart", "contours/v1"];

function loadEnv() {
  const env = { ...process.env };
  if (!existsSync(envPath)) return env;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

async function listAll(supabase, prefix) {
  const out = [];
  const queue = [prefix.replace(/\/$/, "")];
  while (queue.length) {
    const path = queue.shift();
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(BUCKET).list(path, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`list ${path}: ${error.message}`);
      if (!data?.length) break;
      for (const item of data) {
        const full = path ? `${path}/${item.name}` : item.name;
        if (item.id) out.push(full);
        else queue.push(full);
      }
      if (data.length < 1000) break;
      offset += data.length;
    }
  }
  return out;
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
  }

  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });

  const toDelete = [];
  for (const prefix of STALE_PREFIXES) {
    const files = await listAll(supabase, prefix);
    console.log(`  ${prefix}/ → ${files.length} objects`);
    toDelete.push(...files);
  }

  console.log(`Total stale objects: ${toDelete.length} (keeping contours/v2/)`);
  if (!toDelete.length) {
    console.log("Nothing to delete.");
    return;
  }

  if (DRY_RUN) {
    console.log("Dry run — first 15 paths:");
    toDelete.slice(0, 15).forEach((p) => console.log(" ", p));
    return;
  }

  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 100) {
    const batch = toDelete.slice(i, i + 100);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) throw new Error(`remove batch: ${error.message}`);
    deleted += batch.length;
    if (deleted % 1000 === 0 || deleted === toDelete.length) {
      console.log(`  deleted ${deleted}/${toDelete.length}`);
    }
  }

  console.log(`Done — removed ${deleted} stale tile objects.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
