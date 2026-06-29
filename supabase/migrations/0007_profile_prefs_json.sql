-- ============================================================================
-- Bluewater Intel — cross-device settings sync
-- Adds a free-form JSON blob column to profiles so that ALL default settings
-- (default species, base map, autozoom, LORAN persistence, home port) follow
-- the signed-in user across every device. The client writes/reads this column
-- via BW_AUTH.saveProfile / fetchProfile. home_port keeps its dedicated column
-- so existing login-resets-to-default behavior and any SQL that reads it work.
-- ============================================================================

alter table public.profiles
  add column if not exists prefs_json text;
