#!/usr/bin/env node
/**
 * Set iOS (MARKETING_VERSION / CURRENT_PROJECT_VERSION) and Android
 * (versionName / versionCode) for store submissions.
 *
 * Usage: node scripts/bump-native-version.mjs <versionName> <versionCode>
 * Example: node scripts/bump-native-version.mjs 1.5 68
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [versionName, versionCodeRaw] = process.argv.slice(2);
const versionCode = parseInt(versionCodeRaw, 10);

if (!versionName || !Number.isFinite(versionCode) || versionCode < 1) {
  console.error("Usage: node scripts/bump-native-version.mjs <versionName> <versionCode>");
  console.error("Example: node scripts/bump-native-version.mjs 1.5 68");
  process.exit(1);
}

const gradlePath = join(root, "android/app/build.gradle");
let gradle = readFileSync(gradlePath, "utf8");
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
writeFileSync(gradlePath, gradle);

const pbxPath = join(root, "ios/App/App.xcodeproj/project.pbxproj");
let pbx = readFileSync(pbxPath, "utf8");
pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${versionName};`);
pbx = pbx.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`);
writeFileSync(pbxPath, pbx);

console.log(`Native versions set: ${versionName} (${versionCode})`);
console.log("  android/app/build.gradle");
console.log("  ios/App/App.xcodeproj/project.pbxproj");
