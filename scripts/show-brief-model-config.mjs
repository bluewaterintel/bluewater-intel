#!/usr/bin/env node
/**
 * Print where the Captain's Brief model is configured locally (does not call Supabase).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const deployDefault = "claude-sonnet-5-5";

function fromEnvFile() {
  if (!existsSync(envPath)) return null;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (t.startsWith("BRIEF_MODEL=")) {
      return t.slice("BRIEF_MODEL=".length).replace(/^["']|["']$/g, "").trim();
    }
  }
  return null;
}

const inFile = fromEnvFile();
const inShell = process.env.BRIEF_MODEL?.trim() || null;

console.log("Captain's Brief model (local config)\n");
console.log(`  .env file:     ${existsSync(envPath) ? envPath : "(missing — create from .env.example)"}`);
console.log(`  BRIEF_MODEL in .env: ${inFile ?? "(not set)"}`);
console.log(`  BRIEF_MODEL in shell: ${inShell ?? "(not set)"}`);
console.log("");
console.log(
  `  npm run deploy:functions will push: ${
    inFile || inShell || deployDefault
  }`,
);
console.log(
  `  (Uses .env first, then shell export, else ${deployDefault})`,
);
console.log("");
if (!inFile && !inShell) {
  console.log(
    "  → No BRIEF_MODEL in .env is OK. Your last deploy should have set Sonnet 5.5 on Supabase.",
  );
  console.log("  → To pin it in the repo, add this line to .env:");
  console.log(`     BRIEF_MODEL=${deployDefault}`);
}
