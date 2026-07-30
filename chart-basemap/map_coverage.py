#!/usr/bin/env python3
"""Print a coverage map of the served tileset over a bbox.

  #  tile has ink
  :  tile exists but draws nothing
  .  no tile at all

Rows are tile Y (north to south), columns tile X (west to east), so the output
is oriented like the map. Reveals missing rows/columns at a glance.
"""
import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
SETS = {
    "served": HERE / "tiles_overlay",
    "fill": HERE / "bluetopo_work" / "etopo_fill",
}


def has_ink(p):
    try:
        a = np.asarray(Image.open(p).convert("RGBA"))[:, :, 3]
    except Exception:
        return None
    return int((a > 24).sum())


def lonlat_to_tile(lon, lat, z):
    n = 2.0 ** z
    return (int((lon + 180.0) / 360.0 * n),
            int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n))


def tile_to_lonlat(z, x, y):
    n = 2.0 ** z
    return (x / n * 360.0 - 180.0,
            math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n)))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", required=True, help="w,s,e,n")
    ap.add_argument("--z", type=int, required=True)
    ap.add_argument("--set", default="served", choices=list(SETS))
    args = ap.parse_args()

    root = SETS[args.set]
    w, s, e, n = [float(v) for v in args.bbox.split(",")]
    x0, y0 = lonlat_to_tile(w, n, args.z)
    x1, y1 = lonlat_to_tile(e, s, args.z)

    print(f"{args.set} z{args.z}  x {x0}..{x1}  y {y0}..{y1}")
    print(f"  NW corner lon/lat {tile_to_lonlat(args.z, x0, y0)}")
    header = "".join(str(x % 10) for x in range(x0, x1 + 1))
    print(f"        {header}")
    counts = {"#": 0, ":": 0, ".": 0}
    for y in range(y0, y1 + 1):
        row = ""
        for x in range(x0, x1 + 1):
            p = root / str(args.z) / str(x) / f"{y}.png"
            if not p.exists():
                ch = "."
            else:
                ch = "#" if (has_ink(p) or 0) > 0 else ":"
            counts[ch] += 1
            row += ch
        print(f"  {y:6d}  {row}")
    total = sum(counts.values())
    print(f"\n  ink {counts['#']}  blank {counts[':']}  absent {counts['.']}  "
          f"of {total}")


if __name__ == "__main__":
    main()
