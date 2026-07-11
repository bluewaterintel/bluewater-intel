# Bluewater Intel

A freemium fishing-intelligence PWA for U.S. coastal waters from Maine to Southern California. The flagship is a species-specific predictive **Bite Map** plus a
generative **AI Captain's Brief**, layered on real ocean, weather, and bathymetry
data and ~12,000 charted fishing waypoints.

## Governing principle

**Real data or an honest absence of data.** The prediction engine and conditions
readouts run on real observations. When a real value isn't available for a cell,
it is withheld and labeled — never fabricated, and never presented as live. Stale
real data may be shown briefly, clearly labeled with its age.

## Architecture

- **Frontend** — a single `index.html` (Leaflet map, all UI and scoring logic),
  with a few supporting modules:
  - `bw-ocean.js` — client wrapper for the ocean-data edge function (+ caching).
  - `bw-breaks.js` — gradient/edge helpers (thermal break, chlorophyll edge, SSH).
  - `bw-auth.js` — Supabase auth + user-data sync.
  - `bw-freshness.js` / `bw-data-source.js` — freshness model and data-source seam.
- **Backend** — Supabase (Postgres + PostGIS, Auth, Edge Functions):
  - `supabase/functions/ocean` — proxies/normalizes real ocean data:
    - SST: NASA JPL **MUR** L4 (~1 km, gap-filled/cloud-free) via CoastWatch ERDDAP.
    - Chlorophyll: NOAA CoastWatch **VIIRS** NRT DINEOF (gap-filled) daily.
    - Currents: NOAA **RTOFS** (HYCOM ESPC-D-V02).
    - Altimetry/SSH: NOAA CoastWatch blended NRT.
    - Bathymetry: NOAA **CUDEM** 1/9 arc-sec (ETOPO global fallback).
    - Point conditions: **NDBC** buoys + Open-Meteo forecast/marine.
  - `supabase/functions/brief` — the AI Captain's Brief (Anthropic; key server-side).
  - `supabase/functions/stripe-checkout` / `stripe-webhook` / `stripe-portal` —
    Stripe Pro subscription (monthly/annual, 7-day trial). Entitlements are written
    only by the webhook and read via `has_premium()` / RLS.
  - `supabase/migrations` — schema, RLS, and the charted-waypoint dataset RPCs.

The **map overlays and the bite score read the same data products**, so what a
captain sees (SST, chlorophyll) matches the forecast.

## Map layers

Bite Map (predictive), Major Fishing Areas (canyons/wrecks/reefs/lumps/ledges),
ports, catches, satellite **SST** (MUR 1 km) & **Chlorophyll** (VIIRS 1 km),
animated **Wind**, **Currents**, **Altimetry**, weather **Radar**, and (Advanced)
Closures and LORAN-C.

## Local development

Serve the repo root over any static server and open `index.html`:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

Edge functions deploy with the Supabase CLI:

```bash
supabase functions deploy ocean
supabase functions deploy brief
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
```

Required function secrets (set in the Supabase dashboard): `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `APP_URL`,
`ALLOWED_ORIGINS`, and the Anthropic API key for the brief function.

## A caution about agentic deploys

Hold any automated tooling to two rules:
1. The service-role key stays server-side; the client only ever uses the anon key.
2. No silent fabrication — if data can't be fetched, the UI says so.
