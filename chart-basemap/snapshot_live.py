#!/usr/bin/env python3
"""Hash the published tileset so a rebuild can produce an exact upload manifest.

Re-uploading every tile after a rebuild costs hours of egress; uploading too few
leaves stale contours live. Diffing against this snapshot gives both the changed
set and the set that must be deleted.
"""
import argparse
import hashlib
import json
from multiprocessing import Pool
from pathlib import Path

SERVED = Path(__file__).resolve().parent / "tiles_overlay"


def _hash(key):
    return key, hashlib.md5((SERVED / key).read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zmin", type=int, default=10)
    ap.add_argument("--zmax", type=int, default=13)
    ap.add_argument("--out", required=True)
    ap.add_argument("--jobs", type=int, default=6)
    args = ap.parse_args()

    keys = [p.relative_to(SERVED).as_posix() for p in SERVED.rglob("*.png")
            if args.zmin <= int(p.relative_to(SERVED).parts[0]) <= args.zmax]
    print(f"hashing {len(keys):,} tiles z{args.zmin}-{args.zmax}", flush=True)

    out = {}
    with Pool(args.jobs) as pool:
        for i, (k, d) in enumerate(pool.imap_unordered(_hash, keys, chunksize=512), 1):
            out[k] = d
            if i % 50000 == 0:
                print(f"  {i:,}", flush=True)
    Path(args.out).write_text(json.dumps(out))
    print(f"wrote {len(out):,} hashes -> {args.out}", flush=True)


if __name__ == "__main__":
    main()
