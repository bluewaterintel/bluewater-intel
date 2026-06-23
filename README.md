# Bluewater Intel — Backend Milestone 1: Waypoints + Ramps

This bundle migrates the 12,027 inlined fishing waypoints and 643 boat ramps out
of the HTML and into Supabase Postgres + PostGIS, and swaps the client's
in-browser distance filter for native spatial radius queries.

**Scope guardrail:** this milestone touches **neither the prediction engine nor
the AI Captain's Brief**. It is public, read-only reference data. Row-level
security for *user* data arrives in Milestone 2.

**Governing principle:** real data or an honest absence of data. The client wiring
queries the backend as the source of truth and, on failure, either reuses a
clearly-labeled cache, falls back to a clearly-labeled on-device dataset (native
apps), or withholds and says so. It never fabricates and never presents stale or
absent data as live.

---

## What's in here

```
supabase-m1/
├── migrations/
│   └── 0001_waypoints_ramps.sql     PostGIS schema, GIST indexes, radius RPCs, RLS read policies
├── seed/
│   ├── waypoints.ndjson             12,027 rows {name,lat,lng,t}
│   ├── ramps.ndjson                 643 rows {name,lat,lng}
│   ├── waypoint_types.json          11 type codes -> labels
│   └── load.mjs                     idempotent server-side seed loader (service role)
├── client/
│   ├── bw-data-source.js            window.BW_DATA: async backend queries + honest fallback
│   └── CLIENT_PATCH.md              exact before/after edits to the app HTML
└── README.md                        this file
```

---

## Validation already done (locally, against real PostGIS 3 / Postgres 16)

- Migration applies cleanly (the only local errors are the Supabase-managed
  `anon`/`authenticated` roles, which exist on the real platform).
- Seed loads exactly **12,027 waypoints / 643 ramps / 11 types**.
- `waypoints_within` results were **cross-checked against the app's original
  client-side haversine** across 5 ports/radii — identical sets. The only deltas
  are 1–2 points exactly at a radius boundary, where PostGIS's WGS84 ellipsoid is
  *more* accurate than the haversine sphere (an improvement, not a regression).
- Type filter, ramp queries, and nearest-first ordering verified.
- `EXPLAIN ANALYZE` confirms the **GIST spatial index is used** (no seq scan); a
  100 nm query returning ~800 points runs in ~10 ms.

You still need to run it against your real project (below) before wiring the client.

---

## Deploy runbook (do this in Cursor / your repo, with secrets)

### 1. Apply the migration
```bash
# with the Supabase CLI, project linked:
supabase db push
# or paste migrations/0001_waypoints_ramps.sql into the Supabase SQL editor
```

### 2. Seed the data (server-side only — uses the SERVICE ROLE key)
```bash
npm i @supabase/supabase-js
SUPABASE_URL=https://YOURPROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node supabase-m1/seed/load.mjs
```
Expect: `waypoints=12027 (expect 12027), ramps=643 (expect 643)` and a passing
RPC probe. **Never** put the service role key in the client or commit it.

### 3. Wire the client
- Set `supabaseUrl` and `supabaseAnonKey` in `client/bw-data-source.js`
  (`BW_DATA_CONFIG`). The **anon** key is safe in the client — RLS makes these
  tables read-only and exposes nothing else.
- Choose `embeddedFallback`: `true` for the native apps (keeps the inlined data as
  a labeled offline cache), `false` for the website (then you may delete the
  inlined `BW_WAYPOINTS`/`BW_RAMPS` to drop ~1.2 MB).
- Apply the edits in `client/CLIENT_PATCH.md`.
- Re-run the integrity check before shipping the HTML.

### 4. Smoke test
Per `CLIENT_PATCH.md` → "Verification after wiring": online load, offline
labeling, pan/zoom-while-offline, rapid port switching.

---

## A caution about agentic deploys

An agentic tool will happily "make it work" by reintroducing a synthetic fallback
or loosening the read-only/key posture if left unsupervised. Hold it to two rules:
1. The service role key stays server-side; the client only ever uses the anon key.
2. No silent fabrication — if data can't be fetched, the UI says so (the
   `bw-data-source.js` status states are the contract).

---

## Why this ordering (the rest of the roadmap)

1. **Waypoints + ramps (this).** Independent, low-stakes, proves the toolchain.
2. **Auth + user data.** Accounts, `user_waypoints`/`catches`, RLS for private spots.
3. **AI Brief endpoint.** Host the keyed `API.getBrief` server-side; key never in client.
4. **Ocean-data layer.** Build the client DataSource seam first, then real
   SST/chlor/depth/wind/AIS via tile proxy + `/grid`; withhold-and-label on no
   data; compile synthetic out of production behind a regression gate. (This is
   where the wind-header and catch-autofill honesty gaps finally get fixed.)
5. **Data governance.** Diagnostics-vs-monetization separation, de-identification,
   consent/DSAR before any aggregate data is shared.

Note: `bw-data-source.js` is intentionally the *first instance* of the client
DataSource pattern that Milestone 4 generalizes to ocean data. Same seam, same
honest-fallback contract — waypoints/ramps just prove it on safe data first.
