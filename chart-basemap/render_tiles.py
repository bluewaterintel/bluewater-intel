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
from scipy.ndimage import gaussian_filter
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
    # Cooler and darker than the shelfbreak on purpose. At #8FD3E4 the 200 fm
    # line read as white, so the slope showed two white lines side by side with
    # nothing to say which one was the shelf break. 100 fm is the only white.
    "major_line": "#62BEE8",
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
OVERVIEW_MINOR_FM = [20, 40, 60, 80]   # z9 shelf steps
# WGS84 bboxes (west, south, east, north) where ETOPO carries false deep pockets
# in sounds — 100 fm shelf segments here are always spurious.
SOUND_SHELF_EXCLUSIONS = [
    (-77.2, 34.7, -75.3, 36.0),   # Pamlico / Albemarle / Roanoke sounds
    (-76.8, 36.8, -75.8, 37.5),   # Chesapeake mouth / lower bay
    (-76.5, 38.8, -75.2, 39.6),   # Delaware Bay
]

def _ladder(start, stop, step):
    return list(range(start, stop + 1, step))

def contour_levels_for_zoom(z, source="etopo"):
    """(minor, mid, major) fathom levels for one zoom.

    source="bluetopo" — survey-grade grid.
    source="etopo"    — 1 arc-min (~1.8 km).

    ETOPO cannot resolve 5–10 fm hairlines; drawing them at z8–z10 produces
    the jagged 70/80/90 fm artifacts off Nantucket and Hatteras. Overview
    zooms use 20 fm shelf steps plus coarsened grid smoothing instead.
    """
    if z <= 6:
        return [], [500, 1500], [100, 1000, 2000]
    if z <= 8:
        return [], [50, 75], MAJOR_FM
    if z == 9:
        drop = set([50, 75]) | set(MAJOR_FM)
        minor = [v for v in OVERVIEW_MINOR_FM if v not in drop]
        return minor, [50, 75], MAJOR_FM
    if source == "bluetopo" and z >= 11:
        minor = (_ladder(5, 95, 5) + _ladder(120, 480, 20)
                 + _ladder(600, 1900, 100))
        mid = FINE_MID_FM
    elif z == 10:
        # One step coarser than z11 so zooming in adds lines rather than
        # redrawing the shelf with different geometry.
        minor, mid = _ladder(10, 90, 10) + _ladder(150, 450, 50), LEGACY_MID_FM
    elif z >= 11:
        # ETOPO gap-fill at z11–13.
        minor, mid = (_ladder(5, 30, 5) + _ladder(40, 90, 10)
                      + _ladder(150, 450, 50)), LEGACY_MID_FM
    else:
        minor, mid = [], [50, 75]
    drop = set(mid) | set(MAJOR_FM)
    return [v for v in minor if v not in drop], mid, MAJOR_FM


SHELF_COARSE_PX = 96  # only used at z<=8 — z9+ keeps full-res shelf break
OVERVIEW_COARSE_PX = 64
# ETOPO invents isolated deep cells inside estuaries, which contour as small
# closed rings. The real shelf break is a long open curve, so reject by shape
# instead of by depth masking — masking ate the curve wherever the slope is steep.
SHELF_RING_MAX_SPAN_M = 12000


