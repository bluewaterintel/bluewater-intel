#!/usr/bin/env node
/**
 * Stage the web app into www/ for Capacitor native packaging (iOS + Android).
 * Copies only runtime assets — not backend, scripts, or dev tooling.
 */
import { cpSync, mkdirSync, rmSync, readdirSync, statSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const www = join(root, "www");

const COPY_FILES = [
  "index.html",
  "auth-gate.html",
  "email-confirmed.html",
  "manifest.json",
  "sw.js",
  "terms.html",
  "privacy.html",
  "support.html",
];

const COPY_GLOBS = [
  /^bw-.*\.js$/,
];

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

function readAndroidVersionCode() {
  const gradlePath = join(root, "android/app/build.gradle");
  if (!existsSync(gradlePath)) return "0";
  const m = readFileSync(gradlePath, "utf8").match(/versionCode\s+(\d+)/);
  return m ? m[1] : "0";
}

/** Capacitor serves bundled JS from https://localhost — WebView may cache JS across store updates. */
function patchNativeCacheBust(wwwDir, buildCode) {
  const indexPath = join(wwwDir, "index.html");
  if (!existsSync(indexPath) || !buildCode || buildCode === "0") return;
  const q = `?v=b${buildCode}`;
  let html = readFileSync(indexPath, "utf8");
  html = html.replace(/src="(bw-[^"?]+\.js)(?:\?[^"]*)?"/g, `src="$1${q}"`);
  writeFileSync(indexPath, html);
  console.log(`Native cache bust → all bw-*.js scripts ${q}`);
}

function main() {
  console.log("Building www/ for Capacitor…");

  // Fresh staging dir
  if (existsSync(www)) rmSync(www, { recursive: true, force: true });
  mkdirSync(www, { recursive: true });

  // Native config (embeddedFallback: true for offshore offline use)
  execSync("node scripts/generate-bw-config.mjs --native --out www/bw-config.js", { cwd: root, stdio: "inherit" });
  execSync("node scripts/generate-legal-pages.mjs", { cwd: root, stdio: "inherit" });

  for (const f of COPY_FILES) {
    cpSync(join(root, f), join(www, f));
  }

  for (const name of readdirSync(root)) {
    // www/bw-config.js is generated above with --native (RevenueCat key); don't overwrite.
    if (name === "bw-config.js") continue;
    if (!COPY_GLOBS.some((re) => re.test(name))) continue;
    cpSync(join(root, name), join(www, name));
  }

  if (existsSync(join(root, "icons"))) {
    copyDir(join(root, "icons"), join(www, "icons"));
  }

  patchNativeCacheBust(www, readAndroidVersionCode());

  const count = readdirSync(www).filter((n) => statSync(join(www, n)).isFile()).length;
  console.log(`www/ ready — ${count} top-level files (+ icons/)`);
}

main();
