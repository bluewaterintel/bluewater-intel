# Bluewater Intel — Proprietary Fishing Chart Basemap

Styled bathymetric contour basemap (fathoms) rendered as XYZ Web Mercator
tiles for the Bluewater Leaflet app. Dark fishing-chart aesthetic: the ocean
structure is the product, land is secondary, and the 100-fathom shelf-break
curve is the brightest element on the chart — the line captains steer by.

**Pilot build included:** Cape Hatteras / Mid-Atlantic AOI (77.5°W–73.5°W,
33.5°N–37°N), zooms 5–10, 230 tiles, packed in `bluewater-chart-pilot.mbtiles`.

## Pipeline (3 steps)

```bash
# 1. Fetch bathymetry for an AOI (NOAA ERDDAP, NetCDF)
python3 fetch_bathymetry.py --w -77.5 --e -73.5 --s 33.5 --n 37.0 --out aoi.nc

# 2. Render styled tiles (XYZ dir, 256px PNG, EPSG:3857)
python3 render_tiles.py --nc aoi.nc --out tiles --zmin 5 --zmax 10

# 3. Pack MBTiles archive (backup / offline rebuild)
python3 make_mbtiles.py tiles bluewater-chart.mbtiles
```

Deps: `numpy`, `scipy`, `matplotlib` (pure Python — no GDAL install needed).

## Style spec (tokens)

| Element | Value | Notes |
|---|---|---|
| Ocean ramp | `#1E3A50 → #122740 → #080F1E` | sqrt-scaled to 2600 fm so shelf detail isn't crushed |
| Land / coastline | `#232823` / `#5C6E5C` | intentionally quiet |
| Minor contours (10–80 fm) | `#3E7E93` 0.45px | z9+ only |
| Mid contours (50/75/250/750/1500) | `#5FA8BC` 0.7px | z7+; 50 & 75 add mid-shelf resolution |
| Major contours (100/200/500/1000/2000) | `#8FD3E4` 1.0px | labeled |
| **100-fm shelf break** | `#C4F0FA` 1.6px | signature line, always labeled |
| Labels | `#AFE3EF`, dark halo | fathoms, integer |

Units: **fathoms** everywhere (per brief; East Coast convention). Contour
sets thin out at low zoom, densify at z9+ so nearshore lumps/ledges appear
as you zoom in — same progressive scheme SatFish uses (their primary lines
are the 100/500/1000/1500/2000-fathom curves).

Tested legibility target: overlays at 60–80% opacity on top. The palette is
kept in a narrow dark-navy band precisely so SST rainbows and Bite Map heat
stay readable over it.

## Zoom / scaling plan

| Zoom | Purpose | Data needed |
|---|---|---|
| z5–z8 | trip-planning view, region scale | ETOPO1 (1′) — included pilot source |
| z9–z11 | structure fishing, canyon heads | **ETOPO 2022 (15″)** — same NetCDF workflow |
| z12–z14 | nearshore ledges, inlets | **NOAA BlueTopo** (variable ~4–16 m) |

The renderer is data-agnostic: any lat/lon grid with negative-down depths
works. For full AOI (Maine→Texas) render per-region AOI boxes and merge tile
dirs; tile count at z14 for the full coast is large (~low millions) — render
z12–z14 only over the shelf (mask depth < ~300 fm) to cut ~80% of tiles.

## Hosting (production)

Tiles are static PNGs — no tile server required.

1. **Cloudflare R2** (recommended: zero egress fees) or S3+CloudFront.
   `aws s3 sync tiles/ s3://bw-tiles/chart/ --content-type image/png`
2. Put Cloudflare CDN in front; cache-control `public, max-age=31536000`
   (tiles are immutable per release — version the path: `/chart/v1/{z}/{x}/{y}.png`).
3. CORS: allow `GET` from your app origins.
4. Leaflet drop-in (see `leaflet-demo.html`):

```js
L.tileLayer('https://tiles.bluewaterintel.com/chart/v1/{z}/{x}/{y}.png', {
  minZoom: 5, maxZoom: 14, maxNativeZoom: 10,
  attribution: '© Bluewater Intel · Bathymetry: NOAA NCEI / GEBCO'
});
```

`maxNativeZoom` lets Leaflet upscale gracefully past rendered zooms — ship
z5–z10 on day one, raise it as deeper zooms render.

## Data / IP

- **Bathymetry sources are public:** NOAA NCEI ETOPO (public domain, US Gov)
  and optionally GEBCO (free with attribution). You may use them commercially.
- **The styled chart is yours:** the contour selection, styling, labeling,
  and tile service are Bluewater's proprietary derived work. Nobody else can
  copy your rendered tiles; you can't copy SatFish's — but you're both free
  to derive from the same public grids, which is exactly what this does.
- **Footer attribution text:**
  `© Bluewater Intel · Bathymetry: NOAA NCEI ETOPO / GEBCO`
  (if you add GEBCO data: GEBCO requires the credit line
  "GEBCO Compilation Group (2024) GEBCO 2024 Grid".)
- **Disclaimer (required in-app):** *Fishing reference only — not for
  navigation.* Already styled into `leaflet-demo.html`.

## Files

- `render_tiles.py` — core renderer (style tokens at top)
- `fetch_bathymetry.py` — AOI downloader (ERDDAP)
- `make_mbtiles.py` — XYZ dir → MBTiles
- `bluewater-chart-pilot.mbtiles` — pilot tile archive (z5–z10 Hatteras)
- `preview_z8_hatteras.png` — stitched style preview
- `leaflet-demo.html` — local demo + production drop-in snippet
