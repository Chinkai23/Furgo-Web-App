-- Section: Shared service order lifecycle
-- Function: Allow staff to mark grooming appointments that elapsed without check-in as No-Show.

alter table public.grooming_bookings
  drop constraint if exists grooming_bookings_status_check;

alter table public.grooming_bookings
  add constraint grooming_bookings_status_check
  check (status in (
    'New Order',
    'Pending Payment',
    'Received Order',
    'Checked-In',
    'Pet Taxi Delivering...',
    'Service Complete · Awaiting Pickup',
    'Completed',
    'Cancelled',
    'No-Show',
    'Pending / Confirmed',
    'In Progress'
  ));
