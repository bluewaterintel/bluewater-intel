#!/usr/bin/env node
/**
 * Verify Netlify build will succeed (used locally; mirrors CI build step).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("node", ["scripts/generate-bw-config.mjs"]);
if (!existsSync(join(root, "bw-config.js"))) {
  console.error("build failed: bw-config.js not generated");
  process.exit(1);
}
run("node", ["scripts/integrity-check.mjs"]);
console.log("Netlify build check passed");
