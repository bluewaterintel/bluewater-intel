-- PostGIS spatial_ref_sys RLS fix — run ONLY in Supabase Dashboard → SQL Editor.
-- The pooler postgres role cannot ALTER this table (owner: supabase_admin).

alter table if exists public.spatial_ref_sys enable row level security;
drop policy if exists "spatial_ref_sys public read" on public.spatial_ref_sys;
create policy "spatial_ref_sys public read"
  on public.spatial_ref_sys for select
  to anon, authenticated
  using (true);
