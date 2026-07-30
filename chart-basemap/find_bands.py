#!/usr/bin/env python3
"""Look for rows or columns of tiles that are blank across a wide span.

Bathymetry does not produce straight full-width gaps, so a row or column that is
mostly blank while its neighbours carry ink is a build artifact.
"""
import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
SERVED = HERE / "tiles_overlay"


def has_ink(p):
    try:
        a = np.asarray(Image.open(p).convert("RGBA"))[:, :, 3]
    except Exception:
        return False
    return bool((a > 24).sum())


def lonlat_to_tile(lon, lat, z):
    n = 2.0 ** z
    return (int((lon + 180.0) / 360.0 * n),
            int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n))


def tile_lat(z, y):
    n = 2.0 ** z
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))


def tile_lon(z, x):
    return x / 2.0 ** z * 360.0 - 180.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", required=True)
    ap.add_argument("--zooms", default="10,11,12,13")
    args = ap.parse_args()
    w, s, e, n = [float(v) for v in args.bbox.split(",")]

    for z in [int(v) for v in args.zooms.split(",")]:
        x0, y0 = lonlat_to_tile(w, n, z)
        x1, y1 = lonlat_to_tile(e, s, z)
        grid = np.zeros((y1 - y0 + 1, x1 - x0 + 1), dtype=np.int8)  # 1 = ink
        for i, x in enumerate(range(x0, x1 + 1)):
            for j, y in enumerate(range(y0, y1 + 1)):
                p = SERVED / str(z) / str(x) / f"{y}.png"
                grid[j, i] = 1 if (p.exists() and has_ink(p)) else 0

        print(f"z{z}: {grid.shape[1]}x{grid.shape[0]} tiles, "
              f"{int(grid.sum())} with ink")
        # A suspicious row: neighbours above and below have much more ink.
        rows = grid.sum(axis=1)
        for j in range(1, len(rows) - 1):
            nb = (rows[j - 1] + rows[j + 1]) / 2.0
            if nb >= 6 and rows[j] < 0.34 * nb:
                print(f"    row y={y0 + j} (lat {tile_lat(z, y0 + j):.3f}): "
                      f"ink {rows[j]} vs neighbours ~{nb:.0f}")
        cols = grid.sum(axis=0)
        for i in range(1, len(cols) - 1):
            nb = (cols[i - 1] + cols[i + 1]) / 2.0
            if nb >= 6 and cols[i] < 0.34 * nb:
                print(f"    col x={x0 + i} (lon {tile_lon(z, x0 + i):.3f}): "
                      f"ink {cols[i]} vs neighbours ~{nb:.0f}")
        print()


if __name__ == "__main__":
    main()
