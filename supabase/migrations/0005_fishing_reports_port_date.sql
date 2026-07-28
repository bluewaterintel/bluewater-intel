-- Fishing reports: port fished from + trip date (post may come days later).
alter table public.fishing_reports
  add column if not exists port text,
  add column if not exists fished_at date;

create index if not exists fishing_reports_fished_at_idx
  on public.fishing_reports (fished_at desc nulls last);

-- Refresh de-identified public view (port + trip date are safe to expose).
create or replace view public.fishing_reports_public as
select
  id,
  region,
  species,
  port,
  fished_at,
  round(lat::numeric, 1)::double precision as lat,
  round(lng::numeric, 1)::double precision as lng,
  body,
  created_at,
  'Angler-' || upper(substr(md5(user_id::text), 1, 6)) as handle
from public.fishing_reports;

grant select on public.fishing_reports_public to anon, authenticated;
