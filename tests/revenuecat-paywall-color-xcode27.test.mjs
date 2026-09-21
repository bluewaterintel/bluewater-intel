import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isPaywallColorXcode27Safe,
  patchPaywallColorSource,
} from "../scripts/revenuecat-paywall-color-xcode27.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = join(root, "tests/fixtures/PaywallColor-5.51.1.swift");

const broken = readFileSync(fixture, "utf8");
assert.equal(isPaywallColorXcode27Safe(broken), false, "5.51.1 fixture should need patch");

const { src: patched, changed, error } = patchPaywallColorSource(broken);
assert.equal(error, undefined);
assert.equal(changed, true);
assert.equal(isPaywallColorXcode27Safe(patched), true);

const again = patchPaywallColorSource(patched);
assert.equal(again.changed, false);
assert.equal(isPaywallColorXcode27Safe(again.src), true);

console.log("revenuecat-paywall-color-xcode27.test.mjs OK");
