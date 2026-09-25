#!/usr/bin/env node
/**
 * Confirm Capacitor copied the current web app into ios/App/App/public.
 * Run after: npm run build:ios && npx cap copy ios
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "ios/App/App/public");
const species = join(pub, "bw-data-species.js");
const enc = join(pub, "bw-data-encyclopedia.js");
const index = join(pub, "index.html");

const errors = [];

function read(path, label) {
  if (!existsSync(path)) {
    errors.push(`${label} missing: ${path}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

const sp = read(species, "bw-data-species.js");
const en = read(enc, "bw-data-encyclopedia.js");
const ix = read(index, "index.html");

if (sp && !sp.includes('id:"halibut"')) {
  errors.push("ios/App/App/public/bw-data-species.js has no California halibut — run npm run build:ios && npx cap copy ios from repo root");
}
if (sp && !sp.includes('id:"whiteseabass"')) {
  errors.push("ios/App/App/public/bw-data-species.js has no white seabass");
}
if (en && !en.includes("California Halibut")) {
  errors.push("ios/App/App/public/bw-data-encyclopedia.js has no California Halibut entry");
}
if (en && !en.includes('id:"pacificbonito"')) {
  errors.push("ios/App/App/public/bw-data-encyclopedia.js has no Pacific Bonito entry");
}
const corePub = join(pub, "bw-core.js");
if (existsSync(corePub) && !read(corePub, "bw-core.js").includes("function speciesDisplayName")) {
  errors.push("ios/App/App/public/bw-core.js missing speciesDisplayName (Pacific Bonito labels)");
}
if (ix && !ix.includes("bw-core.js?v=20260925a")) {
  errors.push("ios/App/App/public/index.html is missing bw-core cache bust ?v=20260925a");
}
if (ix && !ix.includes("bw-data-species.js?v=20260924b")) {
  errors.push("ios/App/App/public/index.html is missing species cache bust ?v=20260924b (stale index.html in the iOS bundle)");
}

const rootSp = join(root, "bw-data-species.js");
if (existsSync(rootSp) && existsSync(species)) {
  const a = readFileSync(rootSp, "utf8");
  const b = sp;
  if (a.length > 0 && b.length > 0 && !b.includes('id:"halibut"') && a.includes('id:"halibut"')) {
    errors.push("repo root has halibut but ios/App/App/public does not — cap copy did not run or pointed at the wrong folder");
  }
}

if (errors.length) {
  console.error("iOS web bundle verification FAILED:\n");
  for (const e of errors) console.error("  • " + e);
  console.error("\nFrom repo root:\n  npm run build:ios\n  npx cap copy ios\n  node scripts/verify-ios-web-bundle.mjs\n");
  process.exit(1);
}

console.log("OK: ios/App/App/public includes California halibut, white seabass, and current index.html cache tags.");
