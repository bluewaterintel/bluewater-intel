#!/usr/bin/env node
/**
 * Upload XYZ chart/contour tiles to Supabase Storage (chart-tiles bucket).
 * Uses Management API for a valid service_role JWT when .env key is stale.
 *
 * Usage:
 *   node scripts/upload-chart-tiles.mjs --src ~/Downloads/bluewater-basemap-conus/tiles_conus --prefix chart/v1
 *   node scripts/upload-chart-tiles.mjs --src ~/Downloads/bluewater-basemap-conus/tiles_overlay --prefix contours/v1
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const BUCKET = "chart-tiles";
const PROJECT_REF = "mealpzwbjamkjdrsszqe";

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

function parseArgs() {
  const args = process.argv.slice(2);
  let src = null;
  let prefix = "chart/v1";
  let workers = 16;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--src") src = args[++i];
    else if (args[i] === "--prefix") prefix = args[++i];
    else if (args[i] === "--workers") workers = Number(args[++i]) || 16;
  }
  if (!src) {
    console.error("Usage: node scripts/upload-chart-tiles.mjs --src <tiles-dir> [--prefix chart/v1] [--workers 16]");
    process.exit(1);
  }
  return { src: resolve(src.replace(/^~/, process.env.HOME || "")), prefix, workers };
}

function gatherTiles(src) {
  const files = [];
  for (const z of readdirSync(src)) {
    const zp = join(src, z);
    if (!z.match(/^\d+$/) || !statSync(zp).isDirectory()) continue;
    for (const x of readdirSync(zp)) {
      const xp = join(zp, x);
      if (!statSync(xp).isDirectory()) continue;
      for (const f of readdirSync(xp)) {
        if (f.endsWith(".png")) files.push({ local: join(xp, f), key: `${z}/${x}/${f}` });
      }
    }
  }
  return files;
}

async function fetchServiceRoleKey(accessToken) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`api-keys fetch failed: ${res.status} ${await res.text()}`);
  const keys = await res.json();
  const sr = keys.find((k) => k.name === "service_role");
  if (!sr?.api_key?.startsWith("eyJ")) throw new Error("No JWT service_role key in Management API response");
  return sr.api_key;
}

async function uploadBatch(supabase, prefix, batch) {
  await Promise.all(
    batch.map(async ({ local, key }) => {
      const body = readFileSync(local);
      const storagePath = `${prefix}/${key}`;
      const { error } = await supabase.storage.from(BUCKET).upload(storagePath, body, {
        contentType: "image/png",
        cacheControl: "public, max-age=31536000, immutable",
        upsert: true,
      });
      if (error) throw new Error(`${storagePath}: ${error.message}`);
    })
  );
}

async function main() {
  const env = loadEnv();
  const { src, prefix, workers } = parseArgs();
  const url = env.SUPABASE_URL;
  const accessToken = env.SUPABASE_ACCESS_TOKEN;
  if (!url || !accessToken) {
    console.error("Missing SUPABASE_URL or SUPABASE_ACCESS_TOKEN in .env");
    process.exit(1);
  }
  if (!existsSync(src)) {
    console.error(`Source not found: ${src}`);
    process.exit(1);
  }

  const tiles = gatherTiles(src);
  console.log(`Uploading ${tiles.length} tiles from ${src} → ${BUCKET}/${prefix}/`);

  const serviceRole = await fetchServiceRoleKey(accessToken);
  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });

  let done = 0;
  const started = Date.now();
  for (let i = 0; i < tiles.length; i += workers) {
    const batch = tiles.slice(i, i + workers);
    await uploadBatch(supabase, prefix, batch);
    done += batch.length;
    if (done % 100 === 0 || done === tiles.length) {
      const elapsed = ((Date.now() - started) / 1000).toFixed(0);
      console.log(`  ${done}/${tiles.length} (${elapsed}s)`);
    }
  }

  const base = `${url.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${prefix}`;
  console.log(`\nDone — ${done} tiles at ${base}/{z}/{x}/{y}.png`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