def _coarsen_grid(Xm, Ym, field, target=SHELF_COARSE_PX):
    h, w = field.shape
    if min(h, w) <= target:
        return Xm, Ym, field
    sy = max(1, h // target)
    sx = max(1, w // target)
    return Xm[::sy, ::sx], Ym[::sy, ::sx], field[::sy, ::sx]


def _smooth_masked(field, sigma):
    """Gaussian smooth that keeps masked cells masked.

    Filling NaN with a sentinel before smoothing makes the field leap from real
    depth to the sentinel across every mask edge (land, the shallow cut, BlueTopo
    nodata footprints). The tracer then draws EVERY level in between along that
    edge — the false right-angle line bundles seen offshore. Normalising by a
    smoothed validity mask keeps the blur inside real data.
    """
    valid = np.isfinite(field)
    if not valid.any():
        return field
    num = gaussian_filter(np.where(valid, field, 0.0), sigma=sigma)
    den = gaussian_filter(valid.astype(float), sigma=sigma)
    out = np.divide(num, den, out=np.full(num.shape, np.nan), where=den > 1e-6)
    out[~valid] = np.nan
    return out


def _shelfbreak_grid(Xm, Ym, depth_fm, z):
    """Grid for the 100 fm signature line.

    Contours the true bathymetry. Any masking here changes the curve's geometry,
    and because each zoom samples a different window it changed it by a different
    amount — that is what made the shelf break disagree between zoom levels.
    """
    field = depth_fm.astype(float)
    if z <= 8:
        Xm, Ym, field = _coarsen_grid(Xm, Ym, field, target=SHELF_COARSE_PX)
        field = _smooth_masked(field, sigma=0.8)
    return Xm, Ym, field


def _is_small_ring(seg):
    """Closed loop too small to be the shelf break — an ETOPO estuary artifact."""
    if len(seg) < 4:
        return False
    closed = (abs(seg[0][0] - seg[-1][0]) < 1.0 and abs(seg[0][1] - seg[-1][1]) < 1.0)
    if not closed:
        return False
    span = max(np.ptp(seg[:, 0]), np.ptp(seg[:, 1]))
    return span < SHELF_RING_MAX_SPAN_M


def _segment_in_sound_exclusion(seg):
    """True when most of a shelf segment sits inside a known sound/inlet."""
    if len(seg) == 0:
        return False
    inside = 0
    for px, py in seg:
        lon = merc_to_lon(px)
        lat = merc_to_lat(py)
        for w, s, e, n in SOUND_SHELF_EXCLUSIONS:
            if w <= lon <= e and s <= lat <= n:
                inside += 1
                break
    return inside / len(seg) >= 0.35


def _shelfbreak_segments(Xm, Ym, depth_fm, z):
    """The 100 fm curve, minus ETOPO's estuary artifacts."""
    shelf_X, shelf_Y, shelf_field = _shelfbreak_grid(Xm, Ym, depth_fm, z)
    fig = plt.figure(figsize=(1, 1))
    ax = fig.add_axes([0, 0, 1, 1])
    cs = ax.contour(shelf_X, shelf_Y, shelf_field, levels=[SHELFBREAK_FM])
    plt.close(fig)
    kept = []
    for seg in cs.allsegs[0]:
        seg = np.asarray(seg)
        if len(seg) < 2:
            continue
        if _segment_in_sound_exclusion(seg) or _is_small_ring(seg):
            continue
        kept.append(seg)
    return kept


def _contour_grid(Xm, Ym, depth_fm, z, source):
    """Bathymetry grid for general contour lines.

    Contour the real grid. Smoothing at z9–z10 was dropping ~45% of legitimate
    lines, which is what emptied the chart when zoomed out; only the far
    overview zooms, where a tile spans many cells, get any blur at all.
    """
    field = depth_fm.astype(float)
    if z <= 8:
        Xm, Ym, field = _coarsen_grid(Xm, Ym, field, target=OVERVIEW_COARSE_PX)
        field = _smooth_masked(field, sigma=0.8)
    return Xm, Ym, field


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
    img = Image.open(buf).convert("RGBA")
    if transparent:
        # FASTOCTREE can merge the shelfbreak white into cyan hairlines when a
        # tile carries many 5 fm steps. Pin shelfbreak pixels to pure white
        # before quantize so 100 fm survives on z11+ tiles.
        data = np.array(img)
        shelf = ((data[:, :, 0] >= 185) & (data[:, :, 0] <= 215)
                 & (data[:, :, 1] >= 228) & (data[:, :, 2] >= 240)
                 & (data[:, :, 3] > 80))
        if shelf.any():
            data[shelf, 0:3] = 255
            img = Image.fromarray(data)
        out = img.quantize(colors=TILE_PALETTE_COLORS,
                           method=Image.FASTOCTREE)
    else:
        out = img.convert("RGB")
    out.save(path, optimize=True)
    buf.close()

def render_tile_merc(Xm, Ym, elev_m, z, xt, yt, out_dir, cmap, overlay=False,
                     max_depth_fm=None, source="etopo"):
    """Render one tile from a Web-Mercator elevation grid (BlueTopo path)."""
    x0, y0, x1, y1 = tile_bounds_merc(z, xt, yt)

    # Real bathymetry. The shallow cut belongs to the 100 fm shelf line alone —
    # applying it to every level erased the whole inner shelf (5–30 fm).
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

    minor, mid, major = contour_levels_for_zoom(z, source=source)
    cX, cY, cField = _contour_grid(Xm, Ym, depth_fm, z, source)
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
        drawn.append(haloed(ax.contour(cX, cY, cField, levels=minor_lv,
                     colors=[STYLE["minor_line"]], linewidths=0.7), 0.7))
    mid_lv = spanned(mid)
    if mid_lv:
        drawn.append(haloed(ax.contour(cX, cY, cField, levels=mid_lv,
                     colors=[STYLE["mid_line"]], linewidths=1.0), 1.0))
    major_lv = spanned(v for v in major if v != SHELFBREAK_FM)
    if major_lv:
        drawn.append(haloed(ax.contour(cX, cY, cField, levels=major_lv,
                     colors=[STYLE["major_line"]], linewidths=1.3), 1.3))
    # No per-tile gate: the segment filter already yields nothing when 100 fm
    # isn't in the tile. Gating on top of it is what broke the line into
    # dashes, with neighbouring tiles disagreeing about whether to draw.
    shelf_segs = _shelfbreak_segments(Xm, Ym, depth_fm, z)
    for seg in shelf_segs:
        ax.plot(seg[:, 0], seg[:, 1], color="#000000AA", linewidth=3.4,
                solid_capstyle="round", zorder=9)
        ax.plot(seg[:, 0], seg[:, 1], color=STYLE["shelfbreak_line"], linewidth=2.4,
                solid_capstyle="round", zorder=10)

    if not drawn and not shelf_segs and overlay:
        plt.close(fig)
        return False  # transparent overlay with no line on it — skip the tile

    lbl_levels = set(label_levels_for_zoom(z))
    for cs in drawn:
        lv = [l for l in cs.levels if l in lbl_levels and l != SHELFBREAK_FM]
        if not lv:
            continue
        texts = ax.clabel(cs, levels=lv, fmt=fmt_fm, fontsize=5.4,
                          inline=True, inline_spacing=2)
        for t in texts:
            t.set_color(STYLE["label_color"])
            t.set_path_effects([
                matplotlib.patheffects.withStroke(
                    linewidth=1.6, foreground=STYLE["label_halo"])])
    # Shelf-break label on the longest offshore segment — inline clabel erases the curve.
    if shelf_segs and SHELFBREAK_FM in lbl_levels:
        longest = max(shelf_segs, key=lambda s: len(s))
        mid = longest[len(longest) // 2]
        ax.text(mid[0], mid[1], fmt_fm(SHELFBREAK_FM), fontsize=5.8,
                color=STYLE["label_color"], ha="center", va="center", zorder=11,
                path_effects=[matplotlib.patheffects.withStroke(
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
