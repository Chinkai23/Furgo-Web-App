-- Section: Pet Taxi pickup, service hand-off, and return delivery
-- Function: Share one customer QR across the driver's pickup and final home-delivery scans.

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
    'Pending / Confirmed',
    'In Progress'
  ));

drop policy if exists "Drivers can read grooming Pet Taxi bookings" on public.grooming_bookings;
create policy "Drivers can read grooming Pet Taxi bookings"
  on public.grooming_bookings for select to authenticated
  using (
    public.has_role((select auth.uid()), 'driver')
    and (
      details ->> 'includeTaxi' = 'true'
      or nullif(details #>> '{taxi,pickup}', '') is not null
      or nullif(details #>> '{taxi,dropoff}', '') is not null
    )
  );

drop policy if exists "Drivers can read Pet Hotel taxi bookings" on public.pet_hotel_bookings;
create policy "Drivers can read Pet Hotel taxi bookings"
  on public.pet_hotel_bookings for select to authenticated
  using (
    public.has_role((select auth.uid()), 'driver')
    and (
      nullif(details #>> '{taxi,pickup}', '') is not null
      or nullif(details #>> '{taxi,dropoff}', '') is not null
    )
  );

drop policy if exists "Drivers can read Pet Daycare taxi bookings" on public.pet_daycare_bookings;
create policy "Drivers can read Pet Daycare taxi bookings"
  on public.pet_daycare_bookings for select to authenticated
  using (
    public.has_role((select auth.uid()), 'driver')
    and details ->> 'includeTaxi' = 'true'
  );

create or replace function public.apply_pet_taxi_qr_scan(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  normalized_token text := upper(regexp_replace(coalesce(p_token, ''), '[[:space:]-]', '', 'g'));
  token_owner uuid;
  token_record jsonb;
  target_key text;
  target_id text;
  target_user_id uuid;
  old_status text;
  new_status text;
  old_details jsonb;
  new_details jsonb;
  old_progress jsonb;
  new_progress jsonb;
  progress_status text;
  action_time timestamptz := now();
  actor_email text := coalesce(auth.jwt() ->> 'email', 'Pet Taxi Driver');
begin
  if caller is null or not public.has_role(caller, 'driver') then
    return jsonb_build_object('ok', false, 'message', 'Sign in with an authorized Driver account to scan this Pet Taxi QR.');
  end if;

  if normalized_token !~ '^[2-9A-HJ-NP-Z]{10}$' then
    return jsonb_build_object('ok', false, 'message', 'This is not a valid Pet Taxi QR code.');
  end if;

  select data.owner_id, data.payload -> normalized_token
    into token_owner, token_record
  from public.app_data as data
  where data.scope = 'operation'
    and data.storage_key = 'furgo-demo-check-in-tokens'
    and data.payload ? normalized_token
    and data.payload -> normalized_token ->> 'stage' = 'taxi-trip'
  limit 1;

  if token_record is null then
    return jsonb_build_object('ok', false, 'message', 'This code is not an active Pet Taxi QR. Refresh the customer QR and try again.');
  end if;
  if coalesce(token_record ->> 'revokedAt', '') <> '' then
    return jsonb_build_object('ok', false, 'message', 'This Pet Taxi QR has been completed and retired.');
  end if;

  target_key := token_record ->> 'orderKey';
  target_id := token_record ->> 'orderId';
  if target_id is null or target_key is null or target_key not in ('furgo-demo-grooming-bookings', 'furgo-demo-hotel-bookings', 'furgo-demo-daycare-bookings') then
    return jsonb_build_object('ok', false, 'message', 'This QR is not linked to an eligible Pet Taxi booking.');
  end if;

  if target_key = 'furgo-demo-grooming-bookings' then
    select booking.status, booking.details, booking.user_id into old_status, old_details, target_user_id
    from public.grooming_bookings as booking
    where booking.id = target_id::uuid
      and (booking.details ->> 'includeTaxi' = 'true'
        or nullif(booking.details #>> '{taxi,pickup}', '') is not null
        or nullif(booking.details #>> '{taxi,dropoff}', '') is not null)
    for update;
  elsif target_key = 'furgo-demo-hotel-bookings' then
    select booking.status, booking.details, booking.user_id into old_status, old_details, target_user_id
    from public.pet_hotel_bookings as booking
    where booking.id = target_id
      and (nullif(booking.details #>> '{taxi,pickup}', '') is not null
        or nullif(booking.details #>> '{taxi,dropoff}', '') is not null)
    for update;
  else
    select booking.status, booking.details, booking.user_id into old_status, old_details, target_user_id
    from public.pet_daycare_bookings as booking
    where booking.id = target_id
      and booking.details ->> 'includeTaxi' = 'true'
    for update;
  end if;

  if old_details is null then
    return jsonb_build_object('ok', false, 'message', 'The Pet Taxi booking could not be found or no longer includes taxi service.');
  end if;
  if lower(coalesce(old_status, '')) = 'cancelled' then
    return jsonb_build_object('ok', false, 'message', 'This booking has been cancelled.');
  end if;

  old_progress := coalesce(old_details -> 'taxiProgress', '{}'::jsonb);
  progress_status := coalesce(old_progress ->> 'status', 'Scheduled');
  if progress_status in ('Scheduled', 'Assigned') then
    if old_status not in ('New Order', 'Received Order', 'Pending / Confirmed') then
      return jsonb_build_object('ok', false, 'message', 'This booking is not ready for Pet Taxi pickup. Confirm its payment and order status first.');
    end if;
    new_status := 'Pet Taxi Delivering...';
    new_progress := old_progress || jsonb_build_object('status', 'Picked Up', 'driverEmail', actor_email, 'pickedUpAt', action_time);
  elsif progress_status = 'Returning to Customer' and old_status = 'Pet Taxi Delivering...' then
    new_status := 'Completed';
    new_progress := old_progress || jsonb_build_object('status', 'Completed', 'driverEmail', actor_email, 'deliveredAt', action_time);
  else
    return jsonb_build_object('ok', false, 'message', 'This QR cannot be scanned at the current Pet Taxi stage. Follow the status shown on the order.');
  end if;

  new_details := old_details || jsonb_build_object(
    'status', new_status,
    'adminStatus', new_status,
    'taxiProgress', new_progress,
    'statusHistory', coalesce(old_details -> 'statusHistory', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'status', new_status,
      'previousStatus', old_status,
      'changedAt', action_time,
      'changedBy', actor_email
    ))
  );

  if target_key = 'furgo-demo-grooming-bookings' then
    update public.grooming_bookings set status = new_status, details = new_details, updated_at = action_time where id = target_id::uuid;
  elsif target_key = 'furgo-demo-hotel-bookings' then
    update public.pet_hotel_bookings set status = new_status, details = new_details, updated_at = action_time where id = target_id;
  else
    update public.pet_daycare_bookings set status = new_status, details = new_details, updated_at = action_time where id = target_id;
  end if;

  if new_status = 'Completed' then
    update public.app_data
    set payload = jsonb_set(payload, array[normalized_token], token_record || jsonb_build_object('revokedAt', action_time, 'revokedReason', 'taxi_delivery_completed'), true),
        updated_at = action_time
    where scope = 'operation'
      and storage_key = 'furgo-demo-check-in-tokens'
      and owner_id = token_owner;
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', case when new_status = 'Completed' then 'Pet delivered home. Order marked Completed.' else 'Pickup confirmed. Status is Pet Taxi Delivering... Admin check-in is next.' end,
    'orderKey', target_key,
    'orderId', target_id,
    'userId', target_user_id,
    'status', new_status,
    'details', new_details,
    'taxiProgress', new_progress
  );
end;
$$;

revoke all on function public.apply_pet_taxi_qr_scan(text) from public;
grant execute on function public.apply_pet_taxi_qr_scan(text) to authenticated;
