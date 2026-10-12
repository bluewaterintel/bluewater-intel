# Depth Contours overlay integration

The app loads transparent contour tiles from Supabase Storage (public bucket `chart-tiles`):

| Product | Storage prefix | App usage |
|---------|----------------|-----------|
| Transparent contours | `contours/v2/` | **Layers → Depth Contours** (any basemap) |

Tile URLs are derived from `SUPABASE_URL` in `.env` (see `bw-config.js` → `contoursTilesVersion`).

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
https://<project-ref>.supabase.co/storage/v1/object/public/chart-tiles/contours/v2/8/74/101.png
```

5. Regenerate app config: `npm run config` (or `npm run build:ios` for iOS)

Full pipeline docs: [`chart-basemap/README.md`](../chart-basemap/README.md) and [`chart-basemap/AGENT.md`](../chart-basemap/AGENT.md).

## Version bumps

When re-rendering tiles, bump the storage prefix (e.g. `contours/v3`) and update `contoursTilesVersion` in `scripts/generate-bw-config.mjs`, then raise `CONTOURS_TILES_REVISION` in `bw-core.js` so clients refetch. Tiles are cached immutable — never overwrite in place.

**Future v3 (deferred):** Larger contour label fonts were prototyped in `render_tiles.py` but are not published until a full tile rebuild and upload to `contours/v3`. Until then the live app stays on **v2** only (no v2/v3 stack).
