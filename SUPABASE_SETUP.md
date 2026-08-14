# Supabase Setup — Bluewater Intel M1

Follow these steps once to create the backend. After this, run `npm run setup:backend` (or the individual scripts below).

## 1. Create a Supabase project

1. Open [supabase.com/dashboard](https://supabase.com/dashboard) and sign in (or create a free account).
2. Click **New project**.
3. Name: `bluewater-intel`
4. Database password: generate a strong password and **save it** (needed for direct DB access).
5. Region: **East US (North Virginia)** — closest to East Coast users.
6. Wait ~2 minutes for the project to provision.

## 2. Enable PostGIS

1. Dashboard → **Database** → **Extensions**
2. Search `postgis` → **Enable**

(PostGIS is also created by the migration SQL, but enabling it in the dashboard confirms it is available.)

## 3. Collect API keys

Dashboard → **Project Settings** → **API**:

| Key | Use |
|---|---|
| **Project URL** | `SUPABASE_URL` in `.env` and Netlify env |
| **anon public** | `SUPABASE_ANON_KEY` — safe in the client |
| **service_role** | `SUPABASE_SERVICE_ROLE_KEY` — seed script only, never commit |

## 4. Create `.env` locally

Copy `.env.example` to `.env` and fill in the three values:

```bash
cp .env.example .env
# edit .env with your keys
```

## 5. Apply migration + seed

```bash
export PATH=".tools/node-v22.16.0-darwin-arm64/bin:$PATH"

# Option A: Supabase CLI (recommended)
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push

# Option B: SQL Editor — paste supabase/migrations/0001_waypoints_ramps.sql

# Seed reference data — NEW PROJECT / DISASTER RECOVERY ONLY (truncates waypoints!)
npm run seed -- --confirm
```

Expected output: waypoint count matching `supabase-m1/seed/waypoints.ndjson`, `ramps=643`.

## Waypoints workflow (authoritative database)

The live **`waypoints` table in Supabase** is the source of truth. Add, edit, or
delete rows in the Supabase dashboard (Table Editor or SQL). Legacy CSV files in
`data/` are removed — do not edit waypoints via git CSVs.

After Supabase edits, snapshot to version control:

```bash
npm run pull:waypoints          # Supabase → waypoints.ndjson + bw-waypoints.js
git add supabase-m1/seed/waypoints.ndjson bw-waypoints.js
git commit -m "waypoints: describe your change"
```

**Do not run `npm run seed`** on a database with manual edits — it truncates and
reloads from the NDJSON snapshot. Use `seed -- --confirm` only for a fresh project
or restoring from git after data loss.

### Weekly automated snapshot (GitHub Actions)

Workflow: `.github/workflows/pull-waypoints.yml` — runs every **Sunday 12:00 UTC**
and can be triggered manually from **Actions → Snapshot waypoints → Run workflow**.

Add these **repository secrets** (GitHub → Settings → Secrets and variables → Actions):

| Secret | Notes |
|--------|--------|
| `SUPABASE_DB_URL` | Preferred — Session pooler string from Dashboard → Connect |
| `SUPABASE_URL` | Only if not using DB URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Required with `SUPABASE_URL`; never commit this |

If `main` is branch-protected, allow **github-actions[bot]** to push, or the weekly
commit will fail when waypoints change.

## 6. Regenerate client config

```bash
node scripts/generate-bw-config.mjs
```

## 7. Netlify environment variables

In Netlify → Site settings → Environment variables, add:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

(Do **not** add the service role key to Netlify — it is only for local seeding.)

The Netlify build command runs `node scripts/generate-bw-config.mjs` to inject keys into `bw-config.js` at deploy time.

## Smoke test (backend)

After seeding, verify in SQL Editor:

```sql
select count(*) from waypoints;  -- 12585
select count(*) from ramps;    -- 643
select * from waypoints_within(35.7972, -75.5495, 40, null) limit 5;
```
