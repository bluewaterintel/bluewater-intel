-- ============================================================================
-- Bluewater Intel — Backend Milestone 1
-- Waypoints + Ramps: schema, PostGIS spatial index, and radius-query RPCs.
--
-- GOVERNING PRINCIPLE: real data or an honest absence of data. This migration
-- moves the 12,027 inlined fishing waypoints and 643 boat ramps into Postgres
-- with PostGIS so the client can ask "what's within N nm of this port" natively,
-- instead of shipping a ~1.2 MB blob in the HTML and filtering in the browser.
--
-- This milestone touches NEITHER the prediction engine NOR the AI brief. It is
-- public reference data (read-only to clients), so no row-level security is
-- needed here — RLS arrives in Milestone 2 with user accounts and private spots.
--
-- Run order: this is migration 0001. Apply with `supabase db push` or the SQL
-- editor. Idempotent where practical (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
-- PostGIS provides the geography type + ST_DWithin radius queries.
create extension if not exists postgis;

-- ── Reference: waypoint type lookup ─────────────────────────────────────────
-- Mirrors window.BW_WAYPOINTS.types (code -> human label). Keeping it as a real
-- table (rather than a client-side constant) lets the type list live in one place
-- and lets the API return a readable label without the client hard-coding it.
create table if not exists public.waypoint_types (
  code  text primary key,            -- "wk", "rf", ...
  label text not null                -- "Wreck", "Reef", ...
);

-- ── Fishing waypoints ───────────────────────────────────────────────────────
-- geog is the source of truth for location; lat/lng are kept as plain columns
-- too so the API can return them directly without ST_X/ST_Y on every row.
create table if not exists public.waypoints (
  id         bigint generated always as identity primary key,
  name       text not null,
  type_code  text not null references public.waypoint_types(code),
  lat        double precision not null,
  lng        double precision not null,
  geog       geography(point, 4326) not null,
  created_at timestamptz not null default now()
);

-- ── Boat ramps ──────────────────────────────────────────────────────────────
create table if not exists public.ramps (
  id         bigint generated always as identity primary key,
  name       text not null,
  lat        double precision not null,
  lng        double precision not null,
  geog       geography(point, 4326) not null,
  created_at timestamptz not null default now()
);

-- ── Spatial indexes ─────────────────────────────────────────────────────────
-- GIST on the geography column is what makes "within N nm of port" fast.
create index if not exists waypoints_geog_idx on public.waypoints using gist (geog);
create index if not exists ramps_geog_idx     on public.ramps     using gist (geog);
-- Secondary index to filter by type cheaply (the client has a type filter).
create index if not exists waypoints_type_idx on public.waypoints (type_code);

-- ── Radius query RPCs ───────────────────────────────────────────────────────
-- These replace the client-side haversine loop. The client passes the active
-- port's lat/lng + radius (in nautical miles) and optional type filter; Postgres
-- returns only the in-range rows with computed distance, nearest-first.
--
-- 1 nautical mile = 1852 meters. ST_DWithin uses meters for geography.
-- We SET a hard LIMIT inside the function as a safety valve so a huge radius
-- can never return an unbounded result set to a phone.

create or replace function public.waypoints_within(
  p_lat       double precision,
  p_lng       double precision,
  p_radius_nm double precision,
  p_types     text[] default null,      -- null = all types
  p_limit     integer default 5000
)
returns table (
  id        bigint,
  name      text,
  type_code text,
  lat       double precision,
  lng       double precision,
  nm        double precision            -- distance from (p_lat,p_lng) in nautical miles
)
language sql
stable
parallel safe
as $$
  select
    w.id,
    w.name,
    w.type_code,
    w.lat,
    w.lng,
    st_distance(w.geog, st_makepoint(p_lng, p_lat)::geography) / 1852.0 as nm
  from public.waypoints w
  where st_dwithin(
          w.geog,
          st_makepoint(p_lng, p_lat)::geography,
          p_radius_nm * 1852.0
        )
    and (p_types is null or w.type_code = any(p_types))
  order by w.geog <-> st_makepoint(p_lng, p_lat)::geography
  limit greatest(1, least(p_limit, 5000));
$$;

create or replace function public.ramps_within(
  p_lat       double precision,
  p_lng       double precision,
  p_radius_nm double precision,
  p_limit     integer default 2000
)
returns table (
  id   bigint,
  name text,
  lat  double precision,
  lng  double precision,
  nm   double precision
)
language sql
stable
parallel safe
as $$
  select
    r.id,
    r.name,
    r.lat,
    r.lng,
    st_distance(r.geog, st_makepoint(p_lng, p_lat)::geography) / 1852.0 as nm
  from public.ramps r
  where st_dwithin(
          r.geog,
          st_makepoint(p_lng, p_lat)::geography,
          p_radius_nm * 1852.0
        )
  order by r.geog <-> st_makepoint(p_lng, p_lat)::geography
  limit greatest(1, least(p_limit, 2000));
$$;

-- ── Read access ─────────────────────────────────────────────────────────────
-- Public reference data: anon + authenticated may read the tables and call the
-- RPCs. Writes are NOT granted to clients (seeding happens server-side via the
-- service role, which bypasses these grants).
--
-- We enable RLS and add explicit read-only policies rather than leaving the
-- tables open, so the security posture is intentional and consistent with the
-- rest of the project (Milestone 2 adds user tables with stricter policies).
alter table public.waypoints      enable row level security;
alter table public.ramps          enable row level security;
alter table public.waypoint_types enable row level security;

drop policy if exists "waypoints public read"      on public.waypoints;
drop policy if exists "ramps public read"          on public.ramps;
drop policy if exists "waypoint_types public read"  on public.waypoint_types;

create policy "waypoints public read"
  on public.waypoints for select
  to anon, authenticated
  using (true);

create policy "ramps public read"
  on public.ramps for select
  to anon, authenticated
  using (true);

create policy "waypoint_types public read"
  on public.waypoint_types for select
  to anon, authenticated
  using (true);

-- Allow the RPCs to be executed by clients.
grant execute on function public.waypoints_within(double precision, double precision, double precision, text[], integer) to anon, authenticated;
grant execute on function public.ramps_within(double precision, double precision, double precision, integer) to anon, authenticated;
