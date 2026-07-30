#!/usr/bin/env python3
"""Undo the 2 fm inner-shelf pass at z11 only, keeping the z10 pass.

Three groups were touched at z11 and each unwinds differently:

  re-rendered  the live tile came from ETOPO, so the pre-change ETOPO fill tile
               is still on disk and is restored verbatim
  created      no tile existed before; the 5 fm ladder draws nothing there, so
               the tile is removed and listed for deletion from storage
  composited   the live tile is BlueTopo with 2 fm ETOPO lines painted on top.
               The BlueTopo original was overwritten in place, so recover it by
               clearing every pixel the delta render inked. Contours of
               different depths never cross, so the BlueTopo lines underneath
               are almost entirely intact — only halo overlaps are nicked.
"""
import argparse
import io
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
SERVED = HERE / "tiles_overlay"
OLD_FILL = HERE / "bluetopo_work" / "etopo_fill"
DELTA = HERE / "bluetopo_work" / "etopo_delta"


def z_of(rel):
    return int(rel.split("/")[0])


def read_manifest(p):
    return [l.strip() for l in Path(p).read_text().splitlines() if l.strip()]


def save_overlay(img, path):
    q = img.quantize(colors=64, method=Image.FASTOCTREE)
    buf = io.BytesIO()
    q.save(buf, format="PNG", optimize=True)
    Path(path).write_bytes(buf.getvalue())
    buf.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shallow", default="shallow_manifest.txt")
    ap.add_argument("--composite", default="composite_manifest.txt")
    ap.add_argument("--zoom", type=int, default=11)
    ap.add_argument("--reupload", default="revert_manifest.txt")
    ap.add_argument("--delete", default="delete_manifest.txt")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    stats = Counter()
    reupload, remove = [], []

    for rel in read_manifest(args.shallow):
        if z_of(rel) != args.zoom:
            continue
        old = OLD_FILL / rel
        if old.exists():
            stats["restore_from_fill"] += 1
            if args.apply:
                (SERVED / rel).write_bytes(old.read_bytes())
            reupload.append(rel)
        else:
            stats["delete_created"] += 1
            if args.apply and (SERVED / rel).exists():
                (SERVED / rel).unlink()
            remove.append(rel)

    for rel in read_manifest(args.composite):
        if z_of(rel) != args.zoom:
            continue
        live, dpath = SERVED / rel, DELTA / rel
        if not live.exists() or not dpath.exists():
            stats["composite_missing_source"] += 1
            continue
        base = np.asarray(Image.open(live).convert("RGBA")).copy()
        add = np.asarray(Image.open(dpath).convert("RGBA"))
        painted = add[:, :, 3] > 0
        stats["composite_cleared"] += 1
        if painted.sum() == 0:
            continue
        base[painted] = (0, 0, 0, 0)
        if args.apply:
            save_overlay(Image.fromarray(base, "RGBA"), live)
        reupload.append(rel)

    print(f"z{args.zoom} revert plan:")
    for k, v in stats.most_common():
        print(f"  {k:24} {v:,}")
    print(f"  {'to re-upload':24} {len(reupload):,}")
    print(f"  {'to delete from storage':24} {len(remove):,}")

    if not args.apply:
        print("\ndry run — nothing written. re-run with --apply")
        return

    Path(args.reupload).write_text("".join(f"{r}\n" for r in sorted(set(reupload))))
    Path(args.delete).write_text("".join(f"{r}\n" for r in sorted(set(remove))))
    print(f"\nwrote {args.reupload} and {args.delete}")


if __name__ == "__main__":
    main()
