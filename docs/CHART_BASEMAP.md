# Depth Contours overlay integration

The app loads transparent contour tiles from Supabase Storage (public bucket `chart-tiles`):

| Product | Storage prefix | App usage |
|---------|----------------|-----------|
| Transparent contours | `contours/v3/` (labels v3: larger fathom type) | **Layers → Depth Contours** (any basemap) |

Tile URLs are derived from `SUPABASE_URL` in `.env` (see `bw-config.js` → `contoursTilesBaseUrl`).

## First-time deploy

1. Supabase dashboard → **Storage** → create public bucket **`chart-tiles`**
2. Project Settings → **Storage → S3 Connection** → create access key
3. From `chart-basemap/`:

```bash
cp .env.example .env   # fill in S3 credentials
make setup
make upload-overlay    # contours/v1
```

4. Verify a tile in the browser:

```
https://<project-ref>.supabase.co/storage/v1/object/public/chart-tiles/contours/v1/8/74/101.png
```

5. Regenerate app config: `npm run config` (or `npm run build:ios` for iOS)

Full pipeline docs: [`chart-basemap/README.md`](../chart-basemap/README.md) and [`chart-basemap/AGENT.md`](../chart-basemap/AGENT.md).

## Version bumps

When re-rendering tiles, bump the storage prefix (e.g. `contours/v3`) and update `contoursTilesVersion` in `scripts/generate-bw-config.mjs`, then raise `CONTOURS_TILES_REVISION` in `bw-core.js` so clients refetch. Tiles are cached immutable — never overwrite in place.

**v3 (Oct 2026):** Larger contour label font in `chart-basemap/render_tiles.py`. Upload with `node scripts/upload-chart-tiles.mjs --src chart-basemap/tiles_overlay --prefix contours/v3` after `make overlay`.
