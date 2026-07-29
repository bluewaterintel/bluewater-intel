# AGENT.md — Bluewater Intel fishing-chart basemap

You are setting up a **proprietary bathymetric fishing-chart basemap** for the
Bluewater Intel app: styled depth-contour tiles (in fathoms) served as static
XYZ tiles and dropped into the existing Leaflet map next to the current
Satellite / Ocean / Relief basemaps.

This package already contains a **working pilot** (Cape Hatteras / Mid-Atlantic,
zoom 5–10, 230 pre-rendered tiles). Your job is to (A) verify it locally, then
(B) deploy the tiles to Supabase Storage, then (C) wire the Leaflet layer into
the app. Rendering more regions is optional and comes last.

Do the steps **in order**. Stop and report if a step fails.

---

## Prerequisites

- Python 3.10+ and `pip`
- Node not required (pure static tiles)
- A Supabase project (the app already uses one)

Install Python deps:
```bash
make setup           # pip install -r requirements.txt
```

Coverage already rendered: **full continental US (both coasts + Gulf) z5–z9**
for BOTH products. z10+ is per-region on demand (section D); until rendered,
`maxNativeZoom: 9` makes Leaflet upscale cleanly.

---

## A. Verify the pilot locally (no credentials needed)

```bash
make serve           # serves the repo root at http://localhost:8000
```
Open `http://localhost:8000/leaflet-demo.html`. You should see a dark fishing
chart over Cape Hatteras with a bright contour line tracing the shelf edge
(the 100-fathom curve). Pan/zoom 5→10. If tiles show, the pilot is good.

`preview_z8_hatteras.png` is a reference screenshot of the expected look.

---

## B. Deploy tiles to Supabase Storage

### B1. Create the bucket (human does this once in the dashboard)
Supabase → Storage → New bucket:
- name: `chart-tiles`
- **Public bucket: ON**

### B2. Get S3 credentials (dashboard → Project Settings → Storage → S3 Connection)
Copy Endpoint, Region, and create an Access key. Put them in `.env`:
```bash
cp .env.example .env
# then edit .env with the real values
```

### B3. Upload
```bash
set -a && source .env && set +a
make upload-dryrun    # prints tile count + final public URL, uploads nothing
make upload           # real parallel upload, idempotent
```

### B4. Confirm a tile is public
Open (swap your project ref):
```
https://<project-ref>.supabase.co/storage/v1/object/public/chart-tiles/chart/v1/8/74/101.png
```
A PNG = success. JSON/403 = bucket isn't public (fix B1).

---

## C. Wire into the app (Leaflet)

There are **two tile products** in this package:

| Product | Dir | Upload prefix | Role in app |
|---|---|---|---|
| Dark fishing chart | `tiles_conus/` (+ `tiles/` Hatteras z10 pilot) | `chart/v1` | **Basemap** option next to Satellite — best under SST/Bite Map overlays |
| Transparent depth contours | `tiles_overlay/` | `contours/v1` | **Overlay** toggle that works on ANY basemap (esp. Satellite) |

Architecture decision (agreed with owner): contours ship as a toggleable
transparent overlay, NOT baked into a second satellite basemap. One overlay
works over every basemap, supports opacity control, and avoids re-hosting
imagery. `leaflet-layers-demo.html` shows the exact target setup:
Satellite + Bluewater Chart as basemaps, "Depth Contours" as an overlay,
in a `L.control.layers` — mirror this in the app's existing layers rail.

Upload both: `make upload-conus` and `make upload-overlay`.

Canonical basemap snippet (also in `leaflet-supabase.html`) — replace `<project-ref>`:

```js
const bluewaterChart = L.tileLayer(
  'https://<project-ref>.supabase.co/storage/v1/object/public/chart-tiles/chart/v1/{z}/{x}/{y}.png',
  {
    minZoom: 5,
    maxZoom: 14,        // Leaflet upscales beyond native tiles
    maxNativeZoom: 10,  // raise as deeper zooms are rendered/uploaded (see D)
    tileSize: 256,
    attribution: '© Bluewater Intel · Bathymetry: NOAA NCEI / GEBCO'
  }
);
```

