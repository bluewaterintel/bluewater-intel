#!/usr/bin/env node
/**
 * Set store version in native-version.json and apply to iOS/Android projects.
 *
 * Usage: node scripts/bump-native-version.mjs <versionName> <versionCode>
 * Example: node scripts/bump-native-version.mjs 1.5.2 73
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyNativeVersion } from "./apply-native-version.mjs";
import { verifyNativeVersion } from "./verify-native-version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [versionName, versionCodeRaw] = process.argv.slice(2);
const versionCode = parseInt(versionCodeRaw, 10);

if (!versionName || !Number.isFinite(versionCode) || versionCode < 1) {
  console.error("Usage: node scripts/bump-native-version.mjs <versionName> <versionCode>");
  console.error("Example: node scripts/bump-native-version.mjs 1.5.2 73");
  process.exit(1);
}

const versionPath = join(root, "native-version.json");
writeFileSync(
  versionPath,
  `${JSON.stringify({ versionName, versionCode }, null, 2)}\n`,
  "utf8",
);

applyNativeVersion({ versionName, versionCode });
const verify = verifyNativeVersion();
if (!verify.ok) {
  verify.errors.forEach((e) => console.error(e));
  process.exit(1);
}

console.log(`Native versions set: ${versionName} (${versionCode})`);
console.log("  native-version.json");
console.log("  android/app/build.gradle");
console.log("  ios/App/App.xcodeproj/project.pbxproj");
console.log("\nBefore App Store archive on Mac: npm run ios:prepare");
