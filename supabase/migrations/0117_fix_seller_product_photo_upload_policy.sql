-- The Storage RLS policy must not query marketplace_seller_users directly.
-- Direct access to that table is intentionally revoked from authenticated
-- users, so the old policy raised "permission denied for table
-- marketplace_seller_users" when a seller uploaded product photos.
-- Use the existing SECURITY DEFINER access check instead, while keeping each
-- seller's uploads scoped to their own auth uid folder.

drop policy if exists "Sellers upload marketplace product request images"
  on storage.objects;

create policy "Sellers upload marketplace product request images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'marketplace-submissions'
    and split_part(name, '/', 1) = auth.uid()::text
    and public.seller_portal_has_access()
  );
