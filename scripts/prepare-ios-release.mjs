#!/usr/bin/env node
/**
 * One command before archiving in Xcode on a Mac:
 * - Apply native-version.json to iOS/Android project files
 * - Copy app icon, build www/, cap sync ios
 * - On macOS: run agvtool + xcodebuild -showBuildSettings to confirm Xcode will see the right version
 *
 * Usage: npm run ios:prepare
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadNativeVersion, applyNativeVersion } from "./apply-native-version.mjs";
import { verifyNativeVersion } from "./verify-native-version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iosAppDir = join(root, "ios/App");
const workspace = join(iosAppDir, "App.xcworkspace");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? root,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

function runCapture(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: opts.cwd ?? root,
    encoding: "utf8",
    env: process.env,
  });
}

const expected = loadNativeVersion();
console.log(`\n=== Bluewater Intel iOS prepare: ${expected.versionName} (${expected.versionCode}) ===\n`);

applyNativeVersion(expected);

let verify = verifyNativeVersion();
if (!verify.ok) {
  console.error("Version apply failed verification:");
  verify.errors.forEach((e) => console.error("  ", e));
  process.exit(1);
}

run("npm", ["run", "ios:icon"]);
run("npm", ["run", "build:ios"]);
run("npx", ["cap", "sync", "ios"]);

verify = verifyNativeVersion();
if (!verify.ok) {
  console.error("After cap sync, native versions no longer match native-version.json:");
  verify.errors.forEach((e) => console.error("  ", e));
  process.exit(1);
}

const isDarwin = process.platform === "darwin";
if (isDarwin && existsSync(workspace)) {
  console.log("\n--- macOS: syncing Xcode version with agvtool ---\n");
  run("xcrun", ["agvtool", "new-marketing-version", expected.versionName], { cwd: iosAppDir });
  run("xcrun", ["agvtool", "new-version", "-all", String(expected.versionCode)], { cwd: iosAppDir });

  verify = verifyNativeVersion();
  if (!verify.ok) {
    console.error("After agvtool, versions mismatch:");
    verify.errors.forEach((e) => console.error("  ", e));
    process.exit(1);
  }

  const settings = runCapture(
    "xcodebuild",
    [
      "-workspace",
      workspace,
      "-scheme",
      "App",
      "-configuration",
      "Release",
      "-showBuildSettings",
    ],
    { cwd: iosAppDir },
  );
  if (settings.status === 0) {
    const text = settings.stdout + settings.stderr;
    const marketing = text.match(/MARKETING_VERSION = (.+)/)?.[1]?.trim();
    const current = text.match(/CURRENT_PROJECT_VERSION = (.+)/)?.[1]?.trim();
    console.log("\n--- xcodebuild Release settings (what Archive uses) ---");
    console.log(`  MARKETING_VERSION = ${marketing ?? "?"}`);
    console.log(`  CURRENT_PROJECT_VERSION = ${current ?? "?"}`);
    if (marketing !== expected.versionName || current !== String(expected.versionCode)) {
      console.error("\nERROR: xcodebuild settings do not match native-version.json.");
      console.error("  Open ONLY this workspace:");
      console.error(`  ${workspace}`);
      process.exit(1);
    }
    console.log("\nOK: Xcode Release build settings match native-version.json.\n");
  } else {
    console.warn("Could not run xcodebuild -showBuildSettings (install Xcode command line tools).");
    console.warn("Versions in project.pbxproj were verified; open Xcode and confirm General tab.\n");
  }
} else if (!isDarwin) {
  console.log("\n(Linux/CI: skipped agvtool/xcodebuild; run `npm run ios:prepare` on your Mac before Archive.)\n");
}

console.log("Next steps on Mac:");
console.log(`  1. git pull && npm ci`);
console.log(`  2. npm run ios:prepare   # you can re-run anytime before archive`);
console.log(`  3. open "${workspace}"`);
console.log("  4. Product → Clean Build Folder, then Archive");
console.log(`\nCanonical version file: ${join(root, "native-version.json")}\n`);
