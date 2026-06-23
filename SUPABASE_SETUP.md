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

# Seed reference data (service role key required)
npm run seed
```

Expected output: `waypoints=12027`, `ramps=643`.

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
select count(*) from waypoints;  -- 12027
select count(*) from ramps;    -- 643
select * from waypoints_within(35.7972, -75.5495, 40, null) limit 5;
```
