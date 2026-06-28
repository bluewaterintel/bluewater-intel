-- ============================================================================
-- Bluewater Intel — Migration 0005: billing entitlements + brief limits
--
-- Model:
--   • Subscription (monthly/annual) → has_premium = true. Unlocks app features
--     and up to 2 AI briefs/day. Does NOT include charted waypoints.
--   • Lifetime (one-time)           → subscription_status='lifetime'. Everything,
--     including ALL charted waypoints (ME→TX) and 2 briefs/day.
--   • Waypoint pack (one-time/port) → waypoint_pack_entitlements row. Unlocks
--     that port's charted waypoints (120nm). Independent of subscription.
--   • Owner                         → everything, unlimited.
-- ============================================================================

-- ── has_premium(): app access. Owner / lifetime / active|trialing sub. ───────
create or replace function public.has_premium()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.is_owner = true
        or p.subscription_status in ('trialing', 'active', 'lifetime')
        or (p.current_period_end is not null and p.current_period_end > now())
        or (p.trial_end is not null and p.trial_end > now())
      )
  );
$$;
grant execute on function public.has_premium() to authenticated;

-- ── Pack config (idempotent) ────────────────────────────────────────────────
create or replace function public.bw_pack_radius_nm() returns integer language sql immutable as $$ select 120 $$;
create or replace function public.bw_teaser_count()  returns integer language sql immutable as $$ select 10  $$;

-- ── has_waypoint_access(port): owner OR lifetime OR owns that port's pack. ────
-- (A plain monthly/annual subscription does NOT include waypoints.)
create or replace function public.has_waypoint_access(p_port text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid()
                 and (p.is_owner = true or p.subscription_status = 'lifetime'))
      or exists (select 1 from public.waypoint_pack_entitlements e
                 where e.user_id = auth.uid() and e.port = p_port);
$$;
grant execute on function public.has_waypoint_access(text) to authenticated;

-- ── Gated charted-waypoint read ─────────────────────────────────────────────
-- Full set within radius (capped to 120nm) for entitled users; otherwise a
-- nearest-N teaser flagged gated=true. SECURITY DEFINER so it can read the
-- locked-down waypoints table, but scoped to the caller's entitlements.
create or replace function public.pack_waypoints_within(
  p_port text,
  p_lat  double precision,
  p_lng  double precision,
  p_radius_nm double precision default null,
  p_types text[] default null
)
returns table (name text, type_code text, lat double precision, lng double precision, nm double precision, gated boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_full boolean;
  v_radius double precision := least(coalesce(p_radius_nm, bw_pack_radius_nm()), bw_pack_radius_nm());
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  v_full := public.has_waypoint_access(p_port);
  if v_full then
    return query
      select w.name, w.type_code, w.lat, w.lng,
             st_distance(w.geog, st_makepoint(p_lng, p_lat)::geography)/1852.0 as nm, false as gated
      from public.waypoints w
      where st_dwithin(w.geog, st_makepoint(p_lng, p_lat)::geography, v_radius*1852.0)
        and (p_types is null or w.type_code = any(p_types))
      order by w.geog <-> st_makepoint(p_lng, p_lat)::geography
      limit 5000;
  else
    return query
      select w.name, w.type_code, w.lat, w.lng,
             st_distance(w.geog, st_makepoint(p_lng, p_lat)::geography)/1852.0 as nm, true as gated
      from public.waypoints w
      where st_dwithin(w.geog, st_makepoint(p_lng, p_lat)::geography, bw_pack_radius_nm()*1852.0)
        and (p_types is null or w.type_code = any(p_types))
      order by w.geog <-> st_makepoint(p_lng, p_lat)::geography
      limit bw_teaser_count();
  end if;
end; $$;
grant execute on function public.pack_waypoints_within(text,double precision,double precision,double precision,text[]) to authenticated;

-- ── Count of charted waypoints a pack would unlock for a port (no coords). ───
-- Used by the port picker to show "you'll unlock N waypoints". Safe to expose:
-- returns only a number, never positions.
create or replace function public.pack_port_count(p_lat double precision, p_lng double precision)
returns integer language sql stable security definer set search_path = public, extensions as $$
  select count(*)::int from public.waypoints w
  where st_dwithin(w.geog, st_makepoint(p_lng, p_lat)::geography, bw_pack_radius_nm()*1852.0);
$$;
grant execute on function public.pack_port_count(double precision,double precision) to authenticated;

-- ── My owned ports (for the UI) ─────────────────────────────────────────────
create or replace function public.my_owned_ports()
returns table (port text, radius_nm integer, purchased_at timestamptz)
language sql stable security invoker as $$
  select port, radius_nm, purchased_at from public.waypoint_pack_entitlements
  where user_id = auth.uid() order by purchased_at desc;
$$;
grant execute on function public.my_owned_ports() to authenticated;

-- ── AI brief daily usage (2/day for premium; owners unlimited; free = none) ──
create table if not exists public.user_brief_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.user_brief_usage enable row level security;  -- definer-only access

create or replace function public.brief_consume(p_limit int default 2)
returns json language plpgsql security definer set search_path = public as $$
declare v_count int; v_owner boolean;
begin
  if auth.uid() is null then return json_build_object('allowed', false, 'reason', 'auth'); end if;
  if not public.has_premium() then return json_build_object('allowed', false, 'reason', 'premium'); end if;
  select coalesce(p.is_owner, false) into v_owner from public.profiles p where p.id = auth.uid();
  insert into public.user_brief_usage (user_id, day, count) values (auth.uid(), current_date, 0)
    on conflict (user_id, day) do nothing;
  select count into v_count from public.user_brief_usage where user_id = auth.uid() and day = current_date;
  if v_owner then
    update public.user_brief_usage set count = count + 1 where user_id = auth.uid() and day = current_date;
    return json_build_object('allowed', true, 'remaining', 9999);
  end if;
  if v_count >= p_limit then
    return json_build_object('allowed', false, 'reason', 'limit', 'remaining', 0, 'limit', p_limit);
  end if;
  update public.user_brief_usage set count = count + 1 where user_id = auth.uid() and day = current_date;
  return json_build_object('allowed', true, 'remaining', p_limit - (v_count + 1), 'limit', p_limit);
end; $$;
grant execute on function public.brief_consume(int) to authenticated;
