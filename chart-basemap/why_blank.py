#!/usr/bin/env python3
"""For blank served tiles, report what the source grid says should be there."""
import argparse
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_tiles import (  # noqa: E402
    load_grid, tile_bounds_merc, merc_to_lon, merc_to_lat, lonlat_to_merc,
    contour_levels_for_zoom, M_PER_FATHOM,
)

SERVED = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tiles_overlay")


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nc", default="etopo_conus.nc")
    ap.add_argument("--bbox", required=True)
    ap.add_argument("--z", type=int, required=True)
    ap.add_argument("--limit", type=int, default=12)
    args = ap.parse_args()

    lon, lat, depth = load_grid(args.nc)
    dlon = float(np.median(np.diff(lon)))
    dlat = float(np.median(np.diff(lat)))
    print(f"grid {depth.shape}  spacing {dlon:.4f}deg lon, {dlat:.4f}deg lat "
          f"(~{dlon * 111 * 0.82:.2f} km lon at 35N, {dlat * 111:.2f} km lat)")

    w, s, e, n = [float(v) for v in args.bbox.split(",")]
    x0, y0 = lonlat_to_tile(w, n, args.z)
    x1, y1 = lonlat_to_tile(e, s, args.z)
    z = args.z
    minor, mid, major = contour_levels_for_zoom(z)
    allv = sorted(set(minor) | set(mid) | set(major))

    shown = 0
    stats = {"blank_with_levels": 0, "blank_no_levels": 0, "tiny_window": 0}
    for xt in range(x0, x1 + 1):
        for yt in range(y0, y1 + 1):
            p = os.path.join(SERVED, str(z), str(xt), f"{yt}.png")
            if not os.path.exists(p) or has_ink(p):
                continue
            bx0, by0, bx1, by1 = tile_bounds_merc(z, xt, yt)
            pad = (bx1 - bx0) * 0.30
            lo_lon, hi_lon = merc_to_lon(bx0 - pad), merc_to_lon(bx1 + pad)
            lo_lat, hi_lat = merc_to_lat(by0 - pad), merc_to_lat(by1 + pad)
            ji = np.searchsorted(lon, [lo_lon, hi_lon])
            ii = np.searchsorted(lat, [lo_lat, hi_lat])
            j0, j1 = max(ji[0] - 2, 0), min(ji[1] + 2, len(lon))
            i0, i1 = max(ii[0] - 2, 0), min(ii[1] + 2, len(lat))
            sub = depth[i0:i1, j0:j1]
            win = (i1 - i0, j1 - j0)
            dfm = np.where(sub < 0, -sub / M_PER_FATHOM, np.nan)
            water = dfm[~np.isnan(dfm)]
            if water.size == 0:
                continue
            dlo, dhi = float(np.nanmin(water)), float(np.nanmax(water))
            spanned = [v for v in allv if dlo <= v <= dhi]
            if win[0] < 6 or win[1] < 6:
                stats["tiny_window"] += 1
            if spanned:
                stats["blank_with_levels"] += 1
            else:
                stats["blank_no_levels"] += 1
            if shown < args.limit:
                clon = (lo_lon + hi_lon) / 2
                clat = (lo_lat + hi_lat) / 2
                print(f"  {z}/{xt}/{yt}  lon {clon:8.3f} lat {clat:7.3f}  "
                      f"window {win[0]}x{win[1]}  depth {dlo:7.1f}..{dhi:7.1f} fm  "
                      f"levels crossed: {spanned}")
                shown += 1

    print("\nblank tiles in bbox:")
    for k, v in stats.items():
        print(f"  {k:20} {v}")


if __name__ == "__main__":
    main()
