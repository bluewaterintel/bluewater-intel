-- ============================================================================
-- Bluewater Intel — Migration 0011: Pro subscription includes all charted waypoints
--
-- Paid subscribers (trial, active, lifetime, owner) get the FULL charted
-- waypoint dataset for their port radius — not a teaser and not a separate pack.
-- Legacy per-port pack purchases (waypoint_pack_entitlements) still work if
-- someone bought one before this change and later lapses subscription.
-- ============================================================================

create or replace function public.has_waypoint_access(p_port text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_premium()
      or exists (
        select 1 from public.waypoint_pack_entitlements e
        where e.user_id = auth.uid() and e.port = p_port
      );
$$;

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
    return;
  end if;
end; $$;

grant execute on function public.has_waypoint_access(text) to authenticated;
grant execute on function public.pack_waypoints_within(text,double precision,double precision,double precision,text[]) to authenticated;
