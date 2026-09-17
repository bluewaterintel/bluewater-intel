#!/usr/bin/env node
/**
 * Apply native-version.json to Android build.gradle and iOS project.pbxproj.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const versionPath = join(root, "native-version.json");

export function loadNativeVersion() {
  const raw = JSON.parse(readFileSync(versionPath, "utf8"));
  const versionName = String(raw.versionName ?? "").trim();
  const versionCode = parseInt(String(raw.versionCode), 10);
  if (!versionName || !Number.isFinite(versionCode) || versionCode < 1) {
    throw new Error(`Invalid ${versionPath}: need versionName and versionCode`);
  }
  return { versionName, versionCode };
}

export function applyNativeVersion({ versionName, versionCode }) {
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

  return { gradlePath, pbxPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const v = loadNativeVersion();
  applyNativeVersion(v);
  console.log(`Applied native version ${v.versionName} (${v.versionCode})`);
}
