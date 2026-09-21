import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
assert.equal(
  (patched.match(/private init\(stringRepresentation: String, underlyingColor:/g) || []).length,
  1,
);

const again = patchPaywallColorSource(patched);
assert.equal(again.changed, false);
assert.equal(isPaywallColorXcode27Safe(again.src), true);

const rubyCheck = spawnSync("ruby", ["-v"], { encoding: "utf8" });
if (rubyCheck.status === 0) {
  const dir = mkdtempSync(join(tmpdir(), "rc-paywall-"));
  const dest = join(dir, "PaywallColor.swift");
  copyFileSync(fixture, dest);
  const r = spawnSync("ruby", [join(root, "ios/App/patch_revenuecat_paywall_color.rb"), dest], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const rb = readFileSync(dest, "utf8");
  assert.equal(isPaywallColorXcode27Safe(rb), true, "ruby patch must move designated init into struct");
  assert.equal(
    (rb.match(/private init\(stringRepresentation: String, underlyingColor:/g) || []).length,
    1,
  );
  console.log("ruby patch_revenuecat_paywall_color.rb OK");
} else {
  console.log("ruby not installed — skipped ruby patch test");
}

const podfile = readFileSync(join(root, "ios/App/Podfile"), "utf8");
assert.match(podfile, /patch_revenuecat_paywall_color_pod!/);
assert.match(podfile, /add_revenuecat_paywall_color_build_phase!/);

console.log("revenuecat-paywall-color-xcode27.test.mjs OK");
