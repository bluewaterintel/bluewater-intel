#!/usr/bin/env node
/**
 * Ensure native-version.json matches Android and every iOS MARKETING_VERSION /
 * CURRENT_PROJECT_VERSION in project.pbxproj.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadNativeVersion } from "./apply-native-version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readIosVersions(pbxPath) {
  const pbx = readFileSync(pbxPath, "utf8");
  const marketing = [...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1].trim());
  const build = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => m[1].trim());
  return { marketing, build };
}

function readAndroidVersions(gradlePath) {
  const gradle = readFileSync(gradlePath, "utf8");
  const code = gradle.match(/versionCode\s+(\d+)/)?.[1];
  const name = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
  return { versionCode: code, versionName: name };
}

export function verifyNativeVersion() {
  const expected = loadNativeVersion();
  const pbxPath = join(root, "ios/App/App.xcodeproj/project.pbxproj");
  const gradlePath = join(root, "android/app/build.gradle");
  const ios = readIosVersions(pbxPath);
  const android = readAndroidVersions(gradlePath);

  const errors = [];

  const uniq = (arr) => [...new Set(arr)];
  const marketingUnique = uniq(ios.marketing);
  const buildUnique = uniq(ios.build);

  if (marketingUnique.length !== 1 || marketingUnique[0] !== expected.versionName) {
    errors.push(
      `iOS MARKETING_VERSION: expected ${expected.versionName}, found [${marketingUnique.join(", ")}]`,
    );
  }
  if (buildUnique.length !== 1 || buildUnique[0] !== String(expected.versionCode)) {
    errors.push(
      `iOS CURRENT_PROJECT_VERSION: expected ${expected.versionCode}, found [${buildUnique.join(", ")}]`,
    );
  }
  if (android.versionName !== expected.versionName) {
    errors.push(`Android versionName: expected ${expected.versionName}, found ${android.versionName}`);
  }
  if (android.versionCode !== String(expected.versionCode)) {
    errors.push(`Android versionCode: expected ${expected.versionCode}, found ${android.versionCode}`);
  }

  return { ok: errors.length === 0, expected, errors, ios, android };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = verifyNativeVersion();
  if (result.ok) {
    console.log(`OK: ${result.expected.versionName} (${result.expected.versionCode}) on iOS and Android`);
    process.exit(0);
  }
  for (const e of result.errors) console.error(e);
  process.exit(1);
}
