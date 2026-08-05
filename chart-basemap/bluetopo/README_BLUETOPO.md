# BlueTopo high-resolution build (z10–z13, East Coast + Gulf shelf/canyons)

This add-on renders **SatFish-class canyon detail** from NOAA BlueTopo — the
public-domain, high-resolution US bathymetry (NOAA Office of Coast Survey,
National Bathymetric Source). It layers z10–z13 detail tiles **on top of** the
ETOPO CONUS base (z5–z9) that's already built, only over the shelf/slope/canyon
zones captains fish (depth < 350 fm). Deep abyssal tiles are skipped by design.

**Why this exists:** the payoff is a *finer contour ladder*, not just deeper
zooms. The v1 chart stepped the shelf in ragged 10 fm (skipping 70 and 90) and
the slope in 100 → 200 → 250 → 500 fm jumps, which flattens the subtle lumps,
ledges and terraces fish hold on. v2 steps the shelf every **5 fm** and the
slope every **20 fm**. ETOPO (1 arc-min, ~1.8 km/px) cannot honestly carry that
spacing — at 5 fm it would just draw smooth interpolation artifacts — so the
fine ladder is gated to z≥11 where BlueTopo's survey-grade data backs it.

> ⚠️ Requires **GDAL**. This does NOT run in the base pure-Python environment.
> Run it where you can install GDAL (conda on your Mac, or a cloud VM).

## 1. Environment

```bash
conda create -n bw -c conda-forge 'gdal>=3.4' numpy scipy matplotlib boto3 tqdm pillow -y
conda activate bw
pip install noaabathymetry    # NOAA fetch helper (replaces legacy nbs-bluetopo)
```

BlueTopo lives on AWS Open Data (`s3://noaa-ocs-nationalbathymetry-pds/BlueTopo/`,
anonymous read). The fetch helper resolves which ENC/UTM cells cover each bbox —
the bucket is reorganized periodically, so hardcoding S3 prefixes is brittle.

## 2. Fetch + reproject (per zone or all)

```bash
cd chart-basemap/bluetopo
python3 fetch_bluetopo.py --zone hatteras     # single zone (start here)
python3 fetch_bluetopo.py --all               # all 9 shelf/canyon zones
```

Produces `chart-basemap/bluetopo_work/<zone>_3857.tif` — a Web-Mercator elevation
raster ready for the tile renderer.

Zones (defined in `zones.py`): northeast, midatlantic, hatteras, southatlantic,
florida_east, keys, gulf_west, gulf_central, gulf_east.

## 3. Render styled tiles

Render into the SAME tile dir as the ETOPO base so they merge by z/x/y:

```bash
cd chart-basemap/bluetopo

# transparent depth-contour overlay tiles -> tiles_overlay/
python3 render_bluetopo.py --tif ../bluetopo_work/hatteras_3857.tif \
    --out ../tiles_overlay --overlay --zmin 10 --zmax 13
```

Only the **overlay** is built. The app dropped the Bluewater Chart basemap, so
`bw-core.js` reads `contoursTilesBaseUrl` and nothing else — rendering the
opaque `tiles_conus` set would double the build and the storage for tiles no
client ever requests. `render_bluetopo.py` still supports it (omit `--overlay`)
if that basemap is ever restored.

The depth mask (350 fm, in `zones.py`) auto-skips abyssal tiles, as does any
tile no contour line crosses.

### Contour ladder by zoom

Set in `contour_levels_for_zoom()` in `../render_tiles.py`. Emphasis levels are
kept ON each ladder so an emphasized line never crowds its neighbours, and a
depth is never drawn twice.

| Zoom | Source | Inside 30 fm | Shelf (30–100 fm) | Slope (100–500 fm) | Below 500 fm |
|------|--------|--------------|-------------------|--------------------|--------------|
| ≤8 | ETOPO | majors only | majors only | 250 | 750 / 1500 |
| 9 | ETOPO | 10 fm | 10 fm | 200 / 250 | 750 / 1500 |
| 10 | BlueTopo or ETOPO | **5 fm** | 10 fm | 50 fm | 750 / 1500 |
| 11–13 BlueTopo | survey grid | **5 fm** | **5 fm** | **20 fm** | 100 fm |
| 11–13 ETOPO fill | 1 arc-min | **5 fm** inner | **10 fm** | **50 fm** | 750 / 1500 |

The ladder is **source-aware**, not zoom-only: ETOPO gap-fill never gets the
20 fm BlueTopo slope steps — on ~1.8 km cells that draws false canyon geometry
(the jagged "V" and comb streaks). BlueTopo tiles at z10–z13 share one ladder
so zooming in does not redraw the shelf break.

