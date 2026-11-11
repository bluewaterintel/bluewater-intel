-- The SST composite manifest lives next to the regional PNGs so installed
-- apps can read the painted date without a new build. chart-tiles was
-- image/png only.

update storage.buckets
set allowed_mime_types = array['image/png', 'application/json']::text[]
where id = 'chart-tiles';
