#!/usr/bin/env python3
"""
Render styled XYZ tiles from a BlueTopo GeoTIFF (EPSG:3857).

Merges z10–z13 detail into the existing ETOPO tile dirs (tiles_conus /
tiles_overlay) by z/x/y — same style as render_tiles.py. Skips abyssal
tiles where the shallowest water is deeper than MAX_DEPTH_FM.

Usage:
  python3 render_bluetopo.py --tif ../bluetopo_work/hatteras_3857.tif \\
      --out ../tiles_overlay --overlay --zmin 10 --zmax 13
"""

import argparse
import math
import os
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np

# Import shared style + tile math from the base renderer (parent dir).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from render_tiles import (  # noqa: E402
    lonlat_to_tile,
    make_ocean_cmap,
    merc_to_lat,
    merc_to_lon,
    render_tile_merc,
    tile_bounds_merc,
)
from zones import MAX_DEPTH_FM  # noqa: E402

try:
    from osgeo import gdal
except ImportError:
    sys.exit(
        "GDAL Python bindings required.\n"
        "  conda create -n bw -c conda-forge 'gdal>=3.4' numpy scipy matplotlib -y"
    )

gdal.UseExceptions()

SAMPLE_PX = 256  # contour grid; was 192 — coarser z10 tiles need more points
# BlueTopo survey footprints often end mid-tile. Contouring the covered half
# and leaving the other blank produces the hard horizontal/vertical seams seen
# off NE canyons — worse than drawing the whole tile from ETOPO.
MIN_TILE_COVERAGE = 0.92   # fraction of water pixels with valid elevation


def core_tile_mask(shape, pad_frac=0.30):
    """Boolean mask for the nominal tile interior (excludes contour padding)."""
    h, w = shape
    margin = int(min(h, w) * pad_frac / (1 + 2 * pad_frac))
    out = np.zeros(shape, dtype=bool)
    out[margin:h - margin, margin:w - margin] = True
    return out


def water_coverage(elev, pad_frac=0.30):
    """Share of in-tile water cells that carry valid bathymetry."""
    core = core_tile_mask(elev.shape, pad_frac)
    water = core & (elev < 0) & np.isfinite(elev)
    denom = int(core.sum())
    if denom == 0:
        return 0.0
    return float(water.sum()) / denom


def sample_tile(ds, z, xt, yt, pad_frac=None):
    """Warp a padded window around one XYZ tile into a Mercator grid."""
    if pad_frac is None:
        # Wider pad at high zoom so shelf-break tiles that sit mostly on the
        # slope still sample shallow grid cells from inshore neighbours.
        pad_frac = 0.35 if z <= 10 else (0.45 if z == 11 else 0.55)
    x0, y0, x1, y1 = tile_bounds_merc(z, xt, yt)
    dx, dy = x1 - x0, y1 - y0
    bx0, bx1 = x0 - dx * pad_frac, x1 + dx * pad_frac
    by0, by1 = y0 - dy * pad_frac, y1 + dy * pad_frac

    mem = gdal.Warp(
        "",
        ds,
        format="MEM",
        outputBounds=(bx0, by0, bx1, by1),
        width=SAMPLE_PX,
        height=SAMPLE_PX,
        resampleAlg="bilinear",
        dstSRS="EPSG:3857",
    )
    if mem is None:
        return None

    band = mem.GetRasterBand(1)
    elev = band.ReadAsArray().astype(np.float64)
    nodata = band.GetNoDataValue()
    if nodata is not None:
        elev = np.where(elev == nodata, np.nan, elev)

    gt = mem.GetGeoTransform()
    xs = gt[0] + gt[1] * (np.arange(SAMPLE_PX) + 0.5)
    ys = gt[3] + gt[5] * (np.arange(SAMPLE_PX) + 0.5)
    Xm, Ym = np.meshgrid(xs, ys)
    mem = None
    return Xm, Ym, elev


def tile_bbox_from_tif(ds_path, zmin, zmax):
    """XYZ tile index range covering the GeoTIFF footprint."""
    ds = gdal.Open(str(ds_path))
    if ds is None:
        raise FileNotFoundError(ds_path)
    gt = ds.GetGeoTransform()
    w, h = ds.RasterXSize, ds.RasterYSize
    corners_x = [gt[0], gt[0] + gt[1] * w, gt[0] + gt[1] * w, gt[0]]
    corners_y = [gt[3], gt[3], gt[3] + gt[5] * h, gt[3] + gt[5] * h]
    lons = [merc_to_lon(x) for x in corners_x]
    lats = [merc_to_lat(y) for y in corners_y]
    ds = None
    return min(lons), min(lats), max(lons), max(lats)


