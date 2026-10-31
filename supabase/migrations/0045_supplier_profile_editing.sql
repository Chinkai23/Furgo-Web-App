-- Section: Supplier account profile
-- Function: Let suppliers manage their personal display name, contact phone, and private profile photo.

alter table public.profiles
  add column if not exists supplier_contact_phone text not null default '',
  add column if not exists avatar_path text;

grant update (display_name, supplier_contact_phone, avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-profile-photos',
  'supplier-profile-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy "Suppliers can view their profile photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'supplier-profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Suppliers can upload their profile photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'supplier-profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.marketplace_supplier_access access
      where access.supplier_user_id = (select auth.uid())
    )
  );

create policy "Suppliers can delete their profile photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'supplier-profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.marketplace_supplier_access access
      where access.supplier_user_id = (select auth.uid())
    )
  );
