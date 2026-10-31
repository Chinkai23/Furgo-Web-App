-- Align supplier Marketplace photo uploads with the 2 MB per-image form limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketplace-submissions',
  'marketplace-submissions',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
