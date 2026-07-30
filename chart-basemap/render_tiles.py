#!/usr/bin/env python3
"""
Bluewater Intel proprietary fishing-chart basemap — tile renderer.

Renders styled bathymetric contour tiles (XYZ / Web Mercator, 256px PNG)
from a NetCDF bathymetry grid (ETOPO via ERDDAP, or any lat/lon grid).

Contours are in FATHOMS (US East Coast captain convention).
Style: dark navy fishing chart. The 100-fathom curve is the visual
anchor (brightest line) — that's the shelf break captains steer by.

Usage:
    python3 render_tiles.py --nc etopo_hatteras.nc --out tiles --zmin 5 --zmax 10
"""

import argparse
import io
import math
import os

import numpy as np
from PIL import Image
import matplotlib

matplotlib.use("Agg")
import matplotlib.patheffects
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from scipy.io import netcdf_file

# ---------------------------------------------------------------- style tokens
M_PER_FATHOM = 1.8288

STYLE = {
    # ocean depth ramp: shallow -> deep (dark navy family so translucent
    # SST / chlorophyll / Bite Map overlays at 60-80% opacity still read)
    "ocean_shallow": "#1E3A50",
    "ocean_mid": "#122740",
    "ocean_deep": "#080F1E",
    # land is secondary: dark moss slate, quiet
    "land": "#232823",
    "coastline": "#5C6E5C",
    # contour lines
    "minor_line": "#4E93A8",
    "mid_line": "#5FA8BC",
    "major_line": "#8FD3E4",
    # signature: the 100-fathom shelf-break curve, brightest thing on the chart
    "shelfbreak_line": "#C4F0FA",
    "label_color": "#AFE3EF",
    "label_halo": "#08101C",
}

# ---------------------------------------------------------------- contour ladder
# Anchor curves captains steer by: brightest, always drawn, always labeled.
MAJOR_FM = [100, 200, 500, 1000, 2000]
SHELFBREAK_FM = 100  # the shelf break: signature line of the whole chart
# Emphasis lines. Every value sits ON the minor ladder for its zoom, so
# emphasis never introduces an off-step line crowding its neighbours.
LEGACY_MID_FM = [50, 75, 250, 750, 1500]   # z<=10, unchanged from v1
FINE_MID_FM = [50, 75, 300, 400, 1500]     # z>=11

def _ladder(start, stop, step):
    return list(range(start, stop + 1, step))

def contour_levels_for_zoom(z):
    """(minor, mid, major) fathom levels for one zoom.

    Shelf steps tighten as you zoom because that's where the lumps, ledges and
    terraces live; slope steps stay wider so the lines don't merge into a solid
    band down the drop-off. Steps finer than 10 fm appear only at z>=11, where
    BlueTopo backs them — ETOPO is 1 arc-min (~1.8 km) and at 5 fm it would just
    draw smooth interpolation artifacts instead of real structure.

    Inside 30 fm the step halves again at z>=11. A 5 fm step is 30 ft of depth
    change, and across a broad gently-sloping inner shelf that can be miles of
    horizontal distance between lines: off Oregon Inlet the water runs 0.5-21 fm,
    so a 5 fm ladder can only ever draw four curves and leaves most of the area
    genuinely blank. 2 fm restores structure there without crowding the slope.

    z11 rather than z12 because that is the zoom the inner shelf is actually read
    at. Behind Hatteras the sound sits at a near-uniform 3 fm and the mid-shelf
    climbs 8-24 fm over ~45 km, so at 5 fm steps a z11 tile catches one line or
    none and the whole area reads as failed tiles. z10 goes to 5 fm for the same
    reason, but no finer: its tiles are ~8 km and 2 fm there is below what ETOPO
    can draw without turning quantization steps into false terraces.
    """
    if z <= 6:
        return [], [500, 1500], [100, 1000, 2000]
    if z <= 8:
        return [], LEGACY_MID_FM, MAJOR_FM
    if z == 9:
        # ETOPO tier — keep v1's spacing rather than regress a working look.
        minor, mid = [10, 20, 30, 40, 60, 80], LEGACY_MID_FM
    elif z == 10:
        minor, mid = (_ladder(5, 30, 5) + _ladder(40, 90, 10)
                      + _ladder(150, 450, 50)), LEGACY_MID_FM
    else:
        # z>=11: 2 fm inside 30 fm. A clean even ladder rather than 5 fm with
        # 2 fm interleaved — mixing them puts pairs of lines 1 fm apart, which
        # reads as a smudge. 10, 20 and 30 survive as the round anchors.
        minor = (_ladder(2, 30, 2) + _ladder(35, 95, 5)
                 + _ladder(120, 480, 20) + _ladder(600, 1900, 100))
        mid = FINE_MID_FM
    # A depth in an emphasis set must not also be drawn as a hairline.
    drop = set(mid) | set(MAJOR_FM)
    return [v for v in minor if v not in drop], mid, MAJOR_FM