Integration requirements:
- Register it in the existing basemap layer-control group ("Bluewater Chart").
- Keep the SST / chlorophyll / Bite Map overlays rendering **on top** at their
  current 60–80% opacity — the chart palette is tuned dark specifically so
  those stay readable.
- Add the disclaimer text **“Fishing reference only — not for navigation”** to
  the map footer/attribution area if it isn't already shown.

---

## D. (Optional) Render more regions / deeper zooms

The pipeline is data-agnostic. To add a region:
```bash
# 1. fetch bathymetry for an AOI bounding box (W E S N)
python3 fetch_bathymetry.py --w -74.5 --e -70.0 --s 39.0 --n 41.5 --out ne.nc
# 2. render into the SAME tiles/ dir (merges by z/x/y)
python3 render_tiles.py --nc ne.nc --out tiles --zmin 5 --zmax 10
# 3. re-pack + re-upload
make mbtiles && make upload
```
Coverage priority (from brief): Mid-Atlantic/Carolinas ✅ pilot → Northeast →
South Atlantic/FL East → Gulf.

### High-resolution canyon detail (z10–z13) — BlueTopo add-on

ETOPO (1 arc-min) is too coarse to resolve canyon walls. For SatFish-class
detail, the **`bluetopo/`** folder contains a complete GDAL pipeline that
renders z10–z13 tiles from NOAA BlueTopo (survey-grade, public domain) over the
East Coast + Gulf shelf/canyon zones, masked to depth < 350 fm so tile counts
stay sane (~50k tiles, ~600 MB total). It needs GDAL (`conda install -c
conda-forge gdal`) — see **`bluetopo/README_BLUETOPO.md`** for the full runbook.
Quick start: `make bluetopo-hatteras` (build the #1 zone, verify in-app), then
`make bluetopo-all`. Renders into the same `tiles_conus/` + `tiles_overlay/`
dirs, so it merges with the base build. Bump the upload prefix to v2 and raise
`maxNativeZoom` to 13 afterward.

---

## Guardrails / notes for the agent

- **Do not** commit `.env` or the S3 secret. `.gitignore` already excludes them.
- **Do not** serve live tiles from GitHub Pages — it's not a production tile
  CDN. Supabase (or later Cloudflare R2) serves tiles; GitHub holds code + the
  `.mbtiles` backup.
- Tiles are immutable per version. When you re-style, bump the prefix
  (`chart/v1` → `chart/v2`) and update the one URL — don't overwrite v1 in place.
- The styled tiles are Bluewater's proprietary derived work; the underlying
  bathymetry is public-domain NOAA data. Keep the attribution line intact.
- Full data/style/hosting detail: `README.md` and `DEPLOY_SUPABASE.md`.

## File map

```
AGENT.md                  <- you are here (start)
README.md                 <- full pipeline + style spec + IP
DEPLOY_SUPABASE.md        <- deploy detail + cost notes
Makefile                  <- one-command tasks
requirements.txt          <- python deps
.env.example              <- copy to .env, fill in Supabase S3 creds
render_tiles.py           <- DEM -> styled fathom-contour tiles
fetch_bathymetry.py       <- download AOI bathymetry (NOAA ERDDAP)
make_mbtiles.py           <- XYZ dir -> MBTiles archive
upload_supabase.py        <- upload tiles to Supabase Storage (S3 API)
leaflet-supabase.html     <- production drop-in (edit project ref)
leaflet-demo.html         <- local verification page
tiles/                    <- Hatteras pilot tiles incl. z10 detail (merge into chart upload)
tiles_conus/              <- FULL CONUS dark-chart basemap, z5-9 (2,721 tiles)
tiles_overlay/            <- FULL CONUS transparent contour OVERLAY, z5-9 (2,721 tiles)
bluewater-chart-conus.mbtiles     <- CONUS chart archive
bluewater-contours-conus.mbtiles  <- CONUS overlay archive
bluewater-chart-pilot.mbtiles     <- pilot archive
leaflet-layers-demo.html  <- TARGET ARCHITECTURE demo (satellite + chart + overlay toggle)
preview_z8_hatteras.png   <- expected-look reference (chart)
```
