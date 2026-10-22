-- Staff can read and update order records across customers, but cannot access customer administration data.

create policy "Staff read order records"
  on public.app_data for select to authenticated
  using (
    public.has_role((select auth.uid()), 'staff')
    and scope = 'operation'
    and storage_key in (
      'furgo-demo-marketplace-orders',
      'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings',
      'furgo-demo-daycare-orders'
    )
  );

create policy "Staff create legacy order records"
  on public.app_data for insert to authenticated
  with check (
    public.has_role((select auth.uid()), 'staff')
    and scope = 'operation'
    and storage_key in (
      'furgo-demo-marketplace-orders',
      'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings',
      'furgo-demo-daycare-orders'
    )
  );

create policy "Staff update legacy order records"
  on public.app_data for update to authenticated
  using (
    public.has_role((select auth.uid()), 'staff')
    and scope = 'operation'
    and storage_key in (
      'furgo-demo-marketplace-orders',
      'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings',
      'furgo-demo-daycare-orders'
    )
  )
  with check (
    public.has_role((select auth.uid()), 'staff')
    and scope = 'operation'
    and storage_key in (
      'furgo-demo-marketplace-orders',
      'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings',
      'furgo-demo-daycare-orders'
    )
  );

-- Restrictive policies narrow the older owner-based policies as well, so staff accounts
-- cannot use a customer-owned row or the shared catalog as a side door to other data.
create policy "Limit staff app data to order rows"
  on public.app_data as restrictive for select to authenticated
  using (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in (
      'furgo-demo-marketplace-orders',
      'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings',
      'furgo-demo-daycare-orders'
    ))
  );
create policy "Limit staff app data inserts to order rows"
  on public.app_data as restrictive for insert to authenticated
  with check (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in (
      'furgo-demo-marketplace-orders',
      'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings',
      'furgo-demo-daycare-orders'
    ))
  );
create policy "Limit staff app data updates to order rows"
  on public.app_data as restrictive for update to authenticated
  using (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in (
      'furgo-demo-marketplace-orders',
      'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings',
      'furgo-demo-daycare-orders'
    ))
  )
  with check (
    not public.has_role((select auth.uid()), 'staff')
    or (scope = 'operation' and storage_key in (
      'furgo-demo-marketplace-orders',
      'furgo-demo-hotel-bookings',
      'furgo-demo-daycare-bookings',
      'furgo-demo-daycare-orders'
    ))
  );
create policy "Staff cannot delete app data"
  on public.app_data as restrictive for delete to authenticated
  using (not public.has_role((select auth.uid()), 'staff'));

create policy "Staff read marketplace orders"
  on public.marketplace_orders for select to authenticated
  using (public.has_role((select auth.uid()), 'staff'));
create policy "Staff update marketplace orders"
  on public.marketplace_orders for update to authenticated
  using (public.has_role((select auth.uid()), 'staff'))
  with check (public.has_role((select auth.uid()), 'staff'));
create policy "Staff cannot create marketplace orders"
  on public.marketplace_orders as restrictive for insert to authenticated
  with check (not public.has_role((select auth.uid()), 'staff'));
create policy "Staff cannot delete marketplace orders"
  on public.marketplace_orders as restrictive for delete to authenticated
  using (not public.has_role((select auth.uid()), 'staff'));
create policy "Staff read marketplace order items"
  on public.marketplace_order_items for select to authenticated
  using (
    public.has_role((select auth.uid()), 'staff')
    and exists (select 1 from public.marketplace_orders o where o.id = order_id)
  );
create policy "Staff cannot insert marketplace order items"
  on public.marketplace_order_items as restrictive for insert to authenticated
  with check (not public.has_role((select auth.uid()), 'staff'));
create policy "Staff cannot update marketplace order items"
  on public.marketplace_order_items as restrictive for update to authenticated
  using (not public.has_role((select auth.uid()), 'staff'))
  with check (not public.has_role((select auth.uid()), 'staff'));
create policy "Staff cannot delete marketplace order items"
  on public.marketplace_order_items as restrictive for delete to authenticated
  using (not public.has_role((select auth.uid()), 'staff'));

create policy "Staff read Pet Hotel bookings"
  on public.pet_hotel_bookings for select to authenticated
  using (public.has_role((select auth.uid()), 'staff'));
create policy "Staff update Pet Hotel bookings"
  on public.pet_hotel_bookings for update to authenticated
  using (public.has_role((select auth.uid()), 'staff'))
  with check (public.has_role((select auth.uid()), 'staff'));
create policy "Staff cannot create Pet Hotel bookings"
  on public.pet_hotel_bookings as restrictive for insert to authenticated
  with check (not public.has_role((select auth.uid()), 'staff'));
create policy "Staff cannot delete Pet Hotel bookings"
  on public.pet_hotel_bookings as restrictive for delete to authenticated
  using (not public.has_role((select auth.uid()), 'staff'));

create policy "Staff read Pet Daycare bookings"
  on public.pet_daycare_bookings for select to authenticated
  using (public.has_role((select auth.uid()), 'staff'));
create policy "Staff update Pet Daycare bookings"
  on public.pet_daycare_bookings for update to authenticated
  using (public.has_role((select auth.uid()), 'staff'))
  with check (public.has_role((select auth.uid()), 'staff'));
create policy "Staff cannot create Pet Daycare bookings"
  on public.pet_daycare_bookings as restrictive for insert to authenticated
  with check (not public.has_role((select auth.uid()), 'staff'));
create policy "Staff cannot delete Pet Daycare bookings"
  on public.pet_daycare_bookings as restrictive for delete to authenticated
  using (not public.has_role((select auth.uid()), 'staff'));

create policy "Staff read grooming bookings"
  on public.grooming_bookings for select to authenticated
  using (public.has_role((select auth.uid()), 'staff'));
create policy "Staff update grooming bookings"
  on public.grooming_bookings for update to authenticated
  using (public.has_role((select auth.uid()), 'staff'))
  with check (public.has_role((select auth.uid()), 'staff'));
create policy "Staff cannot create grooming bookings"
  on public.grooming_bookings as restrictive for insert to authenticated
  with check (not public.has_role((select auth.uid()), 'staff'));
create policy "Staff cannot delete grooming bookings"
  on public.grooming_bookings as restrictive for delete to authenticated
  using (not public.has_role((select auth.uid()), 'staff'));
