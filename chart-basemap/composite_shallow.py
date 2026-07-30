#!/usr/bin/env python3
"""Add the newly-introduced shallow contours to BlueTopo tiles.

rerender_shallow.py can only replace ETOPO-derived tiles, because the BlueTopo
source rasters were discarded after the build. That leaves BlueTopo tiles still
carrying the old coarse ladder, which is most of the inner shelf.

Rather than throw away that detail, render ONLY the depth levels the new ladder
added and composite them on top. Those levels are by definition absent from the
existing tile, so no line can be drawn twice — the BlueTopo lines survive
untouched and the shallow gaps fill in.

The added lines come from ETOPO, so they are smoother than their BlueTopo
neighbours. That is a visible difference in line character, but a far smaller
one than a blank shelf.
"""
import argparse
import io
import math
import sys
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

SERVED = HERE / "tiles_overlay"
OLD_FILL = HERE / "bluetopo_work" / "etopo_fill"

# Levels the new ladder added at each zoom. Hardcoded against the ladder this
# change replaced: z10 went from 10 fm steps to 5 fm inside 30, z11 from 5 fm
# steps to 2 fm inside 30.
DELTA = {
    10: [5, 15, 25],
    11: [2, 4, 6, 8, 12, 14, 16, 18, 22, 24, 26, 28],
}

_G = {}


def _init(nc_path, out_dir):
    import render_tiles as R
    lon, lat, depth = R.load_grid(nc_path)
    _G.update(R=R, grid=(lon, lat, depth), cmap=R.make_ocean_cmap(), out=out_dir)
    # Draw only the added levels, as plain hairlines, and label none of them:
    # the anchor labels already live on the tile underneath.
    _G["orig_levels"] = R.contour_levels_for_zoom
    _G["orig_labels"] = R.label_levels_for_zoom
    R.contour_levels_for_zoom = lambda z: (DELTA.get(z, []), [], [])
    R.label_levels_for_zoom = lambda z: []


def _render_delta(job):
    z, x, y = job
    R = _G["R"]
    lon, lat, depth = _G["grid"]
    try:
        ok = R.render_tile(lon, lat, depth, z, x, y, _G["out"], _G["cmap"],
                           overlay=True)
    except Exception as exc:
        return (f"{z}/{x}/{y}.png", False, str(exc))
    return (f"{z}/{x}/{y}.png", bool(ok), None)


def find_bluetopo_tiles(new_root, zooms):
    """Live tiles that came from BlueTopo: they match neither the fresh ETOPO
    render nor the old ETOPO fill tile."""
    out = []
    for z in zooms:
        zd = SERVED / str(z)
        if not zd.is_dir():
            continue
        for xd in sorted(zd.iterdir()):
            if not xd.is_dir():
                continue
            for p in xd.glob("*.png"):
                rel = f"{z}/{xd.name}/{p.stem}.png"
                live = p.read_bytes()
                new = new_root / rel
                if new.exists() and live == new.read_bytes():
                    continue                      # already ETOPO
                old = OLD_FILL / rel
                if old.exists() and live == old.read_bytes():
                    continue                      # ETOPO, unchanged
                out.append(rel)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nc", default=str(HERE / "etopo_conus.nc"))
    ap.add_argument("--new", default=str(HERE / "bluetopo_work" / "etopo_shallow"),
                    help="fresh full-ladder ETOPO render, to identify BlueTopo tiles")
    ap.add_argument("--out", default=str(HERE / "bluetopo_work" / "etopo_delta"))
    ap.add_argument("--zooms", default="10,11")
    ap.add_argument("--jobs", type=int, default=10)
    ap.add_argument("--manifest", default="composite_manifest.txt")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    zooms = [int(v) for v in args.zooms.split(",")]
    targets = find_bluetopo_tiles(Path(args.new), zooms)
    print(f"BlueTopo-derived live tiles at z{args.zooms}: {len(targets):,}")
    jobs = []
    for rel in targets:
        z, x, y = rel.replace(".png", "").split("/")
        jobs.append((int(z), int(x), int(y)))

    drawn = []
    errors = []
    with Pool(args.jobs, initializer=_init, initargs=(args.nc, args.out)) as pool:
        for i, (rel, ok, err) in enumerate(
                pool.imap_unordered(_render_delta, jobs, chunksize=32), 1):
            if ok:
                drawn.append(rel)
            if err:
                errors.append((rel, err))
            if i % 1000 == 0:
                print(f"  {i:,}/{len(jobs):,}  {len(drawn):,} with added lines")
    print(f"tiles with lines to add: {len(drawn):,}")
    if errors:
        print(f"  {len(errors)} errors, e.g. {errors[0]}")

    if not args.apply:
        print("\ndry run — nothing written. re-run with --apply")
        return

    delta_root = Path(args.out)
    stats = Counter()
    written = []
    for rel in sorted(drawn):
        base = Image.open(SERVED / rel).convert("RGBA")
        add = Image.open(delta_root / rel).convert("RGBA")
        merged = Image.alpha_composite(base, add)
        # Match how the build stores overlays: 64-colour palette, alpha kept.
        q = merged.quantize(colors=64, method=Image.FASTOCTREE)
        buf = io.BytesIO()
        q.save(buf, format="PNG", optimize=True)
        (SERVED / rel).write_bytes(buf.getvalue())
        written.append(rel)
        stats["composited"] += 1
    Path(args.manifest).write_text("".join(f"{r}\n" for r in written))
    print(f"\ncomposited {stats['composited']:,} tiles; "
          f"manifest -> {args.manifest}")


if __name__ == "__main__":
    main()
