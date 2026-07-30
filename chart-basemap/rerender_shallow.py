#!/usr/bin/env python3
"""Re-render z10/z11 from ETOPO after a contour-ladder change and install the
result without disturbing BlueTopo tiles.

The finer inner-shelf ladder only changes ETOPO-derived tiles here, because the
BlueTopo source rasters were discarded after the build. So a tile is replaced
only when the live tile is byte-identical to the ETOPO fill tile for that spot
(or absent) — anything else came from BlueTopo and is left alone.

Writes a manifest so only the changed tiles get re-uploaded.
"""
import argparse
import math
import os
import shutil
import sys
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

SERVED = HERE / "tiles_overlay"
OLD_FILL = HERE / "bluetopo_work" / "etopo_fill"

_G = {}


def _init(nc_path, out_dir):
    import render_tiles as R
    lon, lat, depth = R.load_grid(nc_path)
    _G["R"] = R
    _G["grid"] = (lon, lat, depth)
    _G["cmap"] = R.make_ocean_cmap()
    _G["out"] = out_dir


def _render(job):
    z, x, y = job
    R = _G["R"]
    lon, lat, depth = _G["grid"]
    try:
        ok = R.render_tile(lon, lat, depth, z, x, y, _G["out"], _G["cmap"],
                           overlay=True)
    except Exception as exc:  # a single bad tile must not kill the run
        return (f"{z}/{x}/{y}.png", False, str(exc))
    return (f"{z}/{x}/{y}.png", bool(ok), None)


def lonlat_to_tile(lon, lat, z):
    n = 2.0 ** z
    return (int((lon + 180.0) / 360.0 * n),
            int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nc", default=str(HERE / "etopo_conus.nc"))
    ap.add_argument("--out", default=str(HERE / "bluetopo_work" / "etopo_shallow"))
    ap.add_argument("--zooms", default="10,11")
    ap.add_argument("--jobs", type=int, default=10)
    ap.add_argument("--manifest", default="shallow_manifest.txt")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    import render_tiles as R
    lon, lat, _ = R.load_grid(args.nc)
    w, e = float(lon.min()), float(lon.max())
    s, n = float(lat.min()), float(lat.max())

    jobs = []
    for z in [int(v) for v in args.zooms.split(",")]:
        x0, y0 = lonlat_to_tile(w, n, z)
        x1, y1 = lonlat_to_tile(e, s, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                jobs.append((z, x, y))
    print(f"grid lon {w:.1f}..{e:.1f} lat {s:.1f}..{n:.1f}")
    print(f"rendering {len(jobs):,} candidate tiles at z{args.zooms} "
          f"-> {args.out}")

    rendered = 0
    errors = []
    with Pool(args.jobs, initializer=_init, initargs=(args.nc, args.out)) as pool:
        for i, (rel, ok, err) in enumerate(
                pool.imap_unordered(_render, jobs, chunksize=64), 1):
            if ok:
                rendered += 1
            if err:
                errors.append((rel, err))
            if i % 5000 == 0:
                print(f"  {i:,}/{len(jobs):,}  {rendered:,} drawn")
    print(f"drawn {rendered:,} tiles")
    if errors:
        print(f"  {len(errors)} render errors, e.g. {errors[0]}")

    # ---- install phase -------------------------------------------------
    out = Path(args.out)
    verdict = Counter()
    manifest = []
    for p in out.rglob("*.png"):
        rel = str(p.relative_to(out))
        live, old = SERVED / rel, OLD_FILL / rel
        new_bytes = p.read_bytes()
        if not live.exists():
            verdict["new"] += 1
            manifest.append((rel, p))
            continue
        live_bytes = live.read_bytes()
        if live_bytes == new_bytes:
            verdict["unchanged"] += 1
            continue
        if old.exists() and live_bytes == old.read_bytes():
            verdict["etopo_updated"] += 1
            manifest.append((rel, p))
        else:
            verdict["kept_bluetopo"] += 1

    print("\ninstall plan:")
    for k, v in verdict.most_common():
        print(f"  {k:16} {v:,}")
    print(f"  {'to upload':16} {len(manifest):,}")

    if not args.apply:
        print("\ndry run — nothing written. re-run with --apply")
        return

    for rel, src in manifest:
        dst = SERVED / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    Path(args.manifest).write_text("".join(f"{r}\n" for r, _ in sorted(manifest)))
    print(f"\ninstalled {len(manifest):,} tiles; manifest -> {args.manifest}")


if __name__ == "__main__":
    main()
