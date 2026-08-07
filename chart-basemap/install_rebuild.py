#!/usr/bin/env python3
"""Composite the rebuilt z10-z13 tiles into the served set and emit manifests.

Layering, lowest first:
  1. etopo_fill_v4  — ETOPO gap-fill, z11-z13
  2. bt_v2          — BlueTopo survey detail, z10-z13, wins wherever it exists

A tile that is currently published but produced by neither would otherwise be
left at its old contents, so any survivor is re-rendered from ETOPO. That
matters because the old tiles are exactly the ones carrying the false contours
this rebuild exists to remove.

Diffing against the pre-install snapshot gives the upload set (changed or new)
and the delete set (published but no longer produced).
"""
import argparse
import hashlib
import json
import shutil
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVED = HERE / "tiles_overlay"

_G = {}


def _init(nc):
    import render_tiles as R
    _G["R"] = R
    _G["grid"] = R.load_grid(nc)
    _G["cmap"] = R.make_ocean_cmap()
    _G["out"] = str(HERE / "bluetopo_work" / "etopo_gapfill")


def _render_gap(key):
    z, x, y = key.replace(".png", "").split("/")
    R = _G["R"]
    lon, lat, depth = _G["grid"]
    try:
        ok = R.render_tile(lon, lat, depth, int(z), int(x), int(y), _G["out"],
                           _G["cmap"], overlay=True)
    except Exception:
        return key, False
    return key, bool(ok)


def md5(p):
    return hashlib.md5(p.read_bytes()).hexdigest()


def _md5_key(args):
    key, path = args
    return key, md5(Path(path))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", required=True)
    ap.add_argument("--nc", default=str(HERE / "etopo_conus.nc"))
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    snapshot = json.loads(Path(args.snapshot).read_text())
    print(f"snapshot: {len(snapshot):,} published tiles z10-z13")

    sources = {}
    fill = HERE / "bluetopo_work" / "etopo_fill_v4"
    for p in fill.rglob("*.png"):
        sources[p.relative_to(fill).as_posix()] = p
    print(f"  etopo_fill_v4: {len(sources):,}")

    bt = HERE / "bluetopo_work" / "bt_v2"
    n_bt = 0
    for p in bt.rglob("*.png"):
        sources[p.relative_to(bt).as_posix()] = p
        n_bt += 1
    print(f"  bt_v2 (BlueTopo, wins): {n_bt:,}")
    print(f"  combined: {len(sources):,}")

    gaps = sorted(set(snapshot) - set(sources))
    print(f"  published but unproduced: {len(gaps):,} -> re-render from ETOPO")

    if gaps:
        gapdir = HERE / "bluetopo_work" / "etopo_gapfill"
        drawn = 0
        with Pool(args.jobs, initializer=_init, initargs=(args.nc,)) as pool:
            for i, (key, ok) in enumerate(
                    pool.imap_unordered(_render_gap, gaps, chunksize=64), 1):
                if ok:
                    sources[key] = gapdir / key
                    drawn += 1
                if i % 20000 == 0:
                    print(f"    {i:,}/{len(gaps):,}", flush=True)
        print(f"  gap-fill drew {drawn:,} of {len(gaps):,}")

    print(f"final produced set: {len(sources):,}")

    print("hashing produced tiles…")
    new_hashes = {}
    with Pool(args.jobs) as pool:
        items = [(k, str(v)) for k, v in sources.items()]
        for i, (k, d) in enumerate(pool.imap_unordered(_md5_key, items, chunksize=512), 1):
            new_hashes[k] = d
            if i % 50000 == 0:
                print(f"  {i:,}", flush=True)

    upload = sorted(k for k, d in new_hashes.items() if snapshot.get(k) != d)
    delete = sorted(set(snapshot) - set(new_hashes))
    print(f"\nchanged or new : {len(upload):,}")
    print(f"to delete      : {len(delete):,}")
    print(f"unchanged      : {len(new_hashes) - len(upload):,}")

    Path(HERE / "rebuild_upload_manifest.txt").write_text(
        "".join(f"{k}\n" for k in upload))
    Path(HERE / "rebuild_delete_manifest.txt").write_text(
        "".join(f"{k}\n" for k in delete))
    print("manifests: rebuild_upload_manifest.txt, rebuild_delete_manifest.txt")

    if not args.apply:
        print("\ndry run — re-run with --apply to install into tiles_overlay")
        return

    for k in upload:
        dst = SERVED / k
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(sources[k], dst)
    for k in delete:
        (SERVED / k).unlink(missing_ok=True)
    print(f"\ninstalled {len(upload):,} tiles, removed {len(delete):,} into {SERVED}")


if __name__ == "__main__":
    main()
