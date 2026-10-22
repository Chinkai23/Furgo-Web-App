-- Managers can operate the shared service/catalog settings while Executives remain order-only.
drop policy if exists "Limit staff app data to order rows" on public.app_data;
drop policy if exists "Limit staff app data inserts to order rows" on public.app_data;
drop policy if exists "Limit staff app data updates to order rows" on public.app_data;

create policy "Limit staff app data to their level"
  on public.app_data as restrictive for select to authenticated
  using (
    not public.has_role((select auth.uid()), 'staff')
    or (
      scope = 'operation' and storage_key in ('furgo-demo-marketplace-orders','furgo-demo-hotel-bookings','furgo-demo-daycare-bookings','furgo-demo-daycare-orders')
    )
    or (
      (select public.current_portal_level(auth.uid())) >= 2
      and scope = 'shared'
      and storage_key in ('furgo-demo-promotions','furgo-demo-marketplace-products','furgo-demo-marketplace-offers','furgo-demo-hotel-settings','furgo-demo-daycare-settings')
    )
  );
create policy "Limit staff app data inserts to their level"
  on public.app_data as restrictive for insert to authenticated
  with check (
    not public.has_role((select auth.uid()), 'staff')
    or (
      (select public.current_portal_level(auth.uid())) >= 2
      and scope = 'shared'
      and storage_key in ('furgo-demo-promotions','furgo-demo-marketplace-products','furgo-demo-marketplace-offers','furgo-demo-hotel-settings','furgo-demo-daycare-settings')
    )
    or (
      scope = 'operation' and storage_key in ('furgo-demo-marketplace-orders','furgo-demo-hotel-bookings','furgo-demo-daycare-bookings','furgo-demo-daycare-orders')
    )
  );
create policy "Limit staff app data updates to their level"
  on public.app_data as restrictive for update to authenticated
  using (
    not public.has_role((select auth.uid()), 'staff')
    or (
      scope = 'operation' and storage_key in ('furgo-demo-marketplace-orders','furgo-demo-hotel-bookings','furgo-demo-daycare-bookings','furgo-demo-daycare-orders')
    )
    or (
      (select public.current_portal_level(auth.uid())) >= 2
      and scope = 'shared'
      and storage_key in ('furgo-demo-promotions','furgo-demo-marketplace-products','furgo-demo-marketplace-offers','furgo-demo-hotel-settings','furgo-demo-daycare-settings')
    )
  )
  with check (
    not public.has_role((select auth.uid()), 'staff')
    or (
      (select public.current_portal_level(auth.uid())) >= 2
      and scope = 'shared'
      and storage_key in ('furgo-demo-promotions','furgo-demo-marketplace-products','furgo-demo-marketplace-offers','furgo-demo-hotel-settings','furgo-demo-daycare-settings')
    )
    or (
      scope = 'operation' and storage_key in ('furgo-demo-marketplace-orders','furgo-demo-hotel-bookings','furgo-demo-daycare-bookings','furgo-demo-daycare-orders')
    )
  );

create policy "Managers can insert managed shared settings"
  on public.app_data for insert to authenticated
  with check (
    (select public.current_portal_level(auth.uid())) >= 2
    and scope = 'shared'
    and storage_key in ('furgo-demo-promotions','furgo-demo-marketplace-products','furgo-demo-marketplace-offers','furgo-demo-hotel-settings','furgo-demo-daycare-settings')
  );
create policy "Managers can read managed shared settings"
  on public.app_data for select to authenticated
  using (
    (select public.current_portal_level(auth.uid())) >= 2
    and scope = 'shared'
    and storage_key in ('furgo-demo-promotions','furgo-demo-marketplace-products','furgo-demo-marketplace-offers','furgo-demo-hotel-settings','furgo-demo-daycare-settings')
  );
create policy "Managers can update managed shared settings"
  on public.app_data for update to authenticated
  using (
    (select public.current_portal_level(auth.uid())) >= 2
    and scope = 'shared'
    and storage_key in ('furgo-demo-promotions','furgo-demo-marketplace-products','furgo-demo-marketplace-offers','furgo-demo-hotel-settings','furgo-demo-daycare-settings')
  )
  with check (
    (select public.current_portal_level(auth.uid())) >= 2
    and scope = 'shared'
    and storage_key in ('furgo-demo-promotions','furgo-demo-marketplace-products','furgo-demo-marketplace-offers','furgo-demo-hotel-settings','furgo-demo-daycare-settings')
  );

create policy "Managers can insert grooming settings"
  on public.service_settings for insert to authenticated
  with check ((select public.current_portal_level(auth.uid())) >= 2);
create policy "Managers can update grooming settings"
  on public.service_settings for update to authenticated
  using ((select public.current_portal_level(auth.uid())) >= 2)
  with check ((select public.current_portal_level(auth.uid())) >= 2);
