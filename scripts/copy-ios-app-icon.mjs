#!/usr/bin/env node
/**
 * Copy icons/app-icon-1024.png → Xcode AppIcon + Splash assets.
 * Usage: npm run ios:icon
 */
import { copyFileSync, existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "icons", "app-icon-1024.png");
const iconDest = join(
  root,
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
);
const splashDir = join(root, "ios/App/App/Assets.xcassets/Splash.imageset");
const splashNames = [
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png",
];

if (!existsSync(src)) {
  console.error(`
Missing: icons/app-icon-1024.png

Create a 1024×1024 PNG (no transparency) and save it at:
  ${src}

Then run: npm run ios:icon
`);
  process.exit(1);
}

const size = statSync(src).size;
if (size < 5000) {
  console.warn("Warning: file is very small — confirm it is 1024×1024 PNG.");
}

copyFileSync(src, iconDest);
console.log("App icon installed → ios/App/App/Assets.xcassets/AppIcon.appiconset/");

for (const name of splashNames) {
  const dest = join(splashDir, name);
  execSync(`sips -z 2732 2732 "${src}" --out "${dest}"`, { stdio: "inherit" });
}
console.log("Launch splash installed → ios/App/App/Assets.xcassets/Splash.imageset/");
console.log("Next: npm run cap:sync  then Clean + Run in Xcode.");
