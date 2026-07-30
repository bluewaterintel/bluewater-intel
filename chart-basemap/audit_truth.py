#!/usr/bin/env python3
"""Ground-truth audit: does the served tile draw what the bathymetry implies?

Earlier audits compared tiles against the ETOPO fill set, which cannot judge
z5-z9 (no fill there) or any tile where the fill is itself blank. This asks the
ETOPO grid directly: sample depth inside the tile, and if a contour level for
that zoom falls inside the sampled range, the tile must carry ink.

False positives are possible where BlueTopo's real depths differ enough from
ETOPO's interpolation to move a level out of the tile, so treat the output as a
list of candidates to look at, not a verdict.
"""
import argparse
import math
from collections import Counter, defaultdict
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image

from render_tiles import (M_PER_FATHOM, contour_levels_for_zoom, load_grid)

HERE = Path(__file__).parent
SERVED = HERE / "tiles_overlay"
SAMPLE = 7          # NxN bilinear samples inside each tile

LON = LAT = DEPTH = None


def init(nc):
    global LON, LAT, DEPTH
    LON, LAT, DEPTH = load_grid(nc)


def tile_lat_bounds(z, y):
    n = 2.0 ** z
    def lat_at(yy):
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))
    return lat_at(y + 1), lat_at(y)          # south, north


def tile_lon_bounds(z, x):
    n = 2.0 ** z
    return x / n * 360.0 - 180.0, (x + 1) / n * 360.0 - 180.0


def sample_depth_fm(z, x, y):
    """Bilinear-sample ETOPO inside the tile; return fathom depths of water."""
    w, e = tile_lon_bounds(z, x)
    s, n = tile_lat_bounds(z, y)
    lons = np.linspace(w, e, SAMPLE)
    lats = np.linspace(s, n, SAMPLE)
    if lons[-1] < LON[0] or lons[0] > LON[-1] or lats[-1] < LAT[0] or lats[0] > LAT[-1]:
        return None                           # outside the grid entirely
    jf = np.interp(lons, LON, np.arange(LON.size))
    if_ = np.interp(lats, LAT, np.arange(LAT.size))
    j0 = np.clip(jf.astype(int), 0, LON.size - 2)
    i0 = np.clip(if_.astype(int), 0, LAT.size - 2)
    tj = (jf - j0)[None, :]
    ti = (if_ - i0)[:, None]
    d = DEPTH
    v = (d[np.ix_(i0, j0)] * (1 - ti) * (1 - tj)
         + d[np.ix_(i0 + 1, j0)] * ti * (1 - tj)
         + d[np.ix_(i0, j0 + 1)] * (1 - ti) * tj
         + d[np.ix_(i0 + 1, j0 + 1)] * ti * tj)
    water = v[v < 0]
    if water.size == 0:
        return None                           # all land
    return -water / M_PER_FATHOM


def ink(p):
    try:
        a = np.asarray(Image.open(p).convert("RGBA"))[:, :, 3]
    except Exception:
        return -1
    return int((a > 24).sum())


def check(job):
    z, x, y = job
    fm = sample_depth_fm(z, x, y)
    if fm is None:
        return None
    lo, hi = float(fm.min()), float(fm.max())
    minor, mid, major = contour_levels_for_zoom(z)
    levels = [v for v in set(minor) | set(mid) | set(major) if lo <= v <= hi]
    if not levels:
        return None                           # nothing should be drawn here
    p = SERVED / str(z) / str(x) / f"{y}.png"
    if not p.exists():
        return (z, x, y, "absent", lo, hi, len(levels))
    if ink(p) == 0:
        return (z, x, y, "blank", lo, hi, len(levels))
    return None


def jobs_for(z, bbox):
    n = 2 ** z
    w, s, e, nn = bbox
    x0 = max(int((w + 180) / 360 * n), 0)
    x1 = min(int((e + 180) / 360 * n), n - 1)
    def ytile(lat):
        return int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    y0, y1 = max(ytile(nn), 0), min(ytile(s), n - 1)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            yield (z, x, y)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nc", default="etopo_conus.nc")
    ap.add_argument("--zooms", default="5,6,7,8,9,10,11")
    ap.add_argument("--bbox", default=None, help="w,s,e,n (default: whole grid)")
    ap.add_argument("--jobs", type=int, default=10)
    ap.add_argument("--show", type=int, default=10)
    args = ap.parse_args()

    lon, lat, _ = load_grid(args.nc)
    grid_bbox = (lon.min(), lat.min(), lon.max(), lat.max())
    print(f"ETOPO grid lon {lon.min():.2f}..{lon.max():.2f} "
          f"lat {lat.min():.2f}..{lat.max():.2f}  ({lat.size}x{lon.size})")
    bbox = tuple(float(v) for v in args.bbox.split(",")) if args.bbox else grid_bbox
    print(f"auditing bbox {bbox}")

    zooms = [int(v) for v in args.zooms.split(",")]
    all_jobs = [j for z in zooms for j in jobs_for(z, bbox)]
    print(f"candidate tiles: {len(all_jobs):,}\n")

    per_zoom = Counter()
    kinds = Counter()
    examples = defaultdict(list)
    with Pool(args.jobs, initializer=init, initargs=(args.nc,)) as pool:
        for r in pool.imap_unordered(check, all_jobs, chunksize=512):
            if r is None:
                continue
            z, x, y, kind, lo, hi, nlv = r
            per_zoom[z] += 1
            kinds[kind] += 1
            examples[z].append((x, y, kind, lo, hi, nlv))

    print(f"tiles that should draw but don't: {sum(per_zoom.values()):,}")
    for k, v in kinds.most_common():
        print(f"  {k}: {v:,}")
    print()
    for z in sorted(per_zoom):
        print(f"  z{z}: {per_zoom[z]:,}")
        for (x, y, kind, lo, hi, nlv) in examples[z][:args.show]:
            print(f"       {z}/{x}/{y} {kind:6} depth {lo:7.1f}..{hi:7.1f} fm, "
                  f"{nlv} level(s) expected")


if __name__ == "__main__":
    main()
