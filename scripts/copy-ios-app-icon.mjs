#!/usr/bin/env node
/**
 * Copy icons/app-icon-1024.png → Xcode AppIcon asset.
 * Usage: npm run ios:icon
 *
 * Splash assets are NOT generated here. iOS draws the launch image with
 * scaleAspectFill, so a tall phone crops a 2732 square to roughly the middle
 * 46% of its width — a full-bleed icon comes out zoomed and clipped. The
 * Splash.imageset PNGs are pre-built with the marlin sized to stay inside that
 * safe band; see icons/README-app-icon.md before regenerating them.
 */
import { copyFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "icons", "app-icon-1024.png");
const iconDest = join(
  root,
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
);

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
console.log("Next: npm run cap:sync  then Clean + Run in Xcode.");
