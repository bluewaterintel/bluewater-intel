#!/usr/bin/env python3
"""Find served tiles that carry far less ink than the ETOPO fill tile for the
same spot.

The merge used `rsync --ignore-existing`, so a BlueTopo tile wins purely by
existing. Where BlueTopo survey data only partly covers a tile, that produces a
mostly-empty tile that also blocks the complete ETOPO tile from filling it.
"""
import argparse
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
SERVED = HERE / "tiles_overlay"
FILL = HERE / "bluetopo_work" / "etopo_fill"


def ink(path):
    """Count pixels that actually draw something (non-transparent)."""
    try:
        im = Image.open(path).convert("RGBA")
    except Exception:
        return None
    a = np.asarray(im)[:, :, 3]
    return int((a > 24).sum())


def lonlat_to_tile(lon, lat, z):
    n = 2.0 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(lat)
    y = int((1 - math.asinh(math.tan(lat_r)) / math.pi) / 2 * n)
    return x, y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", required=True, help="w,s,e,n")
    ap.add_argument("--zooms", default="11,12,13")
    ap.add_argument("--ratio", type=float, default=0.5,
                    help="flag when served ink < ratio * fill ink")
    ap.add_argument("--label", default="")
    args = ap.parse_args()

    w, s, e, n = [float(v) for v in args.bbox.split(",")]
    print(f"=== {args.label or args.bbox} ===")

    for z in [int(v) for v in args.zooms.split(",")]:
        x0, y0 = lonlat_to_tile(w, n, z)
        x1, y1 = lonlat_to_tile(e, s, z)
        total = missing = flagged = 0
        worst = []
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                rel = f"{z}/{x}/{y}.png"
                sp, fp = SERVED / rel, FILL / rel
                if not fp.exists():
                    continue          # ETOPO says no contour here — fine
                total += 1
                fi = ink(fp)
                if not sp.exists():
                    missing += 1
                    worst.append((0.0, rel, 0, fi))
                    continue
                si = ink(sp)
                if fi and si < args.ratio * fi:
                    flagged += 1
                    worst.append((si / fi, rel, si, fi))
        worst.sort()
        print(f"  z{z}: {total:5d} tiles with ETOPO coverage | "
              f"{missing:4d} missing | {flagged:4d} sparser than fill")
        for r, rel, si, fi in worst[:6]:
            print(f"        {rel:>18}  served ink {si:6d} vs fill {fi:6d}  ({r:.2f})")


if __name__ == "__main__":
    main()
