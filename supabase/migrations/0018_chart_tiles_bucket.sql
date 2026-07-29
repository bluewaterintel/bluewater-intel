-- Public storage bucket for Depth Contours map tiles.
-- Contour tiles are uploaded to contours/v1/ via chart-basemap/upload script.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chart-tiles',
  'chart-tiles',
  true,
  5242880,
  array['image/png']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Allow anonymous read of all objects in chart-tiles (required for Leaflet tile loads).
drop policy if exists "Public read chart tiles" on storage.objects;
create policy "Public read chart tiles"
  on storage.objects for select
  to public
  using (bucket_id = 'chart-tiles');

-- Service role / authenticated uploads (CLI uploader uses project credentials).
drop policy if exists "Service role upload chart tiles" on storage.objects;
create policy "Service role upload chart tiles"
  on storage.objects for insert
  to authenticated, service_role
  with check (bucket_id = 'chart-tiles');

drop policy if exists "Service role update chart tiles" on storage.objects;
create policy "Service role update chart tiles"
  on storage.objects for update
  to authenticated, service_role
  using (bucket_id = 'chart-tiles');
