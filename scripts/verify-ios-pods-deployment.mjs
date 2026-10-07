#!/usr/bin/env node
/**
 * After `pod install`, Pods.xcodeproj must not pin IPHONEOS_DEPLOYMENT_TARGET to 14.x (Xcode 16+).
 * Skips when Pods/ is absent (Linux CI).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pbx = join(root, "ios/App/Pods/Pods.xcodeproj/project.pbxproj");

if (!existsSync(pbx)) {
  console.log("verify-ios-pods-deployment: skip (no Pods/ — run pod install on Mac)");
  process.exit(0);
}

const text = readFileSync(pbx, "utf8");
function findSub15(content) {
  return [...content.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([0-9]+(?:\.[0-9]+)?);/g)]
    .map((m) => m[1])
    .filter((v) => parseFloat(v) < 15);
}

const bad = findSub15(text);

const uniqueBad = [...new Set(bad)];
if (uniqueBad.length) {
  console.error("Pods project still has IPHONEOS_DEPLOYMENT_TARGET below 15.0:", uniqueBad.join(", "));
  console.error("Run: sh scripts/ios-reinstall-pods.sh");
  process.exit(1);
}

console.log("OK: Pods deployment targets are iOS 15.0+");
