#!/usr/bin/env python3
"""Recolour the major depth contours (200/500/1000/2000 fm) in built tiles.

The 100 fm shelfbreak is drawn near-white and the other majors in a pale cyan
that also reads as white, so the slope came out with two white lines running
side by side and no way to tell which one is the shelf break. This shifts the
other majors to a cooler blue, leaving 100 fm as the only white anchor.

Doing it by re-rendering is not possible for BlueTopo-derived tiles — the source
rasters were discarded after the build. But overlay tiles are 64-entry palette
PNGs, so the colour lives in the palette: rewrite the entries that belong to the
major-line ramp and every pixel using them follows, with alpha untouched (it is
stored per index in a separate tRNS table).

Quantization moves colours by up to ~25, which is close to the gap between the
major and label colours, so a plain distance threshold would catch labels too.
Instead classify each palette entry by which style colour it is nearest to and
rewrite only the ones that belong to major.
"""
import argparse
import shutil
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
SERVED = HERE / "tiles_overlay"

OLD_MAJOR = (0x8F, 0xD3, 0xE4)
NEW_MAJOR = (0x62, 0xBE, 0xE8)

# Every colour the renderer can put on an overlay tile. An entry is rewritten
# only when major is its nearest neighbour here, so labels, the shelfbreak and
# the thinner lines keep their own ramps.
CENTROIDS = {
    "minor": (0x4E, 0x93, 0xA8),
    "mid": (0x5F, 0xA8, 0xBC),
    "major": OLD_MAJOR,
    # The replacement colour is its own centroid so a second pass leaves already
    # converted tiles alone. Without it NEW_MAJOR lands almost exactly between
    # major and mid, and a re-run could shift it again.
    "major_done": NEW_MAJOR,
    "shelfbreak": (0xC4, 0xF0, 0xFA),
    "label": (0xAF, 0xE3, 0xEF),
    "halo": (0x00, 0x00, 0x00),
    "halo_blend": (0x08, 0x10, 0x1C),
}


def classify(rgb):
    best, bestd = None, None
    for name, c in CENTROIDS.items():
        d = sum((rgb[i] - c[i]) ** 2 for i in range(3))
        if bestd is None or d < bestd:
            best, bestd = name, d
    return best, bestd ** 0.5


def recolor_file(args):
    rel, apply_it = args
    p = SERVED / rel
    try:
        im = Image.open(p)
    except Exception as exc:
        return rel, "error", str(exc)

    if im.mode == "P":
        pal = im.getpalette()
        if not pal:
            return rel, "no_palette", None
        hits = []
        for i in range(len(pal) // 3):
            rgb = tuple(pal[3 * i:3 * i + 3])
            name, _ = classify(rgb)
            if name == "major":
                hits.append(i)
        if not hits:
            return rel, "unchanged", None
        # A palette can carry an entry no pixel uses. Rewriting those changes the
        # file without changing the picture, which would mean re-uploading tens of
        # thousands of tiles for nothing.
        hist = im.histogram()
        used = sum(hist[i] for i in hits)
        if used < 4:
            return rel, "unused_entry", None
        if apply_it:
            newpal = list(pal)
            for i in hits:
                # Preserve how far this entry sits along the line's own ramp:
                # a half-covered edge pixel should stay half-strength after the
                # shift, otherwise antialiased edges harden.
                rgb = tuple(pal[3 * i:3 * i + 3])
                f = max(rgb[1] / max(OLD_MAJOR[1], 1), 0.0)
                for k in range(3):
                    newpal[3 * i + k] = min(255, int(round(NEW_MAJOR[k] * f)))
            im.putpalette(newpal)
            tr = im.info.get("transparency")
            save_kw = {"optimize": True}
            if tr is not None:
                save_kw["transparency"] = tr
            im.save(p, format="PNG", **save_kw)
        return rel, "recolored", len(hits)

    if im.mode == "RGBA":
        import numpy as np
        a = np.asarray(im).astype(int).copy()
        rgb = a[:, :, :3]
        d = {}
        for name, c in CENTROIDS.items():
            d[name] = ((rgb - np.array(c)) ** 2).sum(axis=2)
        names = list(d)
        stack = np.stack([d[n] for n in names], axis=0)
        nearest = stack.argmin(axis=0)
        mask = (nearest == names.index("major")) & (a[:, :, 3] > 0)
        if not mask.any():
            return rel, "unchanged", None
        if apply_it:
            f = np.clip(rgb[:, :, 1] / max(OLD_MAJOR[1], 1), 0, None)
            for k in range(3):
                a[:, :, k] = np.where(mask,
                                      np.minimum(255, (NEW_MAJOR[k] * f).round()),
                                      a[:, :, k])
            Image.fromarray(a.astype("uint8"), "RGBA").save(p, optimize=True)
        return rel, "recolored", int(mask.sum())

    return rel, f"skip_mode_{im.mode}", None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zooms", default="5,6,7,8,9,10,11,12,13")
    ap.add_argument("--jobs", type=int, default=10)
    ap.add_argument("--manifest", default="recolor_manifest.txt")
    ap.add_argument("--limit", type=int, default=0, help="only the first N tiles")
    ap.add_argument("--only", default="", help="comma-separated z/x/y.png to do")
    ap.add_argument("--backup", default="", help="copy touched tiles here first")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    if args.only:
        rels = [s.strip() for s in args.only.split(",") if s.strip()]
    else:
        rels = []
        for z in args.zooms.split(","):
            zd = SERVED / z.strip()
            if zd.is_dir():
                rels += [str(p.relative_to(SERVED)) for p in zd.rglob("*.png")]
        rels.sort()
        if args.limit:
            rels = rels[:args.limit]
    print(f"scanning {len(rels):,} tiles")

    if args.backup and args.apply:
        Path(args.backup).mkdir(parents=True, exist_ok=True)

    stats = Counter()
    changed = []
    with Pool(args.jobs) as pool:
        for i, (rel, verdict, extra) in enumerate(
                pool.imap_unordered(recolor_file,
                                    ((r, False) for r in rels),
                                    chunksize=128), 1):
            stats[verdict] += 1
            if verdict == "recolored":
                changed.append(rel)
            if i % 40000 == 0:
                print(f"  scanned {i:,}/{len(rels):,}")

    print("\nscan result:")
    for k, v in stats.most_common():
        print(f"  {k:18} {v:,}")
    print(f"  {'to recolour':18} {len(changed):,}")

    if not args.apply:
        print("\ndry run — nothing written. re-run with --apply")
        return

    if args.backup:
        for rel in changed:
            dst = Path(args.backup) / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(SERVED / rel, dst)
        print(f"backed up {len(changed):,} tiles to {args.backup}")

    done = Counter()
    with Pool(args.jobs) as pool:
        for rel, verdict, extra in pool.imap_unordered(
                recolor_file, ((r, True) for r in changed), chunksize=128):
            done[verdict] += 1
    print("apply result:", dict(done))
    Path(args.manifest).write_text("".join(f"{r}\n" for r in sorted(changed)))
    print(f"manifest -> {args.manifest} ({len(changed):,} tiles)")


if __name__ == "__main__":
    main()
