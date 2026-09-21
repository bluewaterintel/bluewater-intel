#!/usr/bin/env node
/**
 * CocoaPods post_install does not always persist iOS 15 on every target (Xcode 16+).
 * After every `pod install`, rewrite Pods project + xcconfig deployment targets to 15.0.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const podsRoot = process.env.BW_PATCH_PODS_ROOT ?? join(root, "ios/App/Pods");
const MIN = "15.0";

const DEPLOY_RE =
  /IPHONEOS_DEPLOYMENT_TARGET = ([0-9]+(?:\.[0-9]+)?);/g;

function patchFile(path) {
  let text = readFileSync(path, "utf8");
  let changed = false;
  const next = text.replace(DEPLOY_RE, (full, ver) => {
    if (parseFloat(ver) >= parseFloat(MIN)) return full;
    changed = true;
    return `IPHONEOS_DEPLOYMENT_TARGET = ${MIN};`;
  });
  if (changed) writeFileSync(path, next, "utf8");
  return changed;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (name.endsWith(".pbxproj") || name.endsWith(".xcconfig")) acc.push(p);
  }
  return acc;
}

try {
  statSync(podsRoot);
} catch {
  console.error("Missing ios/App/Pods — run: cd ios/App && pod install");
  process.exit(1);
}

const files = walk(podsRoot);
let patched = 0;
for (const f of files) {
  if (patchFile(f)) patched++;
}

console.log(`patch-pods-deployment-target: updated ${patched} file(s) under Pods/ → iOS ${MIN}`);
