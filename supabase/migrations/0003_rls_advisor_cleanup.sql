-- Optional cleanup for Supabase Security Advisor / dashboard RLS warnings.
-- Run via: node scripts/apply-migration.mjs
-- spatial_ref_sys requires Dashboard SQL Editor (owned by supabase_admin).

-- Remove empty orphan table (RLS on, no policies — blocks all access anyway)
drop table if exists public.waypoints_ramps;
