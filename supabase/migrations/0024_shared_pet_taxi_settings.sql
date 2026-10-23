-- Keep the shared Pet Taxi catalog restricted to Manager/Director while allowing
-- all service booking pages to read the same Admin-managed settings record.
drop policy if exists "Limit staff app data to their level" on public.app_data;
drop policy if exists "Limit staff app data inserts to their level" on public.app_data;
drop policy if exists "Limit staff app data updates to their level" on public.app_data;

create policy "Limit staff app data to their level"
  on public.app_data as restrictive for select to authenticated
  using (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in (
      'furgo-demo-marketplace-orders',
      'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings',
      'furgo-demo-daycare-orders',
      'furgo-demo-check-in-tokens'
    ))
    or (scope = 'shared' and storage_key = 'furgo-demo-marketplace-products' and (select public.current_portal_level(auth.uid())) >= 1)
    or ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key in (
      'furgo-demo-promotions',
      'furgo-demo-marketplace-offers',
      'furgo-demo-hotel-settings',
      'furgo-demo-daycare-settings',
      'furgo-demo-pet-taxi-settings'
    ))
  );

create policy "Limit staff app data inserts to their level"
  on public.app_data as restrictive for insert to authenticated
  with check (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in (
      'furgo-demo-marketplace-orders',
      'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings',
      'furgo-demo-daycare-orders',
      'furgo-demo-check-in-tokens'
    ))
    or (scope = 'shared' and storage_key = 'furgo-demo-marketplace-products' and (select public.current_portal_level(auth.uid())) >= 1)
    or ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key in (
      'furgo-demo-promotions',
      'furgo-demo-marketplace-offers',
      'furgo-demo-hotel-settings',
      'furgo-demo-daycare-settings',
      'furgo-demo-pet-taxi-settings'
    ))
  );

create policy "Limit staff app data updates to their level"
  on public.app_data as restrictive for update to authenticated
  using (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in (
      'furgo-demo-marketplace-orders',
      'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings',
      'furgo-demo-daycare-orders',
      'furgo-demo-check-in-tokens'
    ))
    or (scope = 'shared' and storage_key = 'furgo-demo-marketplace-products' and (select public.current_portal_level(auth.uid())) >= 1)
    or ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key in (
      'furgo-demo-promotions',
      'furgo-demo-marketplace-offers',
      'furgo-demo-hotel-settings',
      'furgo-demo-daycare-settings',
      'furgo-demo-pet-taxi-settings'
    ))
  )
  with check (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in (
      'furgo-demo-marketplace-orders',
      'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings',
      'furgo-demo-daycare-orders',
      'furgo-demo-check-in-tokens'
    ))
    or (scope = 'shared' and storage_key = 'furgo-demo-marketplace-products' and (select public.current_portal_level(auth.uid())) >= 1)
    or ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key in (
      'furgo-demo-promotions',
      'furgo-demo-marketplace-offers',
      'furgo-demo-hotel-settings',
      'furgo-demo-daycare-settings',
      'furgo-demo-pet-taxi-settings'
    ))
  );

create policy "Managers can read shared Pet Taxi settings"
  on public.app_data for select to authenticated
  using ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key = 'furgo-demo-pet-taxi-settings');

create policy "Managers can insert shared Pet Taxi settings"
  on public.app_data for insert to authenticated
  with check ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key = 'furgo-demo-pet-taxi-settings');

create policy "Managers can update shared Pet Taxi settings"
  on public.app_data for update to authenticated
  using ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key = 'furgo-demo-pet-taxi-settings')
  with check ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key = 'furgo-demo-pet-taxi-settings');
