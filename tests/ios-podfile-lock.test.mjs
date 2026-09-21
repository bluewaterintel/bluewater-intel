import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const podfile = readFileSync(join(root, "ios/App/Podfile"), "utf8");
const lock = readFileSync(join(root, "ios/App/Podfile.lock"), "utf8");
const iconJson = readFileSync(
  join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json"),
  "utf8",
);

const pods = [...podfile.matchAll(/pod\s+'([^']+)'/g)].map((m) => m[1]);
for (const name of pods) {
  assert.ok(lock.includes(name), `${name} missing from Podfile.lock`);
}

const catalog = JSON.parse(iconJson);
for (const image of catalog.images) {
  assert.ok(image.filename, "every AppIcon slot needs a filename");
  assert.equal(image.filename, "AppIcon-1024.png");
}

console.log("ios-podfile-lock.test.mjs OK");
