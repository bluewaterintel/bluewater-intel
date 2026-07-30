#!/usr/bin/env python3
"""Draw one pixel per tile so coverage gaps show up as shapes.

green  = tile has ink
yellow = tile exists but is blank
red    = no tile at all
blue   = ETOPO fill has no tile here either (nothing to fall back on)
"""
import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
SERVED = HERE / "tiles_overlay"
FILL = HERE / "bluetopo_work" / "etopo_fill"


def has_ink(p):
    try:
        a = np.asarray(Image.open(p).convert("RGBA"))[:, :, 3]
    except Exception:
        return False
    return bool((a > 24).sum())


def lonlat_to_tile(lon, lat, z):
    n = 2.0 ** z
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", required=True)
    ap.add_argument("--z", type=int, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--scale", type=int, default=6)
    args = ap.parse_args()

    w, s, e, n = [float(v) for v in args.bbox.split(",")]
    x0, y0 = lonlat_to_tile(w, n, args.z)
    x1, y1 = lonlat_to_tile(e, s, args.z)
    nx, ny = x1 - x0 + 1, y1 - y0 + 1

    counts = {"ink": 0, "blank": 0, "absent": 0, "nofill": 0}
    im = Image.new("RGB", (nx, ny))
    px = im.load()
    for i in range(nx):
        for j in range(ny):
            rel = f"{args.z}/{x0 + i}/{y0 + j}.png"
            sp, fp = SERVED / rel, FILL / rel
            if sp.exists():
                if has_ink(sp):
                    px[i, j] = (40, 170, 90); counts["ink"] += 1
                else:
                    px[i, j] = (225, 200, 60); counts["blank"] += 1
            elif fp.exists():
                px[i, j] = (215, 60, 60); counts["absent"] += 1
            else:
                px[i, j] = (60, 110, 215); counts["nofill"] += 1

    tot = nx * ny
    print(f"z{args.z}  {nx}x{ny} = {tot} tiles over {args.bbox}")
    for k, v in counts.items():
        print(f"  {k:7} {v:6d}  {100.0 * v / tot:5.1f}%")
    im.resize((nx * args.scale, ny * args.scale), Image.NEAREST).save(args.out)
    print(f"wrote {args.out}  (x {x0}..{x1}, y {y0}..{y1})")


if __name__ == "__main__":
    main()
