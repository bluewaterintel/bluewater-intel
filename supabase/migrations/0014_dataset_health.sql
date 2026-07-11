-- ============================================================================
-- 0014_dataset_health.sql — dataset drift monitoring
--
-- The `dataset-health` Edge Function probes each upstream ocean feed (SST,
-- chlorophyll, altimetry, RTOFS currents, bathymetry, buoys, forecast, tide) on
-- a schedule, records the result here, and emails the owner on degradation.
--
-- Both tables are written ONLY by the Edge Function using the service role
-- (which bypasses RLS). RLS is enabled with no anon/authenticated policies, so
-- the tables are private; the public "/health" view is served by the function
-- itself (also via the service role), not by direct table access.
-- ============================================================================

create table if not exists public.dataset_health (
  id                    text primary key,           -- stable dataset key, e.g. "sst"
  label                 text not null,               -- human label, e.g. "Sea-surface temperature (MUR)"
  category              text not null default 'core',-- core | supporting
  status                text not null default 'unknown', -- green | amber | red | unknown
  http_status           integer,                     -- last HTTP status from the probe
  latest_obs_at         timestamptz,                 -- newest real observation time upstream
  age_hours             numeric,                     -- age of latest_obs_at at check time
  amber_after_hours     numeric,                     -- staleness SLA → amber
  red_after_hours       numeric,                     -- staleness SLA → red
  sample_value          numeric,                     -- probe sample (e.g. SST °F) — null = no data
  latency_ms            integer,                     -- probe round-trip
  message               text,                        -- short human note on the last result
  consecutive_failures  integer not null default 0,  -- run count since last green
  checked_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.dataset_health is
  'Latest health snapshot per upstream ocean dataset. Written by the dataset-health Edge Function (service role).';

-- Singleton alert-state row so the function can debounce owner emails
-- (only notify on a change for the worse, or re-notify after a quiet period).
create table if not exists public.health_alert_state (
  id             integer primary key default 1,
  last_status    text,                    -- worst overall status at last alert
  last_alert_at  timestamptz,
  constraint health_alert_state_singleton check (id = 1)
);

insert into public.health_alert_state (id, last_status, last_alert_at)
values (1, 'green', null)
on conflict (id) do nothing;

alter table public.dataset_health    enable row level security;
alter table public.health_alert_state enable row level security;

-- No policies granted to anon/authenticated: these tables are service-role only.
-- (Owners read health through the dataset-health function, not the table.)