z≤9 deliberately keeps v1's spacing — those tiles already look right, and
re-rendering them to a finer ladder would only add noise.

The inner-shelf column is finer than the rest because a broad, gently sloping
shelf defeats an evenly-spaced ladder. Behind Hatteras the sound sits at a
near-uniform 3 fm and the mid-shelf climbs 8–24 fm over ~45 km: on a 5 fm ladder
a z11 tile there catches one contour or none, and the area reads as tiles that
failed to load rather than as flat ground. 2 fm inside 30 fm fills it without
crowding the drop-off. z10 stops at 5 fm — its tiles are ~8 km across, and 2 fm
is below what ETOPO can resolve there without turning quantization steps into
false terraces.

### Size

Tiles are flat-colour line art, so they're saved as 64-colour palette PNGs
(`_save_tile`) — visually identical to 32-bit RGBA at about a fifth the bytes.
That's what pays for the extra lines. Measured on hatteras z10–13:
**5,195 tiles / 27 MB** (~5 KB/tile), ~7 min. All nine zones ≈ **270 MB**.

Or use Makefile shortcuts from `chart-basemap/`:

```bash
make bluetopo-hatteras    # fetch + render hatteras only
make bluetopo-all         # all zones, one at a time, reclaiming scratch
```

**Scratch vs. payload:** per zone the survey downloads run 6–8 GB and the warped
raster 5–6 GB, all of it discarded after rendering. Only the ~30 MB of tiles per
zone ships. `bluetopo-all` deletes each zone's scratch before starting the next,
so peak disk stays near ~15 GB rather than the ~120 GB that fetching all nine up
front would need.

## 4. Fill the gaps (required before upload)

Leaflet has **no per-tile fallback**. Once `maxNativeZoom` is 13 it requests real
z10–13 tiles, and a missing tile draws nothing — it does *not* upscale z9. So
raising the native zoom without complete coverage makes contours vanish wherever
BlueTopo doesn't reach: outside the nine zone boxes, and in the >350 fm water
skipped by the depth mask inside them.

Fill those gaps with coarse ETOPO contours:

```bash
cd chart-basemap
make contours-fill
```

`--ignore-existing` on the rsync is load-bearing — BlueTopo's fine tiles must
never be overwritten by the ETOPO version of the same z/x/y. Because gap tiles
sit in sparse deep water they're cheap: ~2,900 tiles / 10 MB at z10, ~150 MB
across z10–13, bringing the finished tileset to roughly 440 MB.

## 5. Repack + upload (bump the version!)

Because you're adding new zoom levels to existing tilesets, re-pack and
re-upload. **Bump the prefix to v2** so cached clients pick up the detail:

```bash
cd chart-basemap
python3 make_mbtiles.py tiles_overlay bluewater-contours-conus.mbtiles
python3 upload_supabase.py --src tiles_overlay --bucket chart-tiles --prefix contours/v2
```

Then in the app:

1. Set `contoursTilesVersion: 'v2'` in `scripts/generate-bw-config.mjs`
2. Raise `CONTOURS_TILES_NATIVE_ZOOM` from `9` to `13` in `bw-core.js`
3. Run `npm run config` (or `npm run build:ios` for Xcode)
4. Update attribution: `© Bluewater Intel · Bathymetry: NOAA NCEI ETOPO / NOAA OCS BlueTopo / GEBCO`

## 6. Cost check (do this now, not later)

z10–z13 over all zones is where egress starts to matter (see `DEPLOY_SUPABASE.md`).
Before going wide, put **Cloudflare in front of Supabase** (free edge cache) or
move tiles to **Cloudflare R2** (zero egress). Recommended order: build hatteras
first, verify the look in-app, THEN render the rest and sort hosting.

## Files

| File | Role |
|------|------|
| `zones.py` | Shelf/canyon AOI boxes + depth mask + zoom range |
| `fetch_bluetopo.py` | Fetch BlueTopo GeoTIFFs, mosaic, reproject to 3857 |
| `render_bluetopo.py` | GeoTIFF → styled masked tiles (imports base style) |
| `build_all.sh` | Resumable all-zone driver; reclaims scratch per zone |
| `README_BLUETOPO.md` | This runbook |

## Attribution (required)

BlueTopo is public domain; NOAA requests acknowledgement:

`© Bluewater Intel · Bathymetry: NOAA NCEI ETOPO / NOAA OCS BlueTopo / GEBCO`