def label_levels_for_zoom(z):
    """Which levels get a number. Deliberately sparser than the line set —
    every 5-fm line labeled would bury the chart in digits."""
    if z <= 6:
        return [100, 1000]
    if z <= 8:
        return [50, 75, 100, 500, 1000, 2000]
    if z <= 10:
        return [10, 20, 30, 40, 50, 60, 75, 80, 100,
                150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000]
    # z>=11: label the 10s across the shelf, then the anchors below it.
    return (_ladder(10, 90, 10)
            + [100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000])

# ---------------------------------------------------------------- mercator math
R = 6378137.0

def lonlat_to_merc(lon, lat):
    x = R * np.radians(lon)
    y = R * np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))
    return x, y

def tile_bounds_merc(z, x, y):
    n = 2 ** z
    world = 2 * math.pi * R
    x0 = -world / 2 + x * world / n
    x1 = x0 + world / n
    y1 = world / 2 - y * world / n
    y0 = y1 - world / n
    return x0, y0, x1, y1

def merc_to_lon(mx):
    return math.degrees(mx / R)

def merc_to_lat(my):
    return math.degrees(2 * math.atan(math.exp(my / R)) - math.pi / 2)

def lonlat_to_tile(lon, lat, z):
    n = 2 ** z
    xt = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(lat)
    yt = int((1.0 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2.0 * n)
    return xt, yt

# ---------------------------------------------------------------- data loading
def load_grid(path):
    f = netcdf_file(path, "r", mmap=False)
    lat = np.array(f.variables["latitude"][:], dtype=float)
    lon = np.array(f.variables["longitude"][:], dtype=float)
    z = np.array(f.variables["altitude"][:], dtype=float)  # meters, neg = depth
    f.close()
    if lat[0] > lat[-1]:
        lat = lat[::-1]
        z = z[::-1, :]
    return lon, lat, z

# ---------------------------------------------------------------- rendering
def make_ocean_cmap():
    return LinearSegmentedColormap.from_list(
        "bw_ocean",
        [STYLE["ocean_shallow"], STYLE["ocean_mid"], STYLE["ocean_deep"]],
    )

def fmt_fm(v):
    return f"{int(round(v))}"

TILE_PALETTE_COLORS = 64

def _save_tile(fig, path, transparent):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=100, transparent=transparent)
    buf.seek(0)
    img = Image.open(buf)
    if transparent:
        # Overlay tiles are flat-colour line art — a few line colours, their
        # halos, and the antialiased blend between them. A 64-entry palette is
        # visually lossless here and cuts them to roughly a fifth of 32-bit
        # RGBA, which is what pays for the finer contour ladder. FASTOCTREE is
        # the one Pillow quantizer that preserves the alpha channel.
        out = img.convert("RGBA").quantize(colors=TILE_PALETTE_COLORS,
                                           method=Image.FASTOCTREE)
    else:
        # Basemap tiles carry a smooth depth gradient, which visibly bands at a
        # small palette. Leave them truecolour.
        out = img.convert("RGB")
    out.save(path, optimize=True)
    buf.close()

