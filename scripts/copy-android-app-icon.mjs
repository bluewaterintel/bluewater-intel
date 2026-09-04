#!/usr/bin/env node
/**
 * Generate Android launcher icons + splash from icons/app-icon-1024.png.
 * Usage: npm run android:icon
 *
 * Android launcher icons are a full-bleed teal square (art to the corners of
 * the 108dp canvas, like Chrome) with the marlin in the circular safe zone.
 * That is intentionally a bit different from the iOS rounded-rect tile: Pixel’s
 * dock only skips the light halo when the adaptive layers occupy that outer band.
 * The icon is a drawable adaptive-icon (Chrome’s packaging), not a mipmap PNG.
 *
 * Splash: copies the iOS navy splash into drawable/splash.png and writes
 * splash_icon.png for Android 12+'s system splash.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "icons", "app-icon-1024.png");
const res = join(root, "android/app/src/main/res");
const padSwift = join(root, "scripts/android-pad-icon.swift");
const iosSplash = join(
  root,
  "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png"
);

const LAUNCHER = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

const FOREGROUND = {
  "drawable-mdpi": 108,
  "drawable-hdpi": 162,
  "drawable-xhdpi": 216,
  "drawable-xxhdpi": 324,
  "drawable-xxxhdpi": 432,
};

function requireSrc() {
  if (!existsSync(src)) {
    console.error(`
Missing: icons/app-icon-1024.png

Create a 1024×1024 PNG (no transparency) and save it at:
  ${src}

Then run: npm run android:icon
`);
    process.exit(1);
  }
  if (statSync(src).size < 5000) {
    console.warn("Warning: file is very small — confirm it is 1024×1024 PNG.");
  }
}

function sampleTeal(from) {
  const py = `
import struct, zlib, sys
from pathlib import Path
data = Path(sys.argv[1]).read_bytes()
off = 8
idat = b""
w = h = ct = None
while off < len(data):
    n = struct.unpack(">I", data[off:off+4])[0]
    typ = data[off+4:off+8]
    chunk = data[off+8:off+8+n]
    if typ == b"IHDR":
        w, h, bit, ct, *_ = struct.unpack(">IIBBBBB", chunk)
    elif typ == b"IDAT":
        idat += chunk
    elif typ == b"IEND":
        break
    off += 12 + n
raw = zlib.decompress(idat)
bpp = 3 if ct == 2 else 4
stride = w * bpp
f = raw[0]
row = bytearray(raw[1:1+stride])
if f == 1:
    for x in range(stride):
        row[x] = (row[x] + (row[x-bpp] if x >= bpp else 0)) & 255
elif f not in (0,):
    raise SystemExit("filtered first row")
print("#%02X%02X%02X %d %d %d" % (row[0], row[1], row[2], row[0], row[1], row[2]))
`;
  const line = execFileSync("python3", ["-c", py, from], { encoding: "utf8" }).trim();
  const m = line.match(/^(#[0-9A-Fa-f]{6})\s+(\d+)\s+(\d+)\s+(\d+)$/);
  if (!m) {
    console.error("Could not sample icon background color:", line);
    process.exit(1);
  }
  return { hex: m[1].toUpperCase(), rgb: [m[2], m[3], m[4]] };
}

function sipsResize(from, size, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  execFileSync("sips", ["-z", String(size), String(size), from, "--out", dest], {
    stdio: "pipe",
  });
}

function writeBackgroundColor(hex) {
  writeFileSync(
    join(res, "values/ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${hex}</color>
</resources>
`
  );
  writeFileSync(
    join(res, "drawable/ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:pathData="M0,0h108v108h-108z"
        android:fillColor="${hex}" />
</vector>
`
  );
}

function writeAdaptiveXml() {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
`;
  mkdirSync(join(res, "drawable-anydpi-v26"), { recursive: true });
  writeFileSync(join(res, "drawable-anydpi-v26/ic_launcher.xml"), xml);
  writeFileSync(join(res, "drawable-anydpi-v26/ic_launcher_round.xml"), xml);
  mkdirSync(join(res, "mipmap-anydpi-v26"), { recursive: true });
  writeFileSync(join(res, "mipmap-anydpi-v26/ic_launcher.xml"), xml);
  writeFileSync(join(res, "mipmap-anydpi-v26/ic_launcher_round.xml"), xml);
}

function copySplash() {
  if (!existsSync(iosSplash)) {
    console.warn("iOS splash PNG not found — leaving Android splash as-is.");
    return;
  }
  const splashDest = join(res, "drawable/splash.png");
  mkdirSync(dirname(splashDest), { recursive: true });
  copyFileSync(iosSplash, splashDest);

  const densitySplashDirs = [
    "drawable-land-mdpi",
    "drawable-land-hdpi",
    "drawable-land-xhdpi",
    "drawable-land-xxhdpi",
    "drawable-land-xxxhdpi",
    "drawable-port-mdpi",
    "drawable-port-hdpi",
    "drawable-port-xhdpi",
    "drawable-port-xxhdpi",
    "drawable-port-xxxhdpi",
  ];
  for (const dir of densitySplashDirs) {
    const p = join(res, dir, "splash.png");
    if (existsSync(p)) rmSync(p);
  }
  console.log("Splash installed → android/app/src/main/res/drawable/splash.png");
}

requireSrc();
const teal = sampleTeal(src);
console.log(`Adaptive-icon background ${teal.hex} (sampled from icon corners)`);

mkdirSync(join(res, "drawable"), { recursive: true });
mkdirSync(join(res, "drawable-nodpi"), { recursive: true });

const punched = join(res, "drawable-nodpi/ic_launcher_marlin_src.png");
execFileSync(
  "swift",
  [padSwift, "--punch", src, punched, ...teal.rgb, "48"],
  { stdio: "inherit" },
);

const tile = join(res, "drawable-nodpi/icon_fill_src.png");
const composePy = join(root, "scripts/android-compose-icon.py");
// 0.56 keeps the bill inside Pixel's circular crop of the 108dp tile.
execFileSync(
  "python3",
  [composePy, punched, tile, ...teal.rgb, "0.56"],
  { stdio: "inherit" },
);
console.log("Opaque full-bleed teal+marlin tile → drawable-nodpi/icon_fill_src.png");

for (const [folder, size] of Object.entries(FOREGROUND)) {
  const dest = join(res, folder, "ic_launcher_foreground.png");
  mkdirSync(dirname(dest), { recursive: true });
  execFileSync("python3", [composePy, "--resize", tile, dest, String(size)], {
    stdio: "inherit",
  });
}

for (const [folder, size] of Object.entries(LAUNCHER)) {
  const dir = join(res, folder);
  // Unversioned mipmap PNGs: Pixel home can load them instead of the adaptive
  // XML and wrap them in a lightened plate. v23 folders cover API 23–25;
  // anydpi-v26 XML wins on 26+.
  const v23 = join(res, `${folder}-v23`);
  sipsResize(tile, size, join(v23, "ic_launcher.png"));
  sipsResize(tile, size, join(v23, "ic_launcher_round.png"));
  for (const name of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png", "ic_launcher_background.png"]) {
    const p = join(dir, name);
    if (existsSync(p)) rmSync(p);
  }
}
writeBackgroundColor(teal.hex);
writeAdaptiveXml();
copySplash();
copyFileSync(tile, join(res, "drawable/splash_icon.png"));

console.log("Android launcher icons installed → android/app/src/main/res/mipmap-*/");
console.log("Next: uninstall the app on the emulator, then Run in Android Studio.");
