#!/usr/bin/env python3
"""Repair tiles where partial BlueTopo coverage left a hole.

`rsync --ignore-existing` let a BlueTopo tile win by existing, even when survey
data covered only part of it. The result is a tile with a blank region and a
hard straight edge where the survey ended, while the ETOPO fill tile for the
same spot has continuous contours.

A tile is only replaced when BOTH hold, so that legitimately-sparser BlueTopo
tiles (real flat bottom, where ETOPO's interpolation invents wiggle) are kept:

  1. it carries less than --ratio of the fill tile's ink, and
  2. at least --cells blocks of the tile are blank while the fill tile draws
     there, which is what an actual hole looks like as opposed to slightly
     fewer lines.

Writes the repaired keys to a manifest so only those tiles get re-uploaded.
"""
import argparse
import math
import shutil
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
SERVED = HERE / "tiles_overlay"
FILL = HERE / "bluetopo_work" / "etopo_fill"
CELL = 32          # 8x8 grid over a 256px tile
GRID = 256 // CELL


def set_roots(served, fill):
    """Point the audit at a scratch build instead of the live tileset."""
    global SERVED, FILL
    SERVED = Path(served)
    FILL = Path(fill)


def ink_mask(path):
    im = Image.open(path).convert("RGBA")
    return np.asarray(im)[:, :, 3] > 24


def cell_counts(mask):
    return mask.reshape(GRID, CELL, GRID, CELL).sum(axis=(1, 3))


def inspect(rel):
    """Return (rel, verdict, served_ink, fill_ink, deficit_cells)."""
    sp, fp = SERVED / rel, FILL / rel
    try:
        fm = ink_mask(fp)
    except Exception:
        return (rel, "fill_unreadable", 0, 0, 0)
    fi = int(fm.sum())
    if fi == 0:
        return (rel, "fill_empty", 0, 0, 0)
    if not sp.exists():
        return (rel, "missing", 0, fi, GRID * GRID)
    try:
        sm = ink_mask(sp)
    except Exception:
        return (rel, "served_unreadable", 0, fi, 0)
    si = int(sm.sum())
    fc, sc = cell_counts(fm), cell_counts(sm)
    deficit = int(((fc > 0) & (sc == 0)).sum())
    return (rel, "ok", si, fi, deficit)


def tile_to_lonlat(z, x, y):
    n = 2.0 ** z
    return (x / n * 360.0 - 180.0,
            math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n)))))


def iter_rel(zooms):
    for z in zooms:
        zd = FILL / str(z)
        if not zd.is_dir():
            continue
        for xd in sorted(zd.iterdir()):
            if not xd.is_dir():
                continue
            for p in xd.glob("*.png"):
                yield f"{z}/{xd.name}/{p.stem}.png"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zooms", default="10,11,12,13")
    ap.add_argument("--ratio", type=float, default=0.55)
    ap.add_argument("--cells", type=int, default=6)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--manifest", default="repair_manifest.txt")
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--clusters", type=int, default=0,
                    help="report the N biggest geographic clusters")
    ap.add_argument("--served", default=str(SERVED),
                    help="tileset to repair (default: the live one)")
    ap.add_argument("--fill", default=str(FILL),
                    help="reference tiles to patch holes from")
    args = ap.parse_args()

    set_roots(args.served, args.fill)
    zooms = [int(v) for v in args.zooms.split(",")]
    rels = list(iter_rel(zooms))
    print(f"reference tiles (ETOPO fill, z{zooms[0]}-{zooms[-1]}): {len(rels):,}")

    verdicts = Counter()
    repair = []
    by_zoom = Counter()
    # macOS spawns workers, which re-import this module and would otherwise see
    # the default roots rather than the ones chosen above.
    with Pool(args.jobs, initializer=set_roots,
              initargs=(args.served, args.fill)) as pool:
        for rel, verdict, si, fi, deficit in pool.imap_unordered(
                inspect, rels, chunksize=256):
            verdicts[verdict] += 1
            if verdict == "missing":
                repair.append(rel)
                by_zoom[rel.split("/")[0]] += 1
            elif verdict == "ok" and si < args.ratio * fi and deficit >= args.cells:
                repair.append(rel)
                by_zoom[rel.split("/")[0]] += 1

    print("\nverdicts:")
    for k, v in verdicts.most_common():
        print(f"  {k:18} {v:,}")

    print(f"\ntiles needing repair: {len(repair):,} "
          f"({100.0 * len(repair) / max(len(rels), 1):.2f}% of reference)")
    for z in sorted(by_zoom, key=int):
        print(f"  z{z}: {by_zoom[z]:,}")

    if args.clusters and repair:
        print("\nwhere (rounded lon/lat, biggest clusters first):")
        groups = Counter()
        sample = {}
        for rel in repair:
            z, x, y = rel.replace(".png", "").split("/")
            lon, lat = tile_to_lonlat(int(z), int(x), int(y))
            k = (int(z), round(lon), round(lat))
            groups[k] += 1
            sample.setdefault(k, rel)
        for (z, lon, lat), n in groups.most_common(args.clusters):
            print(f"  z{z} lon {lon:>5} lat {lat:>3}: {n:5d} tiles   e.g. {sample[(z, lon, lat)]}")

    if not args.apply:
        print("\ndry run — nothing written. re-run with --apply")
        return

    repair.sort()
    for rel in repair:
        dst = SERVED / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(FILL / rel, dst)
    Path(args.manifest).write_text("".join(f"{r}\n" for r in repair))
    print(f"\nreplaced {len(repair):,} tiles; manifest -> {args.manifest}")


if __name__ == "__main__":
    main()
