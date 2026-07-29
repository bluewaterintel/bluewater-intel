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
import math
import os

import numpy as np
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
    "minor_line": "#3E7E93",
    "mid_line": "#5FA8BC",
    "major_line": "#8FD3E4",
    # signature: the 100-fathom shelf-break curve, brightest thing on the chart
    "shelfbreak_line": "#C4F0FA",
    "label_color": "#AFE3EF",
    "label_halo": "#08101C",
}

# contour sets by zoom (fathoms)
MINOR_FM = [10, 20, 30, 40, 60, 80]
MID_FM = [50, 75, 250, 750, 1500]  # 50 & 75 = mid-shelf structure pair
MAJOR_FM = [100, 200, 500, 1000, 2000]
SHELFBREAK_FM = 100  # emphasized + always labeled

def contour_levels_for_zoom(z):
    if z <= 6:
        return [], [500, 1500], [100, 1000, 2000]
    if z <= 8:
        return [], [50, 75, 250, 750, 1500], MAJOR_FM
    return MINOR_FM, MID_FM, MAJOR_FM

def label_levels_for_zoom(z):
    if z <= 6:
        return [100, 1000]
    if z <= 8:
        return [50, 75, 100, 500, 1000, 2000]
    return [10, 20, 30, 50, 75, 100, 200, 500, 1000, 1500, 2000]

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

    depth_fm = np.where(sub_z < 0, -sub_z / M_PER_FATHOM, np.nan)  # positive fathoms
    land = sub_z >= 0
    if land.all():
        return False  # pure-land tile: nothing to chart

    fig = plt.figure(figsize=(2.56, 2.56), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.axis("off")

    halo = []
    if overlay:
        # transparent overlay: contour lines only, haloed for satellite legibility
        fig.patch.set_alpha(0)
        halo = [matplotlib.patheffects.withStroke(
            linewidth=2.6, foreground="#000000CC")]
    else:
        # ocean depth shading (sqrt ramp so shelf detail isn't crushed by abyss)
        shade = np.sqrt(np.clip(depth_fm, 0, 2600) / 2600.0)
        ax.pcolormesh(Xm, Ym, np.ma.masked_invalid(shade),
                      cmap=cmap, vmin=0, vmax=1, shading="gouraud",
                      rasterized=True)
        if land.any():
            ax.contourf(Xm, Ym, land.astype(float), levels=[0.5, 1.5],
                        colors=[STYLE["land"]])
            ax.contour(Xm, Ym, sub_z, levels=[0], colors=[STYLE["coastline"]],
                       linewidths=0.9)

    minor, mid, major = contour_levels_for_zoom(z)
    def haloed(cs):
        if halo:
            cs.set_path_effects(halo)  # mpl>=3.8: ContourSet is a single artist
        return cs

    if minor:
        haloed(ax.contour(Xm, Ym, depth_fm, levels=sorted(minor),
                   colors=[STYLE["minor_line"]], linewidths=0.45, alpha=0.85))
    if mid:
        haloed(ax.contour(Xm, Ym, depth_fm, levels=sorted(mid),
                   colors=[STYLE["mid_line"]], linewidths=0.7, alpha=0.95))

    major_plain = sorted(v for v in major if v != SHELFBREAK_FM)
    cs_major = None
    if major_plain:
        cs_major = haloed(ax.contour(Xm, Ym, depth_fm, levels=major_plain,
                              colors=[STYLE["major_line"]], linewidths=1.0))
    # signature line: the 100-fathom shelf break
    cs_shelf = haloed(ax.contour(Xm, Ym, depth_fm, levels=[SHELFBREAK_FM],
                          colors=[STYLE["shelfbreak_line"]], linewidths=1.6))

    # depth labels (fathoms) on labeled levels for this zoom
    lbl_levels = set(label_levels_for_zoom(z))
    for cs in (cs_major, cs_shelf):
        if cs is None:
            continue
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
    fig.savefig(os.path.join(d, f"{yt}.png"), dpi=100,
                transparent=overlay)
    plt.close(fig)
    return True

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
