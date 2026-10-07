#!/usr/bin/env node
/**
 * Ensure every pod declared in ios/App/Podfile appears in Podfile.lock DEPENDENCIES.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const podfile = readFileSync(join(root, "ios/App/Podfile"), "utf8");
const lock = readFileSync(join(root, "ios/App/Podfile.lock"), "utf8");

const podNames = [...podfile.matchAll(/pod\s+'([^']+)'/g)].map((m) => m[1]);
const missing = podNames.filter((name) => !lock.includes(name));

if (missing.length) {
  console.error("Podfile declares pods missing from Podfile.lock:");
  missing.forEach((p) => console.error(`  - ${p}`));
  console.error("\nFix: cd ios/App && pod install && commit Podfile.lock");
  process.exit(1);
}

console.log(`OK: ${podNames.length} Podfile pods listed in Podfile.lock`);
