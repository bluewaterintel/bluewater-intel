-- Raise charted-waypoint fetch ceiling for wide radii (160 nm).
-- NOTE: Supabase PostgREST also enforces api.max_rows (default 1000) on RPC
-- results. Raise that in Dashboard → Project Settings → API → Max Rows (use
-- 10000) or local config.toml [api] max_rows — see supabase-fixes/WAYPOINT_ROW_LIMIT.md.

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
      limit 8000;
  else
    return;
  end if;
end; $$;

grant execute on function public.pack_waypoints_within(text,double precision,double precision,double precision,text[]) to authenticated;
