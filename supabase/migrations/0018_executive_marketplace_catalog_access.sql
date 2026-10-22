-- Executives may maintain Marketplace products while offer and service setup remains Manager+.
drop policy if exists "Limit staff app data to their level" on public.app_data;
drop policy if exists "Limit staff app data inserts to their level" on public.app_data;
drop policy if exists "Limit staff app data updates to their level" on public.app_data;

create policy "Limit staff app data to their level"
  on public.app_data as restrictive for select to authenticated
  using (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in ('furgo-demo-marketplace-orders','furgo-demo-hotel-bookings','furgo-demo-daycare-bookings','furgo-demo-daycare-orders'))
    or (scope = 'shared' and storage_key = 'furgo-demo-marketplace-products' and (select public.current_portal_level(auth.uid())) >= 1)
    or ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key in ('furgo-demo-promotions','furgo-demo-marketplace-offers','furgo-demo-hotel-settings','furgo-demo-daycare-settings'))
  );

create policy "Limit staff app data inserts to their level"
  on public.app_data as restrictive for insert to authenticated
  with check (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in ('furgo-demo-marketplace-orders','furgo-demo-hotel-bookings','furgo-demo-daycare-bookings','furgo-demo-daycare-orders'))
    or (scope = 'shared' and storage_key = 'furgo-demo-marketplace-products' and (select public.current_portal_level(auth.uid())) >= 1)
    or ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key in ('furgo-demo-promotions','furgo-demo-marketplace-offers','furgo-demo-hotel-settings','furgo-demo-daycare-settings'))
  );

create policy "Limit staff app data updates to their level"
  on public.app_data as restrictive for update to authenticated
  using (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in ('furgo-demo-marketplace-orders','furgo-demo-hotel-bookings','furgo-demo-daycare-bookings','furgo-demo-daycare-orders'))
    or (scope = 'shared' and storage_key = 'furgo-demo-marketplace-products' and (select public.current_portal_level(auth.uid())) >= 1)
    or ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key in ('furgo-demo-promotions','furgo-demo-marketplace-offers','furgo-demo-hotel-settings','furgo-demo-daycare-settings'))
  )
  with check (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in ('furgo-demo-marketplace-orders','furgo-demo-hotel-bookings','furgo-demo-daycare-bookings','furgo-demo-daycare-orders'))
    or (scope = 'shared' and storage_key = 'furgo-demo-marketplace-products' and (select public.current_portal_level(auth.uid())) >= 1)
    or ((select public.current_portal_level(auth.uid())) >= 2 and scope = 'shared' and storage_key in ('furgo-demo-promotions','furgo-demo-marketplace-offers','furgo-demo-hotel-settings','furgo-demo-daycare-settings'))
  );

create policy "Executives can read Marketplace catalog"
  on public.app_data for select to authenticated
  using (
    (select public.current_portal_level(auth.uid())) >= 1
    and scope = 'shared'
    and storage_key = 'furgo-demo-marketplace-products'
  );
create policy "Executives can insert Marketplace catalog"
  on public.app_data for insert to authenticated
  with check (
    (select public.current_portal_level(auth.uid())) >= 1
    and scope = 'shared'
    and storage_key = 'furgo-demo-marketplace-products'
  );
create policy "Executives can update Marketplace catalog"
  on public.app_data for update to authenticated
  using (
    (select public.current_portal_level(auth.uid())) >= 1
    and scope = 'shared'
    and storage_key = 'furgo-demo-marketplace-products'
  )
  with check (
    (select public.current_portal_level(auth.uid())) >= 1
    and scope = 'shared'
    and storage_key = 'furgo-demo-marketplace-products'
  );
