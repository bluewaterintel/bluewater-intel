# Deploying Bluewater chart tiles to Supabase Storage

Static `{z}/{x}/{y}.png` tiles served from a public Supabase bucket, dropped
straight into Leaflet. Uses what you already pay for — no new vendor.

## 1. Create the bucket (once)

Supabase dashboard → **Storage** → **New bucket**
- **Name:** `chart-tiles`
- **Public bucket:** **ON** (tiles must be publicly readable by the map)
- Leave file-size limit default; tiles are tiny (~10–30 KB each).

## 2. Get S3 credentials (once)

Supabase dashboard → **Project Settings** → **Storage** → **S3 Connection**
- Copy the **Endpoint** → looks like
  `https://<project-ref>.storage.supabase.co/storage/v1/s3`
- Copy the **Region** (e.g. `us-east-1`)
- Click **New access key** → copy the **Access key ID** and **Secret**
  (the secret shows once — save it).

## 3. Upload the tiles

```bash
export SUPABASE_S3_ENDPOINT="https://<project-ref>.storage.supabase.co/storage/v1/s3"
export SUPABASE_S3_REGION="us-east-1"
export SUPABASE_S3_ACCESS_KEY="…"
export SUPABASE_S3_SECRET_KEY="…"

# preview count + final URL, upload nothing:
python3 upload_supabase.py --src tiles --bucket chart-tiles --prefix chart/v1 --dry-run

# real upload (parallel, idempotent):
python3 upload_supabase.py --src tiles --bucket chart-tiles --prefix chart/v1
```

Deps: `pip install boto3`. The script sets `Cache-Control: immutable` and the
right `image/png` content type on every tile.

**Version the prefix.** `chart/v1` today, `chart/v2` when you re-style. Because
tiles are cached `immutable`, bumping the version is how users pick up new
tiles without stale-cache problems — just change the one URL line in Leaflet.

## 4. Confirm a tile is live

Open this in a browser (swap your ref):
```
https://<project-ref>.supabase.co/storage/v1/object/public/chart-tiles/chart/v1/8/74/101.png
```
You should see the Cape Hatteras shelf-break tile. If you get JSON/403, the
bucket isn't public — recheck step 1.

## 5. Wire into Leaflet

Edit the one `TILE_URL` line in `leaflet-supabase.html` with your project ref,
open it, and you'll see the pilot chart. In your real app it's the same
`L.tileLayer` next to your existing basemaps:

```js
L.tileLayer(
  'https://<project-ref>.supabase.co/storage/v1/object/public/chart-tiles/chart/v1/{z}/{x}/{y}.png',
  { minZoom: 5, maxZoom: 14, maxNativeZoom: 10,
    attribution: '© Bluewater Intel · Bathymetry: NOAA NCEI / GEBCO' }
).addTo(map);
```

## CORS

Public Supabase Storage objects are served with permissive CORS by default,
so Leaflet `<img>` tile loads work with no extra config. (You'd only need to
touch CORS if you later fetch tiles via `fetch()`/canvas for pixel access.)

## Cost note — worth watching

Supabase bills **egress bandwidth** (roughly $0.09/GB beyond your plan's
included amount). Map tiles are bandwidth-heavy: a captain panning a session
can pull hundreds of tiles. Rough math — pilot tiles average ~20 KB, so
~50,000 tile loads ≈ 1 GB. At small scale this is pennies; at high traffic it
climbs.

Two levers if egress grows:
- The `immutable` cache header means each user's browser re-downloads a tile
  only once — repeat panning is free after first load.
- If the bill ever gets uncomfortable, Cloudflare R2 (zero egress) is a
  drop-in swap: re-run an equivalent sync to R2, change the one Leaflet URL.
  Nothing about the tiles changes — they're just static files.

Start on Supabase since it's already in your stack; revisit only if traffic
makes egress material.

## What lives where

- **Supabase Storage** → the live tiles users load.
- **GitHub** → the pipeline code (`render_tiles.py`, etc.) + the
  `.mbtiles` archive for backup/offline rebuild. Don't serve live tiles from
  GitHub — Pages isn't meant as a production tile CDN.
