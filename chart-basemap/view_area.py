#!/usr/bin/env python3
"""Stitch the served tileset over a bbox, as the app would draw it."""
import argparse
import math
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
T = 256
BG = (13, 30, 48)


def lonlat_to_tile(lon, lat, z):
    n = 2.0 ** z
    return (int((lon + 180.0) / 360.0 * n),
            int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", required=True)
    ap.add_argument("--z", type=int, required=True)
    ap.add_argument("--src", default="tiles_overlay")
    ap.add_argument("--out", required=True)
    ap.add_argument("--grid", action="store_true", help="draw tile boundaries")
    args = ap.parse_args()

    root = HERE / args.src
    w, s, e, n = [float(v) for v in args.bbox.split(",")]
    x0, y0 = lonlat_to_tile(w, n, args.z)
    x1, y1 = lonlat_to_tile(e, s, args.z)
    nx, ny = x1 - x0 + 1, y1 - y0 + 1
    im = Image.new("RGB", (nx * T, ny * T), BG)
    have = 0
    for i, x in enumerate(range(x0, x1 + 1)):
        for j, y in enumerate(range(y0, y1 + 1)):
            p = root / str(args.z) / str(x) / f"{y}.png"
            if not p.exists():
                continue
            t = Image.open(p).convert("RGBA")
            im.paste(t, (i * T, j * T), t)
            have += 1
    if args.grid:
        px = im.load()
        for i in range(nx):
            for yy in range(im.height):
                px[i * T, yy] = (120, 60, 60)
        for j in range(ny):
            for xx in range(im.width):
                px[xx, j * T] = (120, 60, 60)
    im.save(args.out)
    print(f"z{args.z} {nx}x{ny} tiles ({have} present) -> {args.out}  "
          f"x {x0}..{x1}, y {y0}..{y1}")


if __name__ == "__main__":
    main()
