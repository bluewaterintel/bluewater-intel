-- ============================================================================
-- Bluewater Intel — Milestone: first-party community fishing reports (forum)
-- Replaces the old scraped/synthetic "SOCIAL" feed with REAL user-posted reports.
--
-- Privacy / de-identification:
--   • The base table holds user_id (so authors can manage their own posts) and is
--     NOT publicly readable — RLS restricts base-table reads to the author.
--   • The PUBLIC, de-identified VIEW (fishing_reports_public) is what everyone
--     reads. It NEVER exposes user_id or any PII — only a stable pseudonymous
--     handle derived from a hash of the user id, the coarse region, the post body,
--     species, created_at, and coordinates ROUNDED to ~0.1° (~6 nm) so exact
--     fishing spots aren't published.
-- ============================================================================

create table if not exists public.fishing_reports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  region     text not null check (region in ('new_england','mid_atlantic','southeast','gulf')),
  species    text,                       -- optional species id (matches client SPECIES ids)
  lat        double precision,           -- optional approximate location (feeds the reports factor)
  lng        double precision,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists fishing_reports_region_created_idx on public.fishing_reports (region, created_at desc);
create index if not exists fishing_reports_created_idx on public.fishing_reports (created_at desc);

-- Table-level grants (RLS still restricts rows). Explicit so this works whether or
-- not the project auto-exposes new tables to the Data API roles.
grant select, insert, update, delete on public.fishing_reports to authenticated;

-- ── Row Level Security — authors manage their own rows; base table is private ──
alter table public.fishing_reports enable row level security;

drop policy if exists fishing_reports_insert_own on public.fishing_reports;
create policy fishing_reports_insert_own on public.fishing_reports
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists fishing_reports_update_own on public.fishing_reports;
create policy fishing_reports_update_own on public.fishing_reports
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists fishing_reports_delete_own on public.fishing_reports;
create policy fishing_reports_delete_own on public.fishing_reports
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists fishing_reports_select_own on public.fishing_reports;
create policy fishing_reports_select_own on public.fishing_reports
  for select to authenticated using (auth.uid() = user_id);

-- ── De-identified PUBLIC view (the only thing clients read for the forum) ──────
-- security_invoker = false (default): the view runs as its owner and therefore
-- bypasses the base-table RLS, but it can ONLY ever return the de-identified
-- columns selected here. No user_id, no email — just a stable hashed handle.
create or replace view public.fishing_reports_public as
select
  id,
  region,
  species,
  round(lat::numeric, 1)::double precision as lat,   -- ~6 nm — protect exact spots
  round(lng::numeric, 1)::double precision as lng,
  body,
  created_at,
  'Angler-' || upper(substr(md5(user_id::text), 1, 6)) as handle
from public.fishing_reports;

grant select on public.fishing_reports_public to anon, authenticated;
