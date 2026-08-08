#!/usr/bin/env node
/**
 * List merged cursor/* feature branches safe to delete from GitHub.
 * Does NOT delete anything — prints gh commands for review.
 *
 * Usage: node scripts/prune-remote-branches.mjs [--merged-into main]
 */
import { execSync } from "node:child_process";

const mergedInto = process.argv.includes("--merged-into")
  ? process.argv[process.argv.indexOf("--merged-into") + 1]
  : "main";

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

try {
  sh("git fetch origin --prune");
} catch {
  console.warn("git fetch failed — using cached remote refs");
}

const branches = sh("git branch -r")
  .split("\n")
  .map((b) => b.trim())
  .filter((b) => b.startsWith("origin/cursor/"));

let merged = [];
try {
  merged = sh(`git branch -r --merged origin/${mergedInto}`)
    .split("\n")
    .map((b) => b.trim().replace(/^origin\//, ""))
    .filter(Boolean);
} catch {
  console.error(`Could not list branches merged into ${mergedInto}`);
  process.exit(1);
}

const mergedSet = new Set(merged);
const stale = branches
  .map((b) => b.replace(/^origin\//, ""))
  .filter((b) => mergedSet.has(b));

console.log(`Remote cursor/* branches: ${branches.length}`);
console.log(`Merged into origin/${mergedInto} (candidates to delete): ${stale.length}\n`);

if (!stale.length) {
  console.log("Nothing to prune.");
  process.exit(0);
}

console.log("Review, then delete in batches (requires gh CLI + repo admin):\n");
for (let i = 0; i < stale.length; i += 20) {
  const batch = stale.slice(i, i + 20);
  console.log(`# batch ${Math.floor(i / 20) + 1}`);
  console.log(`gh api -X DELETE repos/:owner/:repo/git/refs/heads/${batch[0]} ...`);
  batch.forEach((b) => console.log(`gh api -X DELETE repos/bluewaterintel/bluewater-intel/git/refs/heads/${b}`));
  console.log();
}

console.log(`Or: git push origin ${stale.slice(0, 3).map((b) => `:refs/heads/${b}`).join(" ")} ...`);
