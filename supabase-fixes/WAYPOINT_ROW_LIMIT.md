# Waypoint display capped at ~1000

If the map or Waypoints panel shows `(showing nearest N)` while spots you know are
near the port are missing — especially at **100–160 nm** — the usual cause is
**Supabase API `max_rows`**, not the map draw cap.

`pack_waypoints_within` can return up to 8000 rows, but PostgREST truncates RPC
responses to **`max_rows`** (cloud default **1000**). The client then applies the
FL coast filter, which can drop many of those 1000 wrong-coast rows and leave
gaps near your port.

## Fix (production — one time)

1. [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. **Project Settings → API**
3. **Max Rows** → set to **10000** (or at least **8000**)
4. Save

No app redeploy required — takes effect immediately.

## Fix (local Supabase)

`supabase/config.toml` → `[api]` → `max_rows = 10000`

## Verify

Select a dense port (e.g. Ocean City, NJ) at **160 nm**. The waypoint count should
exceed 1000 when entitled, and near-port structure should appear on the map when
zoomed in.
