-- Store public service-promotion images in Supabase Storage, while restricting
-- upload, replacement, and removal to Manager and Director portal levels.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-banners',
  'service-banners',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can view service promotion banners"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'service-banners');

create policy "Managers can upload service promotion banners"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'service-banners' and (select public.current_portal_level(auth.uid())) >= 2);

create policy "Managers can replace service promotion banners"
  on storage.objects for update to authenticated
  using (bucket_id = 'service-banners' and (select public.current_portal_level(auth.uid())) >= 2)
  with check (bucket_id = 'service-banners' and (select public.current_portal_level(auth.uid())) >= 2);

create policy "Managers can remove service promotion banners"
  on storage.objects for delete to authenticated
  using (bucket_id = 'service-banners' and (select public.current_portal_level(auth.uid())) >= 2);

-- Add the shared banner manifest to the existing staff-level app_data rules.
drop policy if exists "Limit staff app data to their level" on public.app_data;
drop policy if exists "Limit staff app data inserts to their level" on public.app_data;
drop policy if exists "Limit staff app data updates to their level" on public.app_data;

create policy "Limit staff app data to their level"
  on public.app_data as restrictive for select to authenticated
  using (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in (
      'furgo-demo-marketplace-orders', 'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings', 'furgo-demo-daycare-orders',
      'furgo-demo-check-in-tokens'
    ))
    or (scope = 'shared' and storage_key = 'furgo-demo-marketplace-products' and (select public.current_portal_level(auth.uid())) >= 1)
    or ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key in (
      'furgo-demo-promotions', 'furgo-demo-marketplace-offers',
      'furgo-demo-hotel-settings', 'furgo-demo-daycare-settings',
      'furgo-demo-pet-taxi-settings', 'furgo-demo-service-banners'
    ))
  );

create policy "Limit staff app data inserts to their level"
  on public.app_data as restrictive for insert to authenticated
  with check (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in (
      'furgo-demo-marketplace-orders', 'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings', 'furgo-demo-daycare-orders',
      'furgo-demo-check-in-tokens'
    ))
    or (scope = 'shared' and storage_key = 'furgo-demo-marketplace-products' and (select public.current_portal_level(auth.uid())) >= 1)
    or ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key in (
      'furgo-demo-promotions', 'furgo-demo-marketplace-offers',
      'furgo-demo-hotel-settings', 'furgo-demo-daycare-settings',
      'furgo-demo-pet-taxi-settings', 'furgo-demo-service-banners'
    ))
  );

create policy "Limit staff app data updates to their level"
  on public.app_data as restrictive for update to authenticated
  using (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in (
      'furgo-demo-marketplace-orders', 'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings', 'furgo-demo-daycare-orders',
      'furgo-demo-check-in-tokens'
    ))
    or (scope = 'shared' and storage_key = 'furgo-demo-marketplace-products' and (select public.current_portal_level(auth.uid())) >= 1)
    or ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key in (
      'furgo-demo-promotions', 'furgo-demo-marketplace-offers',
      'furgo-demo-hotel-settings', 'furgo-demo-daycare-settings',
      'furgo-demo-pet-taxi-settings', 'furgo-demo-service-banners'
    ))
  )
  with check (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in (
      'furgo-demo-marketplace-orders', 'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings', 'furgo-demo-daycare-orders',
      'furgo-demo-check-in-tokens'
    ))
    or (scope = 'shared' and storage_key = 'furgo-demo-marketplace-products' and (select public.current_portal_level(auth.uid())) >= 1)
    or ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key in (
      'furgo-demo-promotions', 'furgo-demo-marketplace-offers',
      'furgo-demo-hotel-settings', 'furgo-demo-daycare-settings',
      'furgo-demo-pet-taxi-settings', 'furgo-demo-service-banners'
    ))
  );

create policy "Managers can read service promotion banner settings"
  on public.app_data for select to authenticated
  using (scope = 'shared' and storage_key = 'furgo-demo-service-banners' and (select public.current_portal_level(auth.uid())) >= 2);

create policy "Managers can create service promotion banner settings"
  on public.app_data for insert to authenticated
  with check (scope = 'shared' and storage_key = 'furgo-demo-service-banners' and (select public.current_portal_level(auth.uid())) >= 2);

create policy "Managers can update service promotion banner settings"
  on public.app_data for update to authenticated
  using (scope = 'shared' and storage_key = 'furgo-demo-service-banners' and (select public.current_portal_level(auth.uid())) >= 2)
  with check (scope = 'shared' and storage_key = 'furgo-demo-service-banners' and (select public.current_portal_level(auth.uid())) >= 2);
