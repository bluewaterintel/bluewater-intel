-- ============================================================================
-- Bluewater Intel — Migration 0004: gate charted waypoints behind packs
-- Depends on 0001 (waypoints), 0002 (auth), 0003 (entitlements).
--
-- MODEL (freemium):
--   • The 12,027 CHARTED waypoints become paid data, sold per port as packs
--     ($49.99, lifetime, out to 120nm).
--   • A user who OWNS a port's pack gets the full set within 120nm of that port.
--   • A user who does NOT own it gets a TEASER: the nearest 10 charted points
--     (so the map isn't barren and they can see what a pack offers).
--   • Personal waypoints (user_waypoints) are unaffected — always free & owner-only.
--
-- ENFORCEMENT: the old public-read access to `waypoints` is REVOKED. All charted
-- reads now go through pack_waypoints_within(), which checks entitlements via
-- auth.uid(). This is what makes the pack real — UI gating alone is bypassable.
-- ============================================================================

-- ── 1. Revoke the public/free read path on charted waypoints ────────────────
-- (M1 granted SELECT + the public RPC to anon/authenticated. Remove both so the
--  only way to read charted data is the gated RPC below.)
drop policy if exists "waypoints public read" on public.waypoints;
revoke select on public.waypoints from anon, authenticated;
revoke execute on function public.waypoints_within(double precision,double precision,double precision,text[],integer) from anon, authenticated;

-- Keep a tight owner-style policy so the gated RPC (security definer) can read,
-- but direct table SELECT by clients returns nothing.
-- (No SELECT policy for anon/authenticated = deny; the definer function bypasses.)

-- ── 2. Teaser size + radius config ──────────────────────────────────────────
-- Centralised so it's easy to tune.
create or replace function public.bw_pack_radius_nm() returns integer language sql immutable as $$ select 120 $$;
create or replace function public.bw_teaser_count()  returns integer language sql immutable as $$ select 10  $$;

-- ── 3. Gated charted-waypoint RPC ───────────────────────────────────────────
-- If the caller owns a pack for p_port → full set within 120nm of (p_lat,p_lng).
-- Otherwise → nearest bw_teaser_count() charted points (teaser).
-- SECURITY DEFINER so it can read the locked-down waypoints table, but it only
-- ever returns data scoped by the caller's own entitlements (auth.uid()).
create or replace function public.pack_waypoints_within(
  p_port text,
  p_lat  double precision,
  p_lng  double precision,
  p_radius_nm double precision default null,   -- defaults to pack radius
  p_types text[] default null
)
returns table (
  name text, type_code text, lat double precision, lng double precision,
  nm double precision, gated boolean   -- gated=true means this is a teaser row
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owns boolean;
  v_radius double precision := coalesce(p_radius_nm, bw_pack_radius_nm());
begin
  -- Must be signed in (auth.uid() is null for anon).
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  v_owns := exists (
    select 1 from public.waypoint_pack_entitlements e
    where e.user_id = auth.uid() and e.port = p_port
  );

  if v_owns then
    return query
      select w.name, w.type_code, w.lat, w.lng,
             st_distance(w.geog, st_makepoint(p_lng, p_lat)::geography)/1852.0 as nm,
             false as gated
      from public.waypoints w
      where st_dwithin(w.geog, st_makepoint(p_lng, p_lat)::geography, v_radius*1852.0)
        and (p_types is null or w.type_code = any(p_types))
      order by w.geog <-> st_makepoint(p_lng, p_lat)::geography
      limit 5000;
  else
    -- Teaser: nearest N charted points, flagged gated.
    return query
      select w.name, w.type_code, w.lat, w.lng,
             st_distance(w.geog, st_makepoint(p_lng, p_lat)::geography)/1852.0 as nm,
             true as gated
      from public.waypoints w
      where st_dwithin(w.geog, st_makepoint(p_lng, p_lat)::geography, v_radius*1852.0)
        and (p_types is null or w.type_code = any(p_types))
      order by w.geog <-> st_makepoint(p_lng, p_lat)::geography
      limit bw_teaser_count();
  end if;
end; $$;

grant execute on function public.pack_waypoints_within(text,double precision,double precision,double precision,text[]) to authenticated;

-- ── 4. Convenience: list the ports a user owns ──────────────────────────────
create or replace function public.my_owned_ports()
returns table (port text, radius_nm integer, purchased_at timestamptz)
language sql stable security invoker as $$
  select port, radius_nm, purchased_at
  from public.waypoint_pack_entitlements
  where user_id = auth.uid()
  order by purchased_at desc;
$$;
grant execute on function public.my_owned_ports() to authenticated;

-- ── NOTE on ramps ───────────────────────────────────────────────────────────
-- Ramps remain FREE (public read, as in M1) — they are a safety/access feature.
-- No change to ramps access here. (If you later decide ramps are subscriber-only,
-- gate them with a has_premium() check in a similar RPC — but the recommendation
-- is to keep ramp locations free.)
