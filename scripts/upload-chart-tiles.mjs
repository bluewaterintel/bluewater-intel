#!/usr/bin/env node
/**
 * Upload XYZ chart/contour tiles to Supabase Storage (chart-tiles bucket).
 * Uses Management API for a valid service_role JWT when .env key is stale.
 *
 * Retries each tile with backoff, keeps going past individual failures, and
 * records successes to .upload-<prefix>.log so an interrupted run resumes
 * instead of re-sending everything. Safe to re-run: uploads are upsert, and a
 * repeat run only retries what the log doesn't already list.
 *
 * Usage:
 *   node scripts/upload-chart-tiles.mjs --src chart-basemap/tiles_overlay --prefix contours/v2 --workers 32
 *
 * Pass --manifest <file> (one z/x/y.png per line) to re-send just those tiles.
 * Needed for repairs: the resume log lists every tile as already sent, so a
 * plain re-run would upload nothing.
 */
import {
  readFileSync, existsSync, readdirSync, statSync, createWriteStream,
} from "node:fs";
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
  let manifest = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--src") src = args[++i];
    else if (args[i] === "--prefix") prefix = args[++i];
    else if (args[i] === "--workers") workers = Number(args[++i]) || 16;
    else if (args[i] === "--manifest") manifest = args[++i];
  }
  if (!src) {
    console.error("Usage: node scripts/upload-chart-tiles.mjs --src <tiles-dir> [--prefix chart/v1] [--workers 16] [--manifest <file>]");
    process.exit(1);
  }
  return { src: resolve(src.replace(/^~/, process.env.HOME || "")), prefix, workers, manifest };
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

function readManifest(src, manifestPath) {
  const keys = readFileSync(manifestPath, "utf8").split("\n")
    .map((s) => s.trim()).filter(Boolean);
  const files = [];
  const absent = [];
  for (const key of keys) {
    const local = join(src, key);
    if (existsSync(local)) files.push({ local, key });
    else absent.push(key);
  }
  if (absent.length) {
    console.error(`${absent.length} manifest entries missing under ${src}, e.g. ${absent[0]}`);
    process.exit(1);
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

async function uploadOne(supabase, prefix, { local, key }, attempts = 5) {
  const storagePath = `${prefix}/${key}`;
  for (let attempt = 1; ; attempt++) {
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, readFileSync(local), {
      contentType: "image/png",
      // Seconds only. Supabase prepends "public, max-age=" itself, so passing a
      // full directive string yields "public, max-age=public, max-age=..." —
      // an unparseable header that can defeat caching entirely, and tile egress
      // is the dominant cost here. One year; tiles are versioned by prefix.
      cacheControl: "31536000",
      upsert: true,
    });
    if (!error) return null;
    if (attempt >= attempts) return `${storagePath}: ${error.message}`;
    // Transient 5xx / socket resets are routine across this many requests.
    await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1) + Math.random() * 250));
  }
}

/**
 * Pull from a shared queue with a fixed pool of workers. A lockstep
 * batch-and-await lets one slow file idle the whole batch, which costs hours
 * over hundreds of thousands of tiles.
 */
async function runPool(supabase, prefix, tiles, workers, onDone) {
  let next = 0;
  const failures = [];
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (true) {
        const i = next++;
        if (i >= tiles.length) return;
        const err = await uploadOne(supabase, prefix, tiles[i]);
        if (err) failures.push(err);
        else onDone(tiles[i].key);
      }
    })
  );
  return failures;
}

async function main() {
  const env = loadEnv();
  const { src, prefix, workers, manifest } = parseArgs();
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

  // Resume support: re-uploading a quarter-million tiles from zero because the
  // run died near the end is not acceptable. Every success is appended here,
  // and a restart skips whatever is already listed.
  const logPath = join(root, `.upload-${prefix.replace(/\//g, "-")}.log`);
  const uploaded = new Set(
    existsSync(logPath)
      ? readFileSync(logPath, "utf8").split("\n").filter(Boolean)
      : []
  );

  // A manifest names tiles whose content changed, so the resume log must not
  // filter them out — every one of them is already listed in it.
  let tiles;
  if (manifest) {
    tiles = readManifest(src, manifest);
    console.log(`Re-uploading ${tiles.length} tiles named in ${manifest} → ${BUCKET}/${prefix}/`);
  } else {
    tiles = gatherTiles(src).filter((t) => !uploaded.has(t.key));
    console.log(`Uploading ${tiles.length} tiles from ${src} → ${BUCKET}/${prefix}/`);
    if (uploaded.size) console.log(`  (resuming; ${uploaded.size} already uploaded)`);
  }
  if (!tiles.length) {
    console.log("Nothing to do.");
    return;
  }

  const serviceRole = await fetchServiceRoleKey(accessToken);
  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });

  // Log manifest runs too. A repair can create tiles that never existed, and
  // leaving those out makes the log stop matching what is actually published —
  // which reads as an upload gap when auditing later. Duplicate keys are
  // harmless; the log is read into a Set.
  const logStream = createWriteStream(logPath, { flags: "a" });
  let done = 0;
  const started = Date.now();
  const failures = await runPool(supabase, prefix, tiles, workers, (key) => {
    logStream.write(key + "\n");
    if (++done % 2000 === 0 || done === tiles.length) {
      const secs = (Date.now() - started) / 1000;
      const rate = done / secs;
      const eta = ((tiles.length - done) / rate / 60).toFixed(0);
      console.log(
        `  ${done}/${tiles.length}  ${rate.toFixed(0)}/s  ETA ${eta}m`
      );
    }
  });
  logStream.end();

  const base = `${url.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${prefix}`;
  console.log(`\nUploaded ${done} tiles at ${base}/{z}/{x}/{y}.png`);
  if (failures.length) {
    console.error(`\n${failures.length} tiles failed after retries:`);
    for (const f of failures.slice(0, 20)) console.error("  " + f);
    if (failures.length > 20) console.error(`  … and ${failures.length - 20} more`);
    console.error(`\nRe-run the same command to retry just these.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
