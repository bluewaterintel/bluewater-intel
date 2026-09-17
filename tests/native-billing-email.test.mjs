#!/usr/bin/env node
/**
 * Regression tests: native Stripe billing portal + native email confirm redirect.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const billing = readFileSync(join(root, "bw-billing.js"), "utf8");
const authgate = readFileSync(join(root, "bw-authgate.js"), "utf8");
const auth = readFileSync(join(root, "bw-auth.js"), "utf8");
const confirmedHtml = readFileSync(join(root, "email-confirmed.html"), "utf8");
const buildScript = readFileSync(join(root, "scripts/build-ios-www.mjs"), "utf8");

// Native Stripe subscribers should open stripe-portal, not show a dead-end toast.
assert.match(billing, /openStripeBillingPortal/);
assert.match(billing, /bwBillingSource\(p\) === "stripe"/);
assert.doesNotMatch(
  billing,
  /can't be canceled from the App Store or Google Play/,
  "removed misleading native Stripe toast-only path",
);

// Native manage label should read Manage Billing (actionable) on the Account page.
assert.match(billing, /if\(src === "stripe" && window\.BW_NATIVE\) return "Manage Billing"/);

// Menu plan card must not include a Manage Billing shortcut (Account page only).
const navPlanFn = billing.slice(billing.indexOf("window.renderNavPlan = async function"));
assert.match(navPlanFn, /View plans/);
assert.doesNotMatch(navPlanFn, /onclick="bwManageBilling\(\)"/);

// Native sign-in pulls RevenueCat → profiles when not already premium (mirrors web Stripe sync).
assert.match(authgate, /BW_NATIVE && window\.BW_IAP && window\.BW_IAP\.syncIapEntitlement/);

// Native signups redirect to email-confirmed.html (not web sign-in gate).
assert.match(auth, /email-confirmed\.html\?confirmed=1/);
assert.match(auth, /function emailConfirmRedirectUrl/);

// Fallback page opens the app and has no sign-in form.
assert.match(confirmedHtml, /com\.bluewaterintel\.app:\/\/\?confirmed=1/);
assert.doesNotMatch(confirmedHtml, /type="password"/);
assert.doesNotMatch(confirmedHtml, />Sign In</);
assert.match(confirmedHtml, /Open Bluewater Intel App/);

// Packaged into native www bundle.
assert.match(buildScript, /email-confirmed\.html/);

console.log("native-billing-email.test.mjs: ok");