_W = {}


def _init_worker(tif, out, overlay, max_depth_fm):
    """Each worker opens its own dataset — GDAL handles don't survive fork."""
    _W["ds"] = gdal.Open(str(tif))
    _W["cmap"] = make_ocean_cmap()
    _W.update(out=out, overlay=overlay, max_depth_fm=max_depth_fm)


def _render_one(job):
    z, xt, yt = job
    try:
        sampled = sample_tile(_W["ds"], z, xt, yt)
        if sampled is None:
            return z, False
        Xm, Ym, elev = sampled
        if water_coverage(elev) < MIN_TILE_COVERAGE:
            return z, False
        ok = render_tile_merc(Xm, Ym, elev, z, xt, yt, _W["out"], _W["cmap"],
                              overlay=_W["overlay"],
                              max_depth_fm=_W["max_depth_fm"],
                              source="bluetopo")
        return z, bool(ok)
    except Exception:
        return z, False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tif", required=True, help="EPSG:3857 BlueTopo GeoTIFF")
    ap.add_argument("--jobs", type=int, default=1,
                    help="parallel worker processes")
    ap.add_argument("--out", default="../tiles_conus")
    ap.add_argument("--zmin", type=int, default=8)
    ap.add_argument("--zmax", type=int, default=13)
    ap.add_argument("--overlay", action="store_true",
                    help="transparent contour-only tiles")
    ap.add_argument("--max-depth-fm", type=float, default=MAX_DEPTH_FM,
                    help="skip tiles shallower than this (default: shelf mask)")
    ap.add_argument("--bw", type=float, default=None)
    ap.add_argument("--be", type=float, default=None)
    ap.add_argument("--bs", type=float, default=None)
    ap.add_argument("--bn", type=float, default=None)
    args = ap.parse_args()

    tif = Path(args.tif)
    if not tif.is_file():
        sys.exit(f"missing {tif}")

    ds = gdal.Open(str(tif))
    if ds is None:
        sys.exit(f"cannot open {tif}")

    auto = tile_bbox_from_tif(tif, args.zmin, args.zmax)
    bb_w = args.bw if args.bw is not None else auto[0]
    bb_s = args.bs if args.bs is not None else auto[1]
    bb_e = args.be if args.be is not None else auto[2]
    bb_n = args.bn if args.bn is not None else auto[3]

    cmap = make_ocean_cmap()
    print(f"render {tif.name} -> {args.out}/  z{args.zmin}-{args.zmax}"
          f"  bbox {bb_w:.2f},{bb_s:.2f},{bb_e:.2f},{bb_n:.2f}"
          f"  max_depth={args.max_depth_fm} fm")

    jobs = []
    for z in range(args.zmin, args.zmax + 1):
        xt0, yt1 = lonlat_to_tile(bb_w, bb_s, z)
        xt1, yt0 = lonlat_to_tile(bb_e, bb_n, z)
        for xt in range(xt0, xt1 + 1):
            for yt in range(yt0, yt1 + 1):
                jobs.append((z, xt, yt))
    ds = None
    print(f"  {len(jobs):,} candidate tiles, {args.jobs} worker(s)")

    per_zoom = {}
    total = skipped = 0
    initargs = (tif, args.out, args.overlay, args.max_depth_fm)
    with Pool(max(1, args.jobs), initializer=_init_worker,
              initargs=initargs) as pool:
        for i, (z, ok) in enumerate(
                pool.imap_unordered(_render_one, jobs, chunksize=32), 1):
            if ok:
                per_zoom[z] = per_zoom.get(z, 0) + 1
                total += 1
            else:
                skipped += 1
            if i % 5000 == 0:
                print(f"  {i:,}/{len(jobs):,}  {total:,} drawn", flush=True)

    for z in sorted(per_zoom):
        print(f"z{z}: {per_zoom[z]} tiles")
    print(f"done: {total} tiles written, {skipped} skipped -> {args.out}/")


if __name__ == "__main__":
    main()
