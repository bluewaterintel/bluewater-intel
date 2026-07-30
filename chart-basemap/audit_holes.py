#!/usr/bin/env python3
"""Find tiles that should exist but don't.

z11, z12 and z13 all draw the same fine contour ladder, so a line crossing a
z13 tile must also cross its z12 parent. Any parent missing while a child
exists is a hole in the tileset, not an empty stretch of seabed.
"""
import math
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent / "tiles_overlay"


def existing(z):
    d = ROOT / str(z)
    if not d.is_dir():
        return set()
    out = set()
    for xd in d.iterdir():
        if not xd.is_dir():
            continue
        try:
            x = int(xd.name)
        except ValueError:
            continue
        for p in xd.glob("*.png"):
            try:
                out.add((x, int(p.stem)))
            except ValueError:
                pass
    return out


def tile_to_lonlat(z, x, y):
    n = 2.0 ** z
    lon = x / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon, lat


def main():
    sets = {z: existing(z) for z in (10, 11, 12, 13)}
    for z in sorted(sets):
        print(f"z{z}: {len(sets[z]):,} tiles")
    print()

    for child_z in (13, 12):
        parent_z = child_z - 1
        want = {(x // 2, y // 2) for (x, y) in sets[child_z]}
        holes = want - sets[parent_z]
        print(f"z{parent_z}: {len(holes):,} holes "
              f"(of {len(want):,} implied by z{child_z} children)")
        if not holes:
            continue
        # Cluster holes by rough region so the output is readable.
        by_region = defaultdict(list)
        for (x, y) in sorted(holes):
            lon, lat = tile_to_lonlat(parent_z, x, y)
            by_region[(round(lon), round(lat))].append((x, y))
        top = sorted(by_region.items(), key=lambda kv: -len(kv[1]))[:12]
        for (lon, lat), ts in top:
            print(f"    {len(ts):5d} holes near lon {lon:>5}, lat {lat:>3}"
                  f"   e.g. {parent_z}/{ts[0][0]}/{ts[0][1]}")
        print()


if __name__ == "__main__":
    main()
