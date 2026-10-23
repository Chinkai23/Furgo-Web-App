-- Section: Grooming order lifecycle statuses
-- Function: Allow grooming orders to use the shared customer/admin order lifecycle.

alter table public.grooming_bookings
  drop constraint if exists grooming_bookings_status_check;

alter table public.grooming_bookings
  add constraint grooming_bookings_status_check
  check (status in (
    'New Order',
    'Pending Payment',
    'Received Order',
    'Checked-In',
    'Completed',
    'Cancelled',
    -- Keep legacy service-management values valid for existing bookings and screens.
    'Pending / Confirmed',
    'In Progress'
  ));

drop policy if exists "Customers can create their own grooming bookings"
  on public.grooming_bookings;

create policy "Customers can create their own grooming bookings"
  on public.grooming_bookings for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status in ('New Order', 'Pending Payment', 'Pending / Confirmed')
  );
