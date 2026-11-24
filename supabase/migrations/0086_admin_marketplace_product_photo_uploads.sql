-- Let marketplace managers upload product photos from the Admin product editor.
-- Files stay in the existing public Marketplace submission-image bucket.
drop policy if exists "Managers upload marketplace product images" on storage.objects;
create policy "Managers upload marketplace product images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marketplace-submissions'
    and split_part(name, '/', 1) = auth.uid()::text
    and public.current_portal_level(auth.uid()) >= 2
  );
