#!/usr/bin/env node
/**
 * Stage the web app into www/ for Capacitor iOS packaging.
 * Copies only runtime assets — not backend, scripts, or dev tooling.
 */
import { cpSync, mkdirSync, rmSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const www = join(root, "www");

const COPY_FILES = [
  "index.html",
  "auth-gate.html",
  "manifest.json",
  "sw.js",
];

const COPY_GLOBS = [
  /^bw-.*\.js$/,
];

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

function main() {
  console.log("Building www/ for Capacitor iOS…");

  // Fresh staging dir
  if (existsSync(www)) rmSync(www, { recursive: true, force: true });
  mkdirSync(www, { recursive: true });

  // Native config (embeddedFallback: true for offshore offline use)
  execSync("node scripts/generate-bw-config.mjs --native --out www/bw-config.js", { cwd: root, stdio: "inherit" });

  for (const f of COPY_FILES) {
    cpSync(join(root, f), join(www, f));
  }

  for (const name of readdirSync(root)) {
    if (!COPY_GLOBS.some((re) => re.test(name))) continue;
    cpSync(join(root, name), join(www, name));
  }

  if (existsSync(join(root, "icons"))) {
    copyDir(join(root, "icons"), join(www, "icons"));
  }

  const count = readdirSync(www).filter((n) => statSync(join(www, n)).isFile()).length;
  console.log(`www/ ready — ${count} top-level files (+ icons/)`);
}

main();
