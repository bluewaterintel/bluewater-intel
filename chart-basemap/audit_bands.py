#!/usr/bin/env python3
"""Find tiles with an axis-aligned blank band inside them.

Zones overwrite each other's tiles, and a zone whose survey stops partway
through a tile writes that tile with nodata past the edge. A later zone covering
the same ground only rewrites it if its own survey has data there, so the
partial tile can survive — and because the file exists, the ETOPO fill was
skipped. On screen that is a straight blank strip through otherwise-drawn tiles.

The signature is specific: a whole row (or column) of cells with no ink at all,
while the ETOPO tile for the same spot draws across most of that row. Scattered
per-cell deficits are just BlueTopo disagreeing with ETOPO's interpolation and
are deliberately not flagged.
"""
import argparse
import math
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
SERVED = HERE / "tiles_overlay"
FILL = HERE / "bluetopo_work" / "etopo_fill"
N = 16                 # cells per axis
CELL = 256 // N
MIN_TILE_INK = 40      # wholly-blank tiles are a different (already-handled) case


def cells(path):
    try:
        a = np.asarray(Image.open(path).convert("RGBA"))[:, :, 3] > 24
    except Exception:
        return None
    return a.reshape(N, CELL, N, CELL).sum(axis=(1, 3))


def tile_edges(z, x, y):
    n = 2.0 ** z
    lat_of = lambda yy: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))
    return (x / n * 360.0 - 180.0, (x + 1) / n * 360.0 - 180.0,
            lat_of(y + 1), lat_of(y))


def inspect(rel):
    sp, fp = SERVED / rel, FILL / rel
    if not sp.exists() or not fp.exists():
        return None
    sc, fc = cells(sp), cells(fp)
    if sc is None or fc is None:
        return None
    if sc.sum() < MIN_TILE_INK:
        return None

    bad_rows = [i for i in range(N)
                if sc[i, :].sum() == 0 and (fc[i, :] > 0).sum() >= N // 2]
    bad_cols = [j for j in range(N)
                if sc[:, j].sum() == 0 and (fc[:, j] > 0).sum() >= N // 2]
    if not bad_rows and not bad_cols:
        return None

    z, x, y = rel.replace(".png", "").split("/")
    z, x, y = int(z), int(x), int(y)
    w, e, s, nn = tile_edges(z, x, y)
    # Latitude / longitude the blank band sits on, for comparing against zone edges.
    lats = [s + (nn - s) * (1 - (i + 0.5) / N) for i in bad_rows]
    lons = [w + (e - w) * ((j + 0.5) / N) for j in bad_cols]
    return (rel, len(bad_rows), len(bad_cols), lats, lons)


def iter_rel(zooms):
    for z in zooms:
        zd = SERVED / str(z)
        if not zd.is_dir():
            continue
        for xd in sorted(zd.iterdir()):
            if xd.is_dir():
                for p in xd.glob("*.png"):
                    yield f"{z}/{xd.name}/{p.stem}.png"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zooms", default="10,11,12,13")
    ap.add_argument("--jobs", type=int, default=10)
    ap.add_argument("--manifest", default=None)
    args = ap.parse_args()

    zooms = [int(v) for v in args.zooms.split(",")]
    rels = list(iter_rel(zooms))
    print(f"scanning {len(rels):,} served tiles")

    hits = []
    with Pool(args.jobs) as pool:
        for r in pool.imap_unordered(inspect, rels, chunksize=256):
            if r:
                hits.append(r)

    by_zoom = Counter(h[0].split("/")[0] for h in hits)
    print(f"\ntiles with a blank band: {len(hits):,}")
    for z in sorted(by_zoom, key=int):
        print(f"  z{z}: {by_zoom[z]:,}")

    # If this is the zone-edge artifact, the band latitudes should pile up on
    # the zone bbox edges rather than scatter.
    lat_hist = Counter()
    lon_hist = Counter()
    for (_rel, _nr, _nc, lats, lons) in hits:
        for v in lats:
            lat_hist[round(v * 4) / 4] += 1
        for v in lons:
            lon_hist[round(v * 4) / 4] += 1
    print("\nband latitudes (quarter-degree bins, top 12):")
    for v, c in lat_hist.most_common(12):
        print(f"  lat {v:>7}: {c:5d}")
    print("\nband longitudes (quarter-degree bins, top 12):")
    for v, c in lon_hist.most_common(12):
        print(f"  lon {v:>7}: {c:5d}")

    if args.manifest:
        Path(args.manifest).write_text("".join(f"{h[0]}\n" for h in sorted(hits)))
        print(f"\nwrote {args.manifest}")


if __name__ == "__main__":
    main()
