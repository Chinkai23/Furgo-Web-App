-- Let authenticated staff roles validate and consume customer check-in tokens.
-- Token records remain in the operation scope; this does not grant access to customer profile data.

drop policy if exists "Limit staff app data to their level" on public.app_data;
create policy "Limit staff app data to their level"
  on public.app_data as restrictive for select to authenticated
  using (
    not public.has_role((select auth.uid()), 'staff')
    or (
      scope = 'operation'
      and storage_key in (
        'furgo-demo-marketplace-orders',
        'furgo-demo-hotel-bookings',
        'furgo-demo-daycare-bookings',
        'furgo-demo-daycare-orders',
        'furgo-demo-check-in-tokens'
      )
    )
    or (
      (select public.current_portal_level(auth.uid())) >= 2
      and scope = 'shared'
      and storage_key in (
        'furgo-demo-promotions',
        'furgo-demo-marketplace-products',
        'furgo-demo-marketplace-offers',
        'furgo-demo-hotel-settings',
        'furgo-demo-daycare-settings'
      )
    )
  );

drop policy if exists "Limit staff app data inserts to their level" on public.app_data;
create policy "Limit staff app data inserts to their level"
  on public.app_data as restrictive for insert to authenticated
  with check (
    not public.has_role((select auth.uid()), 'staff')
    or (
      scope = 'operation'
      and storage_key in (
        'furgo-demo-marketplace-orders',
        'furgo-demo-hotel-bookings',
        'furgo-demo-daycare-bookings',
        'furgo-demo-daycare-orders',
        'furgo-demo-check-in-tokens'
      )
    )
    or (
      (select public.current_portal_level(auth.uid())) >= 2
      and scope = 'shared'
      and storage_key in (
        'furgo-demo-promotions',
        'furgo-demo-marketplace-products',
        'furgo-demo-marketplace-offers',
        'furgo-demo-hotel-settings',
        'furgo-demo-daycare-settings'
      )
    )
  );

drop policy if exists "Limit staff app data updates to their level" on public.app_data;
create policy "Limit staff app data updates to their level"
  on public.app_data as restrictive for update to authenticated
  using (
    not public.has_role((select auth.uid()), 'staff')
    or (
      scope = 'operation'
      and storage_key in (
        'furgo-demo-marketplace-orders',
        'furgo-demo-hotel-bookings',
        'furgo-demo-daycare-bookings',
        'furgo-demo-daycare-orders',
        'furgo-demo-check-in-tokens'
      )
    )
    or (
      (select public.current_portal_level(auth.uid())) >= 2
      and scope = 'shared'
      and storage_key in (
        'furgo-demo-promotions',
        'furgo-demo-marketplace-products',
        'furgo-demo-marketplace-offers',
        'furgo-demo-hotel-settings',
        'furgo-demo-daycare-settings'
      )
    )
  )
  with check (
    not public.has_role((select auth.uid()), 'staff')
    or (
      scope = 'operation'
      and storage_key in (
        'furgo-demo-marketplace-orders',
        'furgo-demo-hotel-bookings',
        'furgo-demo-daycare-bookings',
        'furgo-demo-daycare-orders',
        'furgo-demo-check-in-tokens'
      )
    )
    or (
      (select public.current_portal_level(auth.uid())) >= 2
      and scope = 'shared'
      and storage_key in (
        'furgo-demo-promotions',
        'furgo-demo-marketplace-products',
        'furgo-demo-marketplace-offers',
        'furgo-demo-hotel-settings',
        'furgo-demo-daycare-settings'
      )
    )
  );

create policy "Staff read check-in token records"
  on public.app_data for select to authenticated
  using (
    public.has_role((select auth.uid()), 'staff')
    and scope = 'operation'
    and storage_key = 'furgo-demo-check-in-tokens'
  );

create policy "Staff create check-in token records"
  on public.app_data for insert to authenticated
  with check (
    public.has_role((select auth.uid()), 'staff')
    and scope = 'operation'
    and storage_key = 'furgo-demo-check-in-tokens'
  );

create policy "Staff update check-in token records"
  on public.app_data for update to authenticated
  using (
    public.has_role((select auth.uid()), 'staff')
    and scope = 'operation'
    and storage_key = 'furgo-demo-check-in-tokens'
  )
  with check (
    public.has_role((select auth.uid()), 'staff')
    and scope = 'operation'
    and storage_key = 'furgo-demo-check-in-tokens'
  );
