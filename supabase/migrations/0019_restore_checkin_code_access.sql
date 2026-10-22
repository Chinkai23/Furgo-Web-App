-- Migration 0018 replaced the staff app_data restrictions and accidentally removed
-- check-in tokens from the operation allow-list. Restore staff access so codes can
-- be read and consumed across customer and Admin devices.

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
      'furgo-demo-daycare-settings'
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
      'furgo-demo-daycare-settings'
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
      'furgo-demo-daycare-settings'
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
      'furgo-demo-daycare-settings'
    ))
  );
