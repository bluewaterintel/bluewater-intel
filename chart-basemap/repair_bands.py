#!/usr/bin/env python3
"""Fill blank bands left where one zone's survey stops partway through a tile.

Only the blank band is touched. Replacing the whole tile with the ETOPO version
would throw away real BlueTopo detail across the rest of it, and compositing
ETOPO under the whole tile ghosts every line where the two disagree. So ETOPO
pixels go into the blank rows/columns and nowhere else, with one cell of overlap
so the join isn't a hard butt against the BlueTopo lines.

Contours still jog slightly where ETOPO's smooth line meets BlueTopo's detailed
one at the seam. That is the cost of not having the source rasters any more, and
it reads far better than a blank strip.
"""
import argparse
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
SERVED = HERE / "tiles_overlay"
FILL = HERE / "bluetopo_work" / "etopo_fill"
N = 16
CELL = 256 // N
MIN_TILE_INK = 40
PALETTE_COLORS = 64      # match render_tiles._save_tile so sizes stay comparable


def alpha_cells(a):
    return (a > 24).reshape(N, CELL, N, CELL).sum(axis=(1, 3))


def find_bands(sc, fc):
    rows = [i for i in range(N)
            if sc[i, :].sum() == 0 and (fc[i, :] > 0).sum() >= N // 2]
    cols = [j for j in range(N)
            if sc[:, j].sum() == 0 and (fc[:, j] > 0).sum() >= N // 2]
    return rows, cols


def repair_one(rel):
    sp, fp = SERVED / rel, FILL / rel
    if not sp.exists() or not fp.exists():
        return (rel, "skip_absent")
    try:
        s_img = Image.open(sp).convert("RGBA")
        f_img = Image.open(fp).convert("RGBA")
    except Exception:
        return (rel, "skip_unreadable")
    s = np.asarray(s_img).copy()
    f = np.asarray(f_img)
    sc, fc = alpha_cells(s[:, :, 3]), alpha_cells(f[:, :, 3])
    if sc.sum() < MIN_TILE_INK:
        return (rel, "skip_blank_tile")
    rows, cols = find_bands(sc, fc)
    if not rows and not cols:
        return (rel, "skip_no_band")

    # One cell of overlap on each side of the band. Inside the band the served
    # tile has no ink at all, so ETOPO can be pasted outright; in the overlap it
    # goes underneath so BlueTopo's lines stay on top.
    band = np.zeros((256, 256), dtype=bool)
    over = np.zeros((256, 256), dtype=bool)
    for i in rows:
        band[i * CELL:(i + 1) * CELL, :] = True
        over[max(i - 1, 0) * CELL:min(i + 2, N) * CELL, :] = True
    for j in cols:
        band[:, j * CELL:(j + 1) * CELL] = True
        over[:, max(j - 1, 0) * CELL:min(j + 2, N) * CELL] = True
    over &= ~band

    src_a = f[:, :, 3].astype(np.uint16)
    put = band & (src_a > 0)
    s[put] = f[put]
    # Under-paste: keep served pixels that already carry ink.
    under = over & (src_a > 0) & (s[:, :, 3] == 0)
    s[under] = f[under]

    out = Image.fromarray(s, "RGBA").quantize(colors=PALETTE_COLORS,
                                              method=Image.FASTOCTREE)
    out.save(sp, optimize=True)
    return (rel, "repaired")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True,
                    help="tile list from audit_bands.py --manifest")
    ap.add_argument("--jobs", type=int, default=10)
    ap.add_argument("--out-manifest", default=None,
                    help="write the repaired subset here for upload")
    args = ap.parse_args()

    rels = [l.strip() for l in Path(args.manifest).read_text().splitlines() if l.strip()]
    print(f"repairing {len(rels):,} tiles")

    verdicts = Counter()
    done = []
    with Pool(args.jobs) as pool:
        for rel, verdict in pool.imap_unordered(repair_one, rels, chunksize=64):
            verdicts[verdict] += 1
            if verdict == "repaired":
                done.append(rel)
    for k, v in verdicts.most_common():
        print(f"  {k:20} {v:,}")

    if args.out_manifest:
        Path(args.out_manifest).write_text("".join(f"{r}\n" for r in sorted(done)))
        print(f"\nwrote {args.out_manifest} ({len(done):,} tiles)")


if __name__ == "__main__":
    main()
