#!/usr/bin/env python3
"""Install refreshed ETOPO fill without clobbering good BlueTopo detail.

After refresh_etopo_fill.py + repair_gaps.py, this copies:

  - every tile in the repair manifest (partial survey / sparse holes)
  - every served tile whose bytes matched the OLD etopo fill (pure ETOPO)

BlueTopo tiles (served != old fill) are left alone.
"""
import argparse
import shutil
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--served", default="tiles_overlay")
    ap.add_argument("--new-fill", default="bluetopo_work/etopo_fill_v2")
    ap.add_argument("--old-fill", default="bluetopo_work/etopo_fill")
    ap.add_argument("--manifest", default="repair_manifest.txt")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    served = Path(args.served)
    new_fill = Path(args.new_fill)
    old_fill = Path(args.old_fill)
    manifest = []
    if Path(args.manifest).is_file():
        manifest = [ln.strip() for ln in Path(args.manifest).read_text().splitlines() if ln.strip()]
    manifest_set = set(manifest)

    plan = {"manifest": 0, "etopo_refresh": 0, "skip_bluetopo": 0, "missing_new": 0}
    written = []

    for rel in manifest:
        src = new_fill / rel
        if not src.is_file():
            plan["missing_new"] += 1
            continue
        plan["manifest"] += 1
        written.append(rel)

    if old_fill.is_dir() and new_fill.is_dir():
        for p in old_fill.rglob("*.png"):
            rel = str(p.relative_to(old_fill))
            if rel in manifest_set:
                continue
            sp = served / rel
            if not sp.is_file():
                continue
            if sp.read_bytes() != p.read_bytes():
                plan["skip_bluetopo"] += 1
                continue
            src = new_fill / rel
            if not src.is_file():
                plan["missing_new"] += 1
                continue
            if sp.read_bytes() == src.read_bytes():
                continue
            plan["etopo_refresh"] += 1
            written.append(rel)

    print("install plan:")
    for k, v in plan.items():
        print(f"  {k:16} {v:,}")
    print(f"  {'to write':16} {len(written):,}")

    if not args.apply:
        print("\ndry run — nothing written. re-run with --apply")
        return

    for rel in sorted(set(written)):
        src = new_fill / rel
        dst = served / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    out_manifest = Path("merge_manifest.txt")
    out_manifest.write_text("".join(f"{r}\n" for r in sorted(set(written))))
    print(f"\ninstalled {len(set(written)):,} tiles; manifest -> {out_manifest}")


if __name__ == "__main__":
    main()
