#!/usr/bin/env node
/**
 * Delete chart basemap tiles from Supabase Storage (chart/v1/ and stray paths).
 * Keeps contours/v1/ and the chart-tiles bucket.
 *
 * Usage: node scripts/delete-chart-basemap-tiles.mjs [--dry-run]
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const BUCKET = "chart-tiles";
const PROJECT_REF = "mealpzwbjamkjdrsszqe";
const DRY_RUN = process.argv.includes("--dry-run");

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
  const url = env.SUPABASE_URL;
  const accessToken = env.SUPABASE_ACCESS_TOKEN;
  if (!url || !accessToken) {
    console.error("Missing SUPABASE_URL or SUPABASE_ACCESS_TOKEN in .env");
    process.exit(1);
  }

  const serviceRole = await fetchServiceRoleKey(accessToken);
  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });

  const prefixes = ["chart"];
  const toDelete = [];
  for (const prefix of prefixes) {
    const files = await listAll(supabase, prefix);
    toDelete.push(...files);
  }

  console.log(`Found ${toDelete.length} objects under chart/ in ${BUCKET}`);
  if (!toDelete.length) {
    console.log("Nothing to delete.");
    return;
  }

  if (DRY_RUN) {
    console.log("Dry run — first 10 paths:");
    toDelete.slice(0, 10).forEach((p) => console.log(" ", p));
    return;
  }

  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 100) {
    const batch = toDelete.slice(i, i + 100);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) throw new Error(`remove batch: ${error.message}`);
    deleted += batch.length;
    if (deleted % 500 === 0 || deleted === toDelete.length) {
      console.log(`  deleted ${deleted}/${toDelete.length}`);
    }
  }

  console.log(`Done — removed ${deleted} chart basemap objects. contours/v1/ unchanged.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
