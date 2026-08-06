#!/usr/bin/env python3
"""Re-render ETOPO overview overlay tiles (z8–z9) after render-policy changes.

Use when low-zoom ETOPO tiles show jagged minor contours or false shelf lines
in sounds/inlets. Installs into tiles_overlay/ and writes an upload manifest.

Usage:
  python3 refresh_etopo_overview.py --apply
  python3 refresh_etopo_overview.py --zmin 8 --zmax 9 --apply
"""
import argparse
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVED = HERE / "tiles_overlay"
NC = HERE / "etopo_conus.nc"
OUT = HERE / "etopo_overview_refresh"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nc", default=str(NC))
    ap.add_argument("--zmin", type=int, default=8)
    ap.add_argument("--zmax", type=int, default=10)
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    if not Path(args.nc).is_file():
        sys.exit(f"missing {args.nc}")

    import render_tiles as R

    lon, lat, depth = R.load_grid(args.nc)
    cmap = R.make_ocean_cmap()
    out = Path(args.out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    bb_w, bb_s, bb_e, bb_n = lon.min(), lat.min(), lon.max(), lat.max()
    print(f"ETOPO overview refresh z{args.zmin}-{args.zmax} -> {out}")
    written = []
    total = 0
    for z in range(args.zmin, args.zmax + 1):
        xt0, yt1 = R.lonlat_to_tile(bb_w, bb_s, z)
        xt1, yt0 = R.lonlat_to_tile(bb_e, bb_n, z)
        n = 0
        for xt in range(xt0, xt1 + 1):
            for yt in range(yt0, yt1 + 1):
                if R.render_tile(lon, lat, depth, z, xt, yt, str(out), cmap,
                                 overlay=True):
                    written.append(f"{z}/{xt}/{yt}.png")
                    n += 1
        print(f"z{z}: {n} tiles")
        total += n
    print(f"rendered {total:,} tiles")

    manifest = HERE / "refresh_etopo_overview_manifest.txt"
    manifest.write_text("".join(f"{r}\n" for r in sorted(written)))
    print(f"manifest -> {manifest}")

    if not args.apply:
        print("dry run — re-run with --apply to install into tiles_overlay")
        return

    for rel in written:
        src, dst = out / rel, SERVED / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    print(f"installed {len(written):,} tiles into {SERVED}")


if __name__ == "__main__":
    main()
