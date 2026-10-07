#!/usr/bin/env node
/**
 * Xcode 27 + RevenueCat < 5.78: PaywallColor.swift fails to compile.
 * Move private designated init into the struct body (matches purchases-ios 5.78+).
 */
import { chmodSync, existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { isPaywallColorXcode27Safe, patchPaywallColorSource } from "./revenuecat-paywall-color-xcode27.mjs";

function makeWritable(filePath) {
  if (process.platform === "darwin") {
    spawnSync("chflags", ["nouchg", filePath], { stdio: "ignore" });
  }
  try {
    const mode = lstatSync(filePath).isDirectory() ? 0o755 : 0o644;
    chmodSync(filePath, mode);
  } catch {
    // still try to write
  }
}

function writePaywallColor(filePath, contents) {
  makeWritable(dirname(filePath));
  makeWritable(filePath);
  try {
    writeFileSync(filePath, contents, "utf8");
  } catch (err) {
    if (err && err.code === "EACCES") {
      makeWritable(dirname(filePath));
      makeWritable(filePath);
      const tmp = join(tmpdir(), `PaywallColor-${process.pid}.swift`);
      writeFileSync(tmp, contents, "utf8");
      spawnSync("mv", [tmp, filePath], { stdio: "inherit" });
      return;
    }
    throw err;
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path =
  process.env.BW_PAYWALL_COLOR_PATH ??
  join(root, "ios/App/Pods/RevenueCat/Sources/Paywalls/PaywallColor.swift");

if (!existsSync(path)) {
  console.log("patch-revenuecat-paywall-color: skip (RevenueCat pod not installed)");
  process.exit(0);
}

const src = readFileSync(path, "utf8");

if (isPaywallColorXcode27Safe(src)) {
  console.log("patch-revenuecat-paywall-color: OK (PaywallColor already Xcode-27-safe)");
  process.exit(0);
}

const result = patchPaywallColorSource(src);
if (result.error) {
  console.error(`patch-revenuecat-paywall-color: ${result.error}`);
  process.exit(1);
}

if (result.changed) {
  writePaywallColor(path, result.src);
  console.log("patch-revenuecat-paywall-color: patched PaywallColor.swift for Xcode 27");
} else {
  console.log("patch-revenuecat-paywall-color: OK (PaywallColor already Xcode-27-safe)");
}
