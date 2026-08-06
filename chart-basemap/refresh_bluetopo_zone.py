#!/usr/bin/env python3
"""Re-render BlueTopo tiles for one zone and install into tiles_overlay.

Use after render-policy changes (overview ladder at z10, shelfbreak fix,
wider pad at z12+). Writes only into the zone bbox; does not touch ETOPO
gap-fill tiles outside it.

Usage:
  python3 refresh_bluetopo_zone.py --zone hatteras
  python3 refresh_bluetopo_zone.py --tif ../bluetopo_work/hatteras_3857.tif \\
      --label hatteras --zmin 10 --zmax 13 --apply
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BLUETOPO = HERE / "bluetopo"
WORK = HERE / "bluetopo_work"
SERVED = HERE / "tiles_overlay"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zone", help="zone name from zones.py (requires fetched tif)")
    ap.add_argument("--tif", help="EPSG:3857 GeoTIFF path")
    ap.add_argument("--label", default=None, help="manifest label prefix")
    ap.add_argument("--zmin", type=int, default=8)
    ap.add_argument("--zmax", type=int, default=13)
    ap.add_argument("--out", default=str(WORK / "zone_refresh"))
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    label = args.label or args.zone or Path(args.tif).stem
    tif = args.tif
    if args.zone:
        tif = str(WORK / f"{args.zone}_3857.tif")
        if not Path(tif).is_file():
            sys.exit(f"missing {tif} — run fetch_bluetopo.py --zone {args.zone} first")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, str(BLUETOPO / "render_bluetopo.py"),
        "--tif", tif,
        "--out", str(out),
        "--overlay",
        "--zmin", str(args.zmin),
        "--zmax", str(args.zmax),
    ]
    print(" ".join(cmd))
    subprocess.check_call(cmd, cwd=str(BLUETOPO))

    manifest = HERE / f"refresh_{label}_manifest.txt"
    written = []
    for p in sorted(out.rglob("*.png")):
        rel = str(p.relative_to(out))
        written.append(rel)
    manifest.write_text("".join(f"{r}\n" for r in written))
    print(f"rendered {len(written):,} tiles -> {manifest}")

    if not args.apply:
        print("dry run — re-run with --apply to install into tiles_overlay")
        return

    for rel in written:
        src, dst = out / rel, SERVED / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    print(f"installed {len(written):,} tiles into {SERVED}")


if __name__ == "__main__":
    main()
