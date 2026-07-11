# Dataset drift monitoring + owner alerts

Monitors every upstream ocean feed the app depends on and emails the owner when
one drifts. Two kinds of drift are detected:

- **Hard drift** — a dataset 404s / 5xxs / redirects / returns no value (e.g.
  NOAA retiring a dataset id — this has already happened twice in this project:
  `nesdisGeoPolarSSTN5SQNRT` and `nesdisSSH1day`).
- **Soft drift** — the dataset still responds but its newest observation is
  older than its expected latency (a stalled feed).

## Pieces

| Piece | Path | Role |
|-------|------|------|
| Tables | `supabase/migrations/0014_dataset_health.sql` | `dataset_health` snapshot + `health_alert_state` (alert debounce). Service-role only (RLS on, no anon/authenticated policies). |
| Monitor | `supabase/functions/dataset-health/index.ts` | Probes feeds, writes snapshot, emails owner on degradation. `GET` = public snapshot; `POST {action:"run"}` = run (cron secret or owner JWT). |
| Email helper | `supabase/functions/_shared/email.ts` | `sendOwnerEmail()` via Resend HTTP API. Shared with `stripe-webhook`. |
| In-app UI | `index.html` → **Menu → User Admin → System Health** | Green/amber/red per feed, last-checked time, "Run check now". |

## What's watched

**Core** (drives the bite score): SST (MUR `jplMURSST41`), Chlorophyll (VIIRS
DINEOF NRT), Altimetry SSH + geostrophic currents (BLENDED), RTOFS surface
currents (ESPC-D-V02), ETOPO bathymetry.
**Supporting**: NDBC buoys, Open-Meteo forecast, NOAA CO-OPS tides.

Staleness SLAs (amber → red, hours) live in `runAllProbes()` and mirror each
product's real publish latency (e.g. SST 72→144h, chlorophyll 120→240h).

## One-time setup

### 1. Secrets (Supabase → Project Settings → Edge Functions → Secrets)

```
RESEND_API_KEY = re_...                              # you have this
ALERT_EMAIL    = info@bluewaterintel.com             # recipient (comma-sep ok)
ALERT_FROM     = Bluewater Intel <alerts@bluewaterintel.com>   # verified domain
CRON_SECRET    = <long random string>                # openssl rand -hex 32
```

`ALERT_FROM` must use a domain verified in Resend (the same domain you verified
for the auth SMTP integration). `ALERT_EMAIL` (`info@bluewaterintel.com`) must
be a real inbox/forward you can receive at.

### 2. Deploy the functions

```bash
supabase functions deploy dataset-health --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt   # new-subscriber email
```

### 3. Apply the migration

```bash
supabase db push
```

### 4. Schedule the 6-hour run (pg_cron, run once in the SQL editor)

`pg_cron` + `pg_net` are built into Supabase Postgres. This SQL is **not
committed** because it embeds your project ref and cron secret — run it once in
the Dashboard SQL editor, substituting `<PROJECT_REF>` and `<CRON_SECRET>`:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'dataset-health-6h',
  '0 */6 * * *',                       -- 00:00, 06:00, 12:00, 18:00 UTC
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/dataset-health',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body    := jsonb_build_object('action','run')
  );
  $$
);
```

To change the cadence later: `select cron.alter_job(job_id, schedule => '0 */3 * * *');`
To remove: `select cron.unschedule('dataset-health-6h');`
To list: `select * from cron.job;`

## Cost / bandwidth

~12 tiny HTTP requests per run × 4 runs/day ≈ **~48 requests/day**, single-digit
MB/month. Supabase Edge Functions free tier is 500K invocations/month; this uses
~120. Effectively $0.

## Alert behavior

- Sends to `ALERT_EMAIL` (`info@bluewaterintel.com`) via Resend, and every send
  is logged in **Resend → Emails**.
- Debounced by `health_alert_state`: emails only when the overall status gets
  **worse**, on the **first recovery** back to green, or as a **daily reminder**
  while still degraded — never on every 6-hour tick.

## New-subscriber email (bundled)

`stripe-webhook` now emails the owner on `checkout.session.completed` with the
new subscriber's email, tier (trial / Pro Monthly / Pro Annual), and price. It
fires only on the initial signup — plan changes and renewals go through the
portal / `invoice.paid` and are not re-notified. Requires the same Resend
secrets above.

## Public health endpoint

`GET https://<PROJECT_REF>.supabase.co/functions/v1/dataset-health` returns the
current snapshot as JSON (cached 5 min) for the in-app panel or an external
uptime monitor. No auth required (read-only, no secrets exposed).
