#!/usr/bin/env python3
"""Re-render ETOPO gap-fill tiles with the source-correct contour ladder.

The first z11–z13 ETOPO fill used the BlueTopo fine ladder (20 fm slope
steps). On 1 arc-min ETOPO that draws false canyon geometry — the jagged
"V" features and comb streaks reported off the Northeast and mid-Atlantic.

Uses multiprocessing like rerender_shallow.py. Writes into --out (default
bluetopo_work/etopo_fill_v2) without touching the live tileset.
"""
import argparse
import math
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

_G = {}


def _init(nc_path, out_dir):
    import render_tiles as R
    lon, lat, depth = R.load_grid(nc_path)
    _G.update(R=R, grid=(lon, lat, depth), cmap=R.make_ocean_cmap(), out=out_dir)


def _render(job):
    z, x, y = job
    R = _G["R"]
    lon, lat, depth = _G["grid"]
    try:
        ok = R.render_tile(lon, lat, depth, z, x, y, _G["out"], _G["cmap"],
                           overlay=True)
    except Exception as exc:
        return (f"{z}/{x}/{y}.png", False, str(exc))
    return (f"{z}/{x}/{y}.png", bool(ok), None)


def lonlat_to_tile(lon, lat, z):
    n = 2.0 ** z
    return (int((lon + 180.0) / 360.0 * n),
            int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nc", default=str(HERE / "etopo_conus.nc"))
    ap.add_argument("--out", default=str(HERE / "bluetopo_work" / "etopo_fill_v2"))
    ap.add_argument("--zmin", type=int, default=11)
    ap.add_argument("--zmax", type=int, default=13)
    ap.add_argument("--jobs", type=int, default=10)
    ap.add_argument("--from-fill", default=None,
                    help="only re-render keys that exist in this fill dir")
    args = ap.parse_args()

    import render_tiles as R
    jobs = []
    if args.from_fill:
        root = Path(args.from_fill)
        for p in root.rglob("*.png"):
            z, x, y = p.relative_to(root).parts
            zi = int(z)
            if zi < args.zmin or zi > args.zmax:
                continue
            jobs.append((zi, int(x), int(y.replace(".png", ""))))
        print(f"re-rendering {len(jobs):,} keys from {args.from_fill} "
              f"(z{args.zmin}-{args.zmax})")
    else:
        lon, lat, _ = R.load_grid(args.nc)
        w, e = float(lon.min()), float(lon.max())
        s, n = float(lat.min()), float(lat.max())
        for z in range(args.zmin, args.zmax + 1):
            x0, y0 = lonlat_to_tile(w, n, z)
            x1, y1 = lonlat_to_tile(e, s, z)
            for x in range(x0, x1 + 1):
                for y in range(y0, y1 + 1):
                    jobs.append((z, x, y))
        print(f"grid lon {w:.1f}..{e:.1f} lat {s:.1f}..{n:.1f}")
        print(f"rendering {len(jobs):,} candidate ETOPO overlay tiles "
              f"z{args.zmin}-{args.zmax} -> {args.out}")

    rendered = 0
    errors = []
    with Pool(args.jobs, initializer=_init, initargs=(args.nc, args.out)) as pool:
        for i, (rel, ok, err) in enumerate(
                pool.imap_unordered(_render, jobs, chunksize=64), 1):
            if ok:
                rendered += 1
            if err:
                errors.append((rel, err))
            if i % 10000 == 0:
                print(f"  {i:,}/{len(jobs):,}  {rendered:,} drawn")
    print(f"drawn {rendered:,} tiles")
    if errors:
        print(f"  {len(errors)} errors, e.g. {errors[0]}")


if __name__ == "__main__":
    main()
