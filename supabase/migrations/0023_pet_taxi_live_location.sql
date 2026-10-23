-- One latest GPS point per Pet Taxi booking, visible only to that customer,
-- the assigned driver account that posted it, and Admin Portal staff.

create table public.driver_live_locations (
  order_key text not null check (order_key in (
    'furgo-demo-grooming-bookings',
    'furgo-demo-hotel-bookings',
    'furgo-demo-daycare-bookings'
  )),
  order_id text not null,
  customer_id uuid not null references auth.users (id) on delete cascade,
  driver_id uuid not null references auth.users (id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy double precision check (accuracy is null or accuracy >= 0),
  updated_at timestamptz not null default now(),
  primary key (order_key, order_id)
);
create index driver_live_locations_customer_idx on public.driver_live_locations (customer_id, updated_at desc);
alter table public.driver_live_locations enable row level security;

create or replace function public.touch_driver_live_location()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.touch_driver_live_location() from public, anon, authenticated;
create trigger driver_live_locations_set_updated_at
  before insert or update on public.driver_live_locations
  for each row execute function public.touch_driver_live_location();

create or replace function public.can_publish_pet_taxi_location(p_order_key text, p_order_id text, p_customer_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare owner_id uuid; booking_status text; taxi_status text; has_taxi boolean;
begin
  if not public.has_role(auth.uid(), 'driver') then return false; end if;
  if p_order_key = 'furgo-demo-grooming-bookings' then
    select booking.user_id, booking.status, booking.details -> 'taxiProgress' ->> 'status',
      (booking.details ->> 'includeTaxi' = 'true'
        or nullif(booking.details #>> '{taxi,pickup}', '') is not null
        or nullif(booking.details #>> '{taxi,dropoff}', '') is not null)
      into owner_id, booking_status, taxi_status, has_taxi
    from public.grooming_bookings booking
    where booking.id::text = p_order_id
      and (booking.details ->> 'includeTaxi' = 'true'
        or nullif(booking.details #>> '{taxi,pickup}', '') is not null
        or nullif(booking.details #>> '{taxi,dropoff}', '') is not null);
  elsif p_order_key = 'furgo-demo-hotel-bookings' then
    select booking.user_id, booking.status, booking.details -> 'taxiProgress' ->> 'status',
      (nullif(booking.details #>> '{taxi,pickup}', '') is not null
        or nullif(booking.details #>> '{taxi,dropoff}', '') is not null)
      into owner_id, booking_status, taxi_status, has_taxi
    from public.pet_hotel_bookings booking
    where booking.id = p_order_id
      and (nullif(booking.details #>> '{taxi,pickup}', '') is not null
        or nullif(booking.details #>> '{taxi,dropoff}', '') is not null);
  elsif p_order_key = 'furgo-demo-daycare-bookings' then
    select booking.user_id, booking.status, booking.details -> 'taxiProgress' ->> 'status', booking.details ->> 'includeTaxi' = 'true'
      into owner_id, booking_status, taxi_status, has_taxi
    from public.pet_daycare_bookings booking
    where booking.id = p_order_id and booking.details ->> 'includeTaxi' = 'true';
  else
    return false;
  end if;
  return coalesce(has_taxi, false)
    and owner_id = p_customer_id
    and booking_status = 'Pet Taxi Delivering...'
    and taxi_status in ('Picked Up', 'Returning to Customer');
end;
$$;
revoke all on function public.can_publish_pet_taxi_location(text, text, uuid) from public, anon;
grant execute on function public.can_publish_pet_taxi_location(text, text, uuid) to authenticated;

create policy "Customers admins and driver can read Pet Taxi live locations"
  on public.driver_live_locations for select to authenticated
  using (
    customer_id = (select auth.uid())
    or driver_id = (select auth.uid())
    or public.current_portal_level((select auth.uid())) >= 1
  );

create policy "Drivers can publish an active taxi location for its customer"
  on public.driver_live_locations for insert to authenticated
  with check (
    driver_id = (select auth.uid())
    and public.has_role((select auth.uid()), 'driver')
    and public.can_publish_pet_taxi_location(order_key, order_id, customer_id)
  );

create policy "Drivers can update their active taxi location"
  on public.driver_live_locations for update to authenticated
  using (
    driver_id = (select auth.uid())
    and public.has_role((select auth.uid()), 'driver')
    and public.can_publish_pet_taxi_location(order_key, order_id, customer_id)
  )
  with check (
    driver_id = (select auth.uid())
    and public.has_role((select auth.uid()), 'driver')
    and public.can_publish_pet_taxi_location(order_key, order_id, customer_id)
  );

grant select, insert, update on public.driver_live_locations to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'driver_live_locations'
     ) then
    alter publication supabase_realtime add table public.driver_live_locations;
  end if;
end;
$$;