def render_tile_merc(Xm, Ym, elev_m, z, xt, yt, out_dir, cmap, overlay=False,
                     max_depth_fm=None):
    """Render one tile from a Web-Mercator elevation grid (BlueTopo path)."""
    x0, y0, x1, y1 = tile_bounds_merc(z, xt, yt)

    depth_fm = np.where(elev_m < 0, -elev_m / M_PER_FATHOM, np.nan)
    land = elev_m >= 0
    if land.all():
        return False

    water = depth_fm[~np.isnan(depth_fm)]
    if water.size == 0:
        return False
    if max_depth_fm is not None and np.nanmin(water) > max_depth_fm:
        return False  # abyssal tile — skip

    fig = plt.figure(figsize=(2.56, 2.56), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.axis("off")

    # Overlay tiles ride on satellite imagery, so every line needs a dark halo
    # to stay legible. Size it from the line it wraps — a fixed wide stroke
    # visually swallows the thin 5-fathom hairlines.
    def halo_for(lw):
        if not overlay:
            return None
        return [matplotlib.patheffects.withStroke(
            linewidth=lw + 0.9, foreground="#000000CC")]
    if overlay:
        fig.patch.set_alpha(0)
    else:
        shade = np.sqrt(np.clip(depth_fm, 0, 2600) / 2600.0)
        ax.pcolormesh(Xm, Ym, np.ma.masked_invalid(shade),
                      cmap=cmap, vmin=0, vmax=1, shading="gouraud",
                      rasterized=True)
        if land.any():
            ax.contourf(Xm, Ym, land.astype(float), levels=[0.5, 1.5],
                        colors=[STYLE["land"]])
            ax.contour(Xm, Ym, elev_m, levels=[0], colors=[STYLE["coastline"]],
                       linewidths=0.9)

    minor, mid, major = contour_levels_for_zoom(z)
    def haloed(cs, lw):
        fx = halo_for(lw)
        if fx:
            cs.set_path_effects(fx)
        return cs

    # Only contour levels this tile actually spans. With a 5-fm shelf ladder
    # that's ~19 candidate levels, and an abyssal tile would otherwise pay for
    # 19 empty contour passes.
    lo, hi = float(np.nanmin(water)), float(np.nanmax(water))
    def spanned(levels):
        return sorted(v for v in levels if lo <= v <= hi)

    drawn = []
    minor_lv = spanned(minor)
    if minor_lv:
        drawn.append(haloed(ax.contour(Xm, Ym, depth_fm, levels=minor_lv,
                     colors=[STYLE["minor_line"]], linewidths=0.7), 0.7))
    mid_lv = spanned(mid)
    if mid_lv:
        drawn.append(haloed(ax.contour(Xm, Ym, depth_fm, levels=mid_lv,
                     colors=[STYLE["mid_line"]], linewidths=1.0), 1.0))
    major_lv = spanned(v for v in major if v != SHELFBREAK_FM)
    if major_lv:
        drawn.append(haloed(ax.contour(Xm, Ym, depth_fm, levels=major_lv,
                     colors=[STYLE["major_line"]], linewidths=1.3), 1.3))
    if lo <= SHELFBREAK_FM <= hi:
        drawn.append(haloed(ax.contour(Xm, Ym, depth_fm, levels=[SHELFBREAK_FM],
                     colors=[STYLE["shelfbreak_line"]], linewidths=1.9), 1.9))

    if not drawn and overlay:
        plt.close(fig)
        return False  # transparent overlay with no line on it — skip the tile

    lbl_levels = set(label_levels_for_zoom(z))
    for cs in drawn:
        lv = [l for l in cs.levels if l in lbl_levels]
        if not lv:
            continue
        texts = ax.clabel(cs, levels=lv, fmt=fmt_fm, fontsize=5.4,
                          inline=True, inline_spacing=2)
        for t in texts:
            t.set_color(STYLE["label_color"])
            t.set_path_effects([
                matplotlib.patheffects.withStroke(
                    linewidth=1.6, foreground=STYLE["label_halo"])])

    d = os.path.join(out_dir, str(z), str(xt))
    os.makedirs(d, exist_ok=True)
    _save_tile(fig, os.path.join(d, f"{yt}.png"), transparent=overlay)
    plt.close(fig)
    return True

def render_tile(lon, lat, depth_m, z, xt, yt, out_dir, cmap, overlay=False):
    x0, y0, x1, y1 = tile_bounds_merc(z, xt, yt)
    pad = (x1 - x0) * 0.30  # sample beyond tile so contours don't clip at edges

    lo_lon = merc_to_lon(x0 - pad)
    hi_lon = merc_to_lon(x1 + pad)
    lo_lat = merc_to_lat(y0 - pad)
    hi_lat = merc_to_lat(y1 + pad)

    ji = np.searchsorted(lon, [lo_lon, hi_lon])
    ii = np.searchsorted(lat, [lo_lat, hi_lat])
    j0, j1 = max(ji[0] - 2, 0), min(ji[1] + 2, len(lon))
    i0, i1 = max(ii[0] - 2, 0), min(ii[1] + 2, len(lat))
    if j1 - j0 < 3 or i1 - i0 < 3:
        return False

    sub_lon = lon[j0:j1]
    sub_lat = lat[i0:i1]
    sub_z = depth_m[i0:i1, j0:j1]

    LonG, LatG = np.meshgrid(sub_lon, sub_lat)
    Xm, Ym = lonlat_to_merc(LonG, LatG)
    return render_tile_merc(Xm, Ym, sub_z, z, xt, yt, out_dir, cmap,
                            overlay=overlay)

# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nc", required=True)
    ap.add_argument("--out", default="tiles")
    ap.add_argument("--zmin", type=int, default=5)
    ap.add_argument("--zmax", type=int, default=10)
    ap.add_argument("--overlay", action="store_true",
                    help="transparent contour-only overlay tiles")
    ap.add_argument("--bw", type=float, default=None, help="bbox west lon")
    ap.add_argument("--be", type=float, default=None, help="bbox east lon")
    ap.add_argument("--bs", type=float, default=None, help="bbox south lat")
    ap.add_argument("--bn", type=float, default=None, help="bbox north lat")
    args = ap.parse_args()

    lon, lat, depth = load_grid(args.nc)
    cmap = make_ocean_cmap()
    print(f"grid {depth.shape}, lon {lon.min():.2f}..{lon.max():.2f}, "
          f"lat {lat.min():.2f}..{lat.max():.2f}")

    bb_w = args.bw if args.bw is not None else lon.min()
    bb_e = args.be if args.be is not None else lon.max()
    bb_s = args.bs if args.bs is not None else lat.min()
    bb_n = args.bn if args.bn is not None else lat.max()
    total = 0
    for z in range(args.zmin, args.zmax + 1):
        xt0, yt1 = lonlat_to_tile(bb_w, bb_s, z)
        xt1, yt0 = lonlat_to_tile(bb_e, bb_n, z)
        n = 0
        for xt in range(xt0, xt1 + 1):
            for yt in range(yt0, yt1 + 1):
                if render_tile(lon, lat, depth, z, xt, yt, args.out, cmap,
                               overlay=args.overlay):
                    n += 1
        print(f"z{z}: {n} tiles")
        total += n
    print(f"done: {total} tiles -> {args.out}/")

if __name__ == "__main__":
    main()
