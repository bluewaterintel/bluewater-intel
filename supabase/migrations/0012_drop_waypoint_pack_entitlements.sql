-- ============================================================================
-- Bluewater Intel — Migration 0012: remove discontinued per-port waypoint packs
--
-- Charted waypoints are gated solely by Pro subscription (has_premium).
-- No customers purchased per-port packs before packs were retired.
-- ============================================================================

create or replace function public.has_waypoint_access(p_port text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_premium();
$$;

drop function if exists public.my_owned_ports();

drop policy if exists waypoint_pack_entitlements_own_select on public.waypoint_pack_entitlements;
drop table if exists public.waypoint_pack_entitlements;

grant execute on function public.has_waypoint_access(text) to authenticated;
