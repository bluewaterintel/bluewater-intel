-- ============================================================================
-- Bluewater Intel — Migration 0006: 7-day trial gating refinements
--
--   • AI Captain's Brief is PAID-only (active subscription / lifetime / owner).
--     Trial users do NOT get the brief.
--   • Charted-waypoint TEASER (nearest 10) is shown to trial + subscribers as a
--     taste; lapsed/free users get NOTHING charted (only purchased packs +
--     personal waypoints). Full set still requires owner / lifetime / pack.
-- ============================================================================

-- Paid (real money on file & active) — excludes 'trialing'.
create or replace function public.has_paid()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.is_owner = true or p.subscription_status in ('active', 'lifetime'))
  );
$$;
grant execute on function public.has_paid() to authenticated;

-- Brief: require PAID (not trial), then the 2/day limit (owners unlimited).
create or replace function public.brief_consume(p_limit int default 2)
returns json language plpgsql security definer set search_path = public as $$
declare v_count int; v_owner boolean;
begin
  if auth.uid() is null then return json_build_object('allowed', false, 'reason', 'auth'); end if;
  if not public.has_paid() then return json_build_object('allowed', false, 'reason', 'premium'); end if;
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

-- Charted waypoints: full for entitled; teaser for premium (trial/subscriber);
-- nothing for free/lapsed (they keep only purchased packs + personal waypoints).
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
  elsif public.has_premium() then
    return query
      select w.name, w.type_code, w.lat, w.lng,
             st_distance(w.geog, st_makepoint(p_lng, p_lat)::geography)/1852.0 as nm, true as gated
      from public.waypoints w
      where st_dwithin(w.geog, st_makepoint(p_lng, p_lat)::geography, bw_pack_radius_nm()*1852.0)
        and (p_types is null or w.type_code = any(p_types))
      order by w.geog <-> st_makepoint(p_lng, p_lat)::geography
      limit bw_teaser_count();
  else
    return; -- free/lapsed: no charted waypoints (only their packs + personal)
  end if;
end; $$;
grant execute on function public.pack_waypoints_within(text,double precision,double precision,double precision,text[]) to authenticated;
