#!/usr/bin/env python3
"""
Fetch NOAA BlueTopo for a shelf/canyon zone, mosaic, and reproject to Web Mercator.

Requires GDAL + noaabathymetry (formerly nbs-bluetopo):
  conda create -n bw -c conda-forge 'gdal>=3.4' numpy -y
  conda activate bw
  pip install noaabathymetry

Usage:
  python3 fetch_bluetopo.py --zone hatteras
  python3 fetch_bluetopo.py --all
"""

import argparse
import glob
import os
import subprocess
import sys
from pathlib import Path

from zones import ZONE_NAMES, bbox_string, get_zone

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_WORK = SCRIPT_DIR.parent / "bluetopo_work"


def require_gdal():
    try:
        from osgeo import gdal  # noqa: F401
    except ImportError:
        sys.exit(
            "GDAL Python bindings not found.\n"
            "  conda create -n bw -c conda-forge 'gdal>=3.4' -y && conda activate bw"
        )


def find_mosaic_sources(project_dir):
    """Return raster path(s) produced by noaabathymetry mosaic — prefer VRT mosaics."""
    root = Path(project_dir)
    mosaic_dir = root / "BlueTopo_Mosaic"
    vrts = sorted(mosaic_dir.glob("*.vrt")) if mosaic_dir.is_dir() else []
    if vrts:
        return [str(p) for p in vrts]
    # Fallback: any top-level VRT (other data sources / layout versions).
    top_vrts = sorted(root.glob("*.vrt"))
    if top_vrts:
        return [str(p) for p in top_vrts]
    raise FileNotFoundError(
        f"no mosaic VRT found under {project_dir} — run mosaic_tiles first"
    )


def purge_unreadable_overviews(src_paths):
    """Delete .ovr sidecars that can't be read.

    An interrupted mosaic leaves a truncated overview file behind. GDAL then
    downsamples from it silently, so a warp to a coarser grid returns nodata
    for every pixel while still exiting 0 — a whole zone renders as zero tiles
    with no error anywhere. Reading at reduced resolution is what trips the
    corrupt IFD, so that's the probe.
    """
    from osgeo import gdal

    gdal.UseExceptions()
    for src in src_paths:
        ovr = Path(f"{src}.ovr")
        if not ovr.exists():
            continue
        try:
            ds = gdal.Open(src)
            ds.GetRasterBand(1).ReadAsArray(buf_xsize=64, buf_ysize=64)
        except RuntimeError as exc:
            print(f"  corrupt overview, removing {ovr.name}: {exc}".split("\n")[0])
            ovr.unlink()


def assert_has_data(tif):
    """Fail loudly if a warped raster came out entirely nodata."""
    from osgeo import gdal
    import numpy as np

    gdal.UseExceptions()
    ds = gdal.Open(str(tif))
    band = ds.GetRasterBand(1)
    arr = band.ReadAsArray(buf_xsize=1024, buf_ysize=1024).astype("float64")
    nodata = band.GetNoDataValue()
    if nodata is not None:
        arr = np.where(arr == nodata, np.nan, arr)
    finite = np.isfinite(arr)
    if not finite.any():
        raise RuntimeError(
            f"{tif} warped to 100% nodata — source mosaic or its overviews are bad"
        )
    print(f"  validated {tif.name}: {finite.mean():.1%} of sampled pixels have data")


def warp_to_3857(src_paths, dst_tif, bbox):
    """Merge source rasters and warp to EPSG:3857, clipped to WGS84 bbox."""
    w, s, e, n = bbox
    dst_tif = Path(dst_tif)
    dst_tif.parent.mkdir(parents=True, exist_ok=True)
    purge_unreadable_overviews(src_paths)
    # Pin the output grid to 15 m pixels in Web Mercator. Without -tr, gdalwarp
    # inherits the finest source survey resolution (sub-metre in places) and
    # writes a raster orders of magnitude larger than anything z13 can show —
    # a single zone came to 147 GB. 15 m is already finer than z13 (~13 m/px at
    # Hatteras latitude, and Mercator pixels shrink toward the pole).
    cmd = [
        "gdalwarp",
        "-t_srs", "EPSG:3857",
        "-te_srs", "EPSG:4326",
        "-te", str(w), str(s), str(e), str(n),
        "-tr", "15", "15",
        "-r", "bilinear",
        # Downsample from full resolution. Overviews are the only thing GDAL
        # reads when the target grid is coarser than the source, so a stale or
        # truncated pyramid would otherwise decide the entire output.
        "-ovr", "NONE",
        "-multi",
        "-wo", "NUM_THREADS=ALL_CPUS",
        "-dstnodata", "-9999",
        "-co", "COMPRESS=DEFLATE",
        "-co", "TILED=YES",
        "-co", "BIGTIFF=IF_SAFER",
        "-overwrite",
        *src_paths,
        str(dst_tif),
    ]
    print("gdalwarp:", " ".join(cmd))
    subprocess.run(cmd, check=True)
    assert_has_data(dst_tif)
    print("wrote", dst_tif)


def fetch_zone(zone_name, work_dir):
    zone = get_zone(zone_name)
    bbox = zone["bbox"]
    work_dir = Path(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    project_dir = work_dir / f"{zone_name}_fetch"
    out_tif = work_dir / f"{zone_name}_3857.tif"

    try:
        from nbs.noaabathymetry import fetch_tiles, mosaic_tiles
    except ImportError:
        sys.exit(
            "noaabathymetry not installed.\n"
            "  pip install noaabathymetry"
        )

    geom = bbox_string(bbox)
    print(f"\n=== {zone_name}: {zone['label']} ===")
    print(f"bbox {geom}")

    if project_dir.exists():
        print(f"reusing fetch dir {project_dir} (delete it to re-download)")
    else:
        project_dir.mkdir(parents=True, exist_ok=True)

    print("fetch_tiles …")
    fetch_tiles(str(project_dir), geometry=geom, data_source="bluetopo")

    print("mosaic_tiles …")
    mosaic_tiles(str(project_dir))

    srcs = find_mosaic_sources(project_dir)
    print(f"mosaic sources ({len(srcs)}):", *srcs, sep="\n  ")

    warp_to_3857(srcs, out_tif, bbox)
    return out_tif


def main():
    ap = argparse.ArgumentParser(description="Fetch BlueTopo → Web Mercator GeoTIFF")
    ap.add_argument("--zone", choices=ZONE_NAMES, help="single zone to fetch")
    ap.add_argument("--all", action="store_true", help="fetch every zone")
    ap.add_argument("--work", default=str(DEFAULT_WORK), help="output work directory")
    args = ap.parse_args()

    if not args.all and not args.zone:
        ap.error("pass --zone NAME or --all")

    require_gdal()
    os.environ.setdefault("AWS_NO_SIGN_REQUEST", "YES")

    names = ZONE_NAMES if args.all else [args.zone]
    for name in names:
        fetch_zone(name, args.work)


if __name__ == "__main__":
    main()
