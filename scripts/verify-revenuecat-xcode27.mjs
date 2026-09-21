#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isPaywallColorXcode27Safe } from "./revenuecat-paywall-color-xcode27.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const paywall = join(root, "ios/App/Pods/RevenueCat/Sources/Paywalls/PaywallColor.swift");
const lock = join(root, "ios/App/Podfile.lock");

if (existsSync(paywall)) {
  const src = readFileSync(paywall, "utf8");
  if (isPaywallColorXcode27Safe(src)) {
    console.log("OK: RevenueCat PaywallColor is Xcode 27-safe");
    process.exit(0);
  }
  console.error(
    "PaywallColor.swift still broken for Xcode 27 — run: npm run ios:revenuecat:patch (after pod install)",
  );
  process.exit(1);
}

if (existsSync(lock)) {
  const m = readFileSync(lock, "utf8").match(/RevenueCat \((\d+\.\d+\.\d+)\)/);
  if (m) {
    const [major, minor] = m[1].split(".").map(Number);
    if (major > 5 || (major === 5 && minor >= 78)) {
      console.log(`OK: Podfile.lock RevenueCat ${m[1]} (no patch needed)`);
      process.exit(0);
    }
  }
}

console.error("RevenueCat pod missing or too old for Xcode 27 — run mac-store-prep or pod install + ios:revenuecat:patch");
process.exit(1);
