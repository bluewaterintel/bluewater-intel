#!/usr/bin/env python3
"""Stitch served vs ETOPO-fill tiles side by side over a dark backdrop so the
transparent line art is visible."""
import argparse
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
SETS = {
    "served": HERE / "tiles_overlay",
    "fill": HERE / "bluetopo_work" / "etopo_fill",
}
BG = (12, 28, 44)
T = 256


def mosaic(root, z, x0, y0, nx, ny):
    im = Image.new("RGB", (nx * T, ny * T), BG)
    for i in range(nx):
        for j in range(ny):
            p = root / str(z) / str(x0 + i) / f"{y0 + j}.png"
            if not p.exists():
                # mark absent tiles so they read differently from empty ones
                for px in range(0, T, 16):
                    for py in range(0, T, 16):
                        im.putpixel((i * T + px, j * T + py), (90, 40, 40))
                continue
            im.paste(Image.open(p).convert("RGBA"),
                     (i * T, j * T), Image.open(p).convert("RGBA"))
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--z", type=int, required=True)
    ap.add_argument("--x", type=int, required=True)
    ap.add_argument("--y", type=int, required=True)
    ap.add_argument("--nx", type=int, default=3)
    ap.add_argument("--ny", type=int, default=3)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    panels = [mosaic(SETS[k], args.z, args.x, args.y, args.nx, args.ny)
              for k in ("served", "fill")]
    gap = 12
    w = panels[0].width * 2 + gap
    out = Image.new("RGB", (w, panels[0].height), (0, 0, 0))
    out.paste(panels[0], (0, 0))
    out.paste(panels[1], (panels[0].width + gap, 0))
    out.save(args.out)
    print(f"wrote {args.out}  (left = served / what the app shows, "
          f"right = ETOPO fill)")


if __name__ == "__main__":
    main()
