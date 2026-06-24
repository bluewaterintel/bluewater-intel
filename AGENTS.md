# AGENTS.md

## Cursor Cloud specific instructions

### What this project is
Bluewater Intel is a static fishing‑intelligence PWA. The "app" is `index.html`
(a large, self‑contained HTML/JS file) plus the sibling `bw-*.js` scripts. It is
served as static files and talks to a Supabase backend (Postgres + PostGIS,
GoTrue auth, Edge Functions). There is no build step for the frontend — it is
served as‑is (Netlify in production; a plain static server locally).

The app is **gated behind Supabase auth** (`bw-auth-gate` in `index.html`): with
no working Supabase config it stays stuck on the sign‑in screen. So a meaningful
run requires a live Supabase backend. The easiest fully‑local, no‑secrets path is
the Supabase CLI local stack (Docker), which is what the steps below use.

### Lint / test (no backend needed)
- Tests: `npm run test:freshness` (pure‑logic freshness tests).
- HTML/script integrity: `npm run integrity` (validates inlined scripts + tag balance).
- There is no separate linter configured.

### Running the full app locally (backend + frontend)
The VM snapshot already has Docker and the Supabase CLI deps installed, but
**Docker is not started automatically** (this container has no systemd) and the
Supabase stack is a service you must start yourself. Steps:

1. Start the Docker daemon (once per VM boot) and make the socket usable:
   - `sudo dockerd > /tmp/dockerd.log 2>&1 &` (run in a tmux session so it persists)
   - `sudo chmod 666 /var/run/docker.sock`
   - The daemon is configured for Docker‑in‑Docker via `/etc/docker/daemon.json`
     (`storage-driver: fuse-overlayfs`, `containerd-snapshotter: false`). Do not
     remove that config or the daemon will fail to start in this VM.
2. Start Supabase and load data:
   - `npx supabase start` (pulls/starts containers; first run is slow)
   - `npx supabase db reset` (re‑applies migrations on a clean DB — **required**
     the first time so the `auto_expose_new_tables` setting takes effect; see note)
   - Write `.env` from the live keys: `eval "$(npx supabase status -o env)"` then
     populate `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
     `SUPABASE_DB_URL` (anon/service keys are the JWT `ANON_KEY`/`SERVICE_ROLE_KEY`).
   - `npm run seed` (loads 12,027 waypoints + 643 ramps via the service role)
   - `npm run config` (writes `bw-config.js` from `.env`, pointing the client at
     local Supabase)
3. Serve the frontend on port 3000 (matches the auth `site_url` in
   `supabase/config.toml`): `python3 -m http.server 3000` from the repo root, then
   open `http://127.0.0.1:3000/index.html`.

`.env` and `bw-config.js` are git‑ignored and are regenerated from the local
Supabase keys — do not commit them.

### Non‑obvious gotchas
- **`auto_expose_new_tables = true`** is set in `supabase/config.toml`. The
  `0001`/`0002` migrations grant row access via RLS policies but rely on the legacy
  behavior of auto‑exposing new public tables to the Data API roles
  (`anon`/`authenticated`/`service_role`). With the current CLI default (off),
  `npm run seed` and all client reads/writes fail with `permission denied`. If this
  change is not merged, re‑enable it locally before `npx supabase db reset`.
- Email confirmation is disabled locally (`enable_confirmations = false`), so
  "Create Account" signs you in immediately — no inbox step. A good hello‑world is:
  create an account → pick a Home Port (e.g. Oregon Inlet, NC) → waypoints load
  from the PostGIS backend onto the map.
- The frontend loads Leaflet and `@supabase/supabase-js` from public CDNs at
  runtime, so the browser needs internet access.
- Changing `supabase/config.toml` requires `npx supabase stop && npx supabase start`
  (or `db reset`) to take effect; a plain restart reuses the existing DB volume and
  will NOT re‑apply migrations.
