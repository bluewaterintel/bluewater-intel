#!/usr/bin/env python3
"""Burn BlueTopo survey bathymetry into the ETOPO grid.

ETOPO is a 1 arcmin global model, and in places it is simply wrong rather than
merely coarse. Off Cape Hatteras it stalls the shelf break for two rows and then
jumps a full 0.11 degrees, which draws a chevron across the 40-100 fm bundle at
z9. BlueTopo averaged onto that identical 1 arcmin grid steps a near-constant
0.053 deg per 0.05 deg of latitude, so the kink is bad data, not lost resolution.

The overview zooms (z5-z9) contour ETOPO while z10+ contour BlueTopo, which is
why the shelf break changes shape as you zoom. Correcting the grid once here
makes every zoom agree instead of patching the symptom per zoom level.

Only cells that ETOPO already calls ocean are replaced, so coastlines are
untouched. Coverage is eroded to drop the partial-coverage fringe left by
averaging, then feathered so the handoff back to ETOPO carries no step.
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from scipy.io import netcdf_file
from scipy.ndimage import binary_erosion, distance_transform_edt

R_MERC = 20037508.342789244


def merc_to_lonlat(x, y):
    lon = x / R_MERC * 180.0
    lat = np.degrees(2.0 * np.arctan(np.exp(y / R_MERC * np.pi)) - np.pi / 2.0)
    return lon, lat


def raster_bbox_4326(path):
    from osgeo import gdal

    ds = gdal.Open(str(path))
    gt = ds.GetGeoTransform()
    xs = [gt[0], gt[0] + gt[1] * ds.RasterXSize]
    ys = [gt[3], gt[3] + gt[5] * ds.RasterYSize]
    lons, lats = merc_to_lonlat(np.array(xs), np.array(ys))
    return min(lons), min(lats), max(lons), max(lats)


def warp_to_etopo_grid(path, lon, lat):
    """Average a BlueTopo raster onto the exact ETOPO cell centres."""
    from osgeo import gdal

    gdal.UseExceptions()
    dx = float(lon[1] - lon[0])
    dy = float(lat[1] - lat[0])
    w, s, e, n = raster_bbox_4326(path)

    j0 = max(0, int(np.searchsorted(lon, w)) - 1)
    j1 = min(len(lon) - 1, int(np.searchsorted(lon, e)) + 1)
    i0 = max(0, int(np.searchsorted(lat, s)) - 1)
    i1 = min(len(lat) - 1, int(np.searchsorted(lat, n)) + 1)
    if j1 <= j0 or i1 <= i0:
        return None

    bounds = (lon[j0] - dx / 2, lat[i0] - dy / 2, lon[j1] + dx / 2, lat[i1] + dy / 2)
    ds = gdal.Warp(
        "", str(path), format="MEM", dstSRS="EPSG:4326",
        outputBounds=bounds, xRes=dx, yRes=dy,
        # Averaging every 15 m sounding in the cell is what removes the survey
        # noise that nearest/bilinear would alias into the contours.
        resampleAlg="average",
        dstNodata=np.nan, outputType=gdal.GDT_Float32,
    )
    arr = ds.GetRasterBand(1).ReadAsArray().astype(float)
    # gdal writes north-up; load_grid hands us latitude ascending.
    return arr[::-1, :], i0, i1, j0, j1


def merge(etopo_path, rasters, out_path, erode, feather):
    f = netcdf_file(str(etopo_path), "r", mmap=False)
    lat = np.array(f.variables["latitude"][:], dtype=float)
    lon = np.array(f.variables["longitude"][:], dtype=float)
    alt = np.array(f.variables["altitude"][:], dtype=float)
    f.close()
    flipped = lat[0] > lat[-1]
    if flipped:
        lat = lat[::-1]
        alt = alt[::-1, :]
    print(f"ETOPO grid {alt.shape}  lon {lon[0]:.3f}..{lon[-1]:.3f}  "
          f"lat {lat[0]:.3f}..{lat[-1]:.3f}")

    merged = alt.copy()
    total = 0
    for path in rasters:
        got = warp_to_etopo_grid(path, lon, lat)
        if got is None:
            print(f"  {Path(path).name}: outside grid, skipped")
            continue
        bt, i0, i1, j0, j1 = got
        win = merged[i0:i1 + 1, j0:j1 + 1]
        if bt.shape != win.shape:
            bt = bt[:win.shape[0], :win.shape[1]]

        # Replace only where both sources agree the cell is water. Letting
        # BlueTopo flood cells ETOPO calls land would redraw the coastline.
        valid = np.isfinite(bt) & (bt < 0) & np.isfinite(win) & (win < 0)
        if erode:
            valid = binary_erosion(valid, iterations=erode)
        if not valid.any():
            print(f"  {Path(path).name}: no overlapping ocean cells, skipped")
            continue

        # Ramp the weight down to zero at the coverage edge so the seam back to
        # ETOPO cannot itself become a contour.
        dist = distance_transform_edt(valid)
        wgt = np.clip(dist / max(feather, 1), 0.0, 1.0)
        win_new = np.where(valid, wgt * bt + (1 - wgt) * win, win)

        changed = int((np.abs(win_new - win) > 0.5).sum())
        delta = np.abs(win_new - win)[valid]
        merged[i0:i1 + 1, j0:j1 + 1] = win_new
        total += changed
        print(f"  {Path(path).name}: {valid.sum():,} cells burned, "
              f"{changed:,} moved >0.5 m, median shift {np.median(delta):.1f} m, "
              f"p95 {np.percentile(delta, 95):.1f} m")

    print(f"total cells changed: {total:,}")

    out_lat = lat[::-1] if flipped else lat
    out_alt = merged[::-1, :] if flipped else merged
    g = netcdf_file(str(out_path), "w", version=2)
    g.createDimension("latitude", len(out_lat))
    g.createDimension("longitude", len(lon))
    v = g.createVariable("latitude", "d", ("latitude",))
    v[:] = out_lat
    v = g.createVariable("longitude", "d", ("longitude",))
    v[:] = lon
    v = g.createVariable("altitude", "f", ("latitude", "longitude"))
    v[:, :] = out_alt.astype("float32")
    g.close()
    size = Path(out_path).stat().st_size / 1e9
    print(f"wrote {out_path} ({size:.2f} GB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--etopo", default="etopo_conus.nc")
    ap.add_argument("--out", default="etopo_conus_merged.nc")
    ap.add_argument("--raster", action="append", required=True,
                    help="BlueTopo EPSG:3857 GeoTIFF, repeatable")
    ap.add_argument("--erode", type=int, default=2,
                    help="cells of coverage fringe to drop before blending")
    ap.add_argument("--feather", type=int, default=3,
                    help="cells over which to ramp BlueTopo in")
    a = ap.parse_args()
    missing = [r for r in a.raster if not Path(r).exists()]
    if missing:
        sys.exit(f"missing rasters: {missing}")
    merge(a.etopo, a.raster, a.out, a.erode, a.feather)


if __name__ == "__main__":
    main()
