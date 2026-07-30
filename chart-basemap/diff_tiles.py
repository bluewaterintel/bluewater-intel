#!/usr/bin/env python3
"""Compare two tile trees and list what a publish would change.

Used to re-upload only what a partial rebuild actually touched instead of
resending a quarter-million tiles.

  added    in NEW, not in OLD          -> upload
  changed  in both, different bytes    -> upload
  removed  in OLD, not in NEW          -> stale on the server; the old render
                                          would keep showing through, so these
                                          need deleting, not ignoring
"""
import argparse
import hashlib
import math
from collections import Counter
from pathlib import Path


def tile_range(bbox, z):
    n = 2 ** z
    w, s, e, nn = bbox
    def ytile(lat):
        return int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return (int((w + 180) / 360 * n), int((e + 180) / 360 * n),
            ytile(nn), ytile(s))


def tiles(root, zooms, bbox=None):
    root = Path(root)
    out = set()
    for z in zooms:
        zd = root / str(z)
        if not zd.is_dir():
            continue
        # A partial rebuild covers one zone, so the old tree must be clipped to
        # the same footprint or every tile elsewhere reads as "removed".
        rng = tile_range(bbox, z) if bbox else None
        for xd in zd.iterdir():
            if not xd.is_dir():
                continue
            x = int(xd.name)
            if rng and not (rng[0] <= x <= rng[1]):
                continue
            for p in xd.glob("*.png"):
                if rng and not (rng[2] <= int(p.stem) <= rng[3]):
                    continue
                out.add(f"{z}/{xd.name}/{p.stem}.png")
    return out


def digest(p):
    h = hashlib.blake2b(digest_size=16)
    h.update(Path(p).read_bytes())
    return h.digest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--old", required=True)
    ap.add_argument("--new", required=True)
    ap.add_argument("--zooms", default="12,13")
    ap.add_argument("--bbox", default=None,
                    help="w,s,e,n — clip both trees to the rebuilt footprint")
    ap.add_argument("--upload-manifest", default=None)
    ap.add_argument("--remove-manifest", default=None)
    args = ap.parse_args()

    zooms = [int(v) for v in args.zooms.split(",")]
    bbox = tuple(float(v) for v in args.bbox.split(",")) if args.bbox else None
    old_root, new_root = Path(args.old), Path(args.new)
    old, new = tiles(old_root, zooms, bbox), tiles(new_root, zooms, bbox)

    added = sorted(new - old)
    removed = sorted(old - new)
    changed = sorted(r for r in (new & old)
                     if digest(new_root / r) != digest(old_root / r))

    counts = Counter()
    for label, group in (("added", added), ("changed", changed),
                         ("removed", removed)):
        counts[label] = len(group)
        by_zoom = Counter(r.split("/")[0] for r in group)
        detail = "  ".join(f"z{z}:{by_zoom[z]:,}" for z in sorted(by_zoom, key=int))
        print(f"{label:8} {len(group):7,}   {detail}")

    if args.upload_manifest:
        Path(args.upload_manifest).write_text(
            "".join(f"{r}\n" for r in added + changed))
        print(f"\nupload manifest -> {args.upload_manifest} "
              f"({len(added) + len(changed):,} tiles)")
    if args.remove_manifest:
        Path(args.remove_manifest).write_text("".join(f"{r}\n" for r in removed))
        print(f"remove manifest -> {args.remove_manifest} ({len(removed):,} tiles)")


if __name__ == "__main__":
    main()
