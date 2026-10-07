#!/usr/bin/env node
/**
 * Native Stripe Manage Billing must open a URL via Capacitor Browser (iOS
 * fullscreen, not popover) and fall back to App.openUrl if Browser fails.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "bw-capacitor.js"), "utf8");

async function loadCapacitor(plugins, platform = "ios") {
  const document = {
    documentElement: { classList: { add() {} } },
    readyState: "complete",
    addEventListener() {},
  };
  const window = {
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      Plugins: plugins,
    },
    document,
    location: { href: "" },
    openCalls: [],
    open(url) { this.openCalls.push(url); return true; },
    console,
  };
  window.window = window;
  vm.runInNewContext(src, { window, document, console });
  return window;
}

{
  const opens = [];
  const window = await loadCapacitor({
    Browser: { open: async (opts) => { opens.push(opts); } },
  }, "ios");
  await window.BW_CAPACITOR.openExternalUrl("https://billing.stripe.com/p/session/test");
  assert.equal(opens.length, 1);
  assert.equal(opens[0].url, "https://billing.stripe.com/p/session/test");
  assert.equal(opens[0].presentationStyle, "fullscreen");
}

{
  const opens = [];
  const window = await loadCapacitor({
    Browser: { open: async (opts) => { opens.push(opts); } },
  }, "android");
  await window.BW_CAPACITOR.openExternalUrl("https://billing.stripe.com/p/session/test");
  assert.equal(opens[0].presentationStyle, "popover");
}

{
  const appOpens = [];
  const window = await loadCapacitor({
    Browser: { open: async () => { throw new Error("popover failed"); } },
    App: { openUrl: async (opts) => { appOpens.push(opts.url); } },
  }, "ios");
  await window.BW_CAPACITOR.openExternalUrl("https://billing.stripe.com/p/session/test");
  assert.deepEqual(appOpens, ["https://billing.stripe.com/p/session/test"]);
}

console.log("ios-stripe-portal-open.test.mjs: ok");
