-- Section: Dedicated Marketplace, Pet Hotel, and Pet Daycare records
-- Function: Move customer orders and bookings out of the prototype JSON store into queryable tables.

create table public.marketplace_orders (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  reference text not null,
  status text not null default 'New',
  payment_status text not null default 'Pending',
  total numeric(12, 2) not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketplace_orders_user_created_idx
  on public.marketplace_orders (user_id, created_at desc);
create index marketplace_orders_status_created_idx
  on public.marketplace_orders (status, created_at desc);

create table public.marketplace_order_items (
  order_id text not null references public.marketplace_orders (id) on delete cascade,
  line_number integer not null,
  item jsonb not null default '{}'::jsonb,
  primary key (order_id, line_number)
);

create table public.pet_hotel_bookings (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  reference text not null,
  status text not null default 'Pending / Confirmed',
  outlet text not null default '',
  room_id text not null default '',
  check_in date,
  check_out date,
  assigned_unit text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pet_hotel_bookings_user_created_idx
  on public.pet_hotel_bookings (user_id, created_at desc);
create index pet_hotel_bookings_room_dates_idx
  on public.pet_hotel_bookings (outlet, room_id, check_in, check_out);

create table public.pet_daycare_bookings (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  reference text not null,
  status text not null default 'Pending / Confirmed',
  outlet text not null default '',
  visit_date date,
  dropoff_time text not null default '',
  pickup_time text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pet_daycare_bookings_user_created_idx
  on public.pet_daycare_bookings (user_id, created_at desc);
create index pet_daycare_bookings_date_outlet_idx
  on public.pet_daycare_bookings (outlet, visit_date, dropoff_time);

alter table public.marketplace_orders enable row level security;
alter table public.marketplace_order_items enable row level security;
alter table public.pet_hotel_bookings enable row level security;
alter table public.pet_daycare_bookings enable row level security;

create policy "Customers and admins read marketplace orders"
  on public.marketplace_orders for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));
create policy "Customers create their own marketplace orders and admins manage orders"
  on public.marketplace_orders for insert to authenticated
  with check (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));
create policy "Customers and admins update marketplace orders"
  on public.marketplace_orders for update to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'))
  with check (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));
create policy "Customers and admins delete marketplace orders"
  on public.marketplace_orders for delete to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

create policy "Customers and admins read marketplace order items"
  on public.marketplace_order_items for select to authenticated
  using (exists (
    select 1 from public.marketplace_orders o
    where o.id = order_id
      and (o.user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'))
  ));
create policy "Customers and admins manage marketplace order items"
  on public.marketplace_order_items for all to authenticated
  using (exists (
    select 1 from public.marketplace_orders o
    where o.id = order_id
      and (o.user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'))
  ))
  with check (exists (
    select 1 from public.marketplace_orders o
    where o.id = order_id
      and (o.user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'))
  ));

create policy "Customers and admins read Pet Hotel bookings"
  on public.pet_hotel_bookings for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));
create policy "Customers and admins create Pet Hotel bookings"
  on public.pet_hotel_bookings for insert to authenticated
  with check (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));
create policy "Customers and admins update Pet Hotel bookings"
  on public.pet_hotel_bookings for update to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'))
  with check (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));
create policy "Customers and admins delete Pet Hotel bookings"
  on public.pet_hotel_bookings for delete to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

create policy "Customers and admins read Pet Daycare bookings"
  on public.pet_daycare_bookings for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));
create policy "Customers and admins create Pet Daycare bookings"
  on public.pet_daycare_bookings for insert to authenticated
  with check (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));
create policy "Customers and admins update Pet Daycare bookings"
  on public.pet_daycare_bookings for update to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'))
  with check (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));
create policy "Customers and admins delete Pet Daycare bookings"
  on public.pet_daycare_bookings for delete to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

grant select, insert, update, delete on public.marketplace_orders to authenticated;
grant select, insert, update, delete on public.marketplace_order_items to authenticated;
grant select, insert, update, delete on public.pet_hotel_bookings to authenticated;
grant select, insert, update, delete on public.pet_daycare_bookings to authenticated;

-- Backfill previously synced prototype records. Keep app_data rows for rollback/reference.
insert into public.marketplace_orders (id, user_id, reference, status, payment_status, total, details, created_at)
select
  coalesce(nullif(entry.item->>'id', ''), 'market-' || gen_random_uuid()::text),
  source.owner_id,
  coalesce(nullif(entry.item->>'reference', ''), entry.item->>'id', 'Marketplace order'),
  coalesce(nullif(entry.item->>'status', ''), 'New'),
  coalesce(nullif(entry.item->>'paymentStatus', ''), 'Pending'),
  coalesce(nullif(entry.item->>'total', '')::numeric, 0),
  entry.item - 'items',
  coalesce(nullif(entry.item->>'createdAt', '')::timestamptz, source.updated_at)
from public.app_data source
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(source.payload) = 'array' then source.payload else '[]'::jsonb end
) as entry(item)
where source.scope = 'operation'
  and source.storage_key = 'furgo-demo-marketplace-orders'
  and source.owner_id is not null
on conflict (id) do nothing;

insert into public.marketplace_order_items (order_id, line_number, item)
select orders.id, item.ordinality::integer, item.value
from public.app_data source
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(source.payload) = 'array' then source.payload else '[]'::jsonb end
) as entry(order_record)
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(entry.order_record->'items') = 'array' then entry.order_record->'items' else '[]'::jsonb end
) with ordinality as item(value, ordinality)
join public.marketplace_orders orders
  on orders.id = entry.order_record->>'id'
where source.scope = 'operation'
  and source.storage_key = 'furgo-demo-marketplace-orders'
  and source.owner_id is not null
on conflict (order_id, line_number) do nothing;

insert into public.pet_hotel_bookings (id, user_id, reference, status, outlet, room_id, check_in, check_out, assigned_unit, details, created_at)
select
  coalesce(nullif(entry.item->>'id', ''), 'hotel-' || gen_random_uuid()::text),
  source.owner_id,
  coalesce(nullif(entry.item->>'reference', ''), entry.item->>'id', 'Pet Hotel booking'),
  coalesce(nullif(entry.item->>'status', ''), 'Pending / Confirmed'),
  coalesce(entry.item->>'outlet', ''),
  coalesce(entry.item->>'roomId', ''),
  nullif(entry.item->>'checkIn', '')::date,
  nullif(entry.item->>'checkOut', '')::date,
  coalesce(entry.item->>'assignedUnit', ''),
  entry.item,
  coalesce(nullif(entry.item->>'createdAt', '')::timestamptz, source.updated_at)
from public.app_data source
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(source.payload) = 'array' then source.payload else '[]'::jsonb end
) as entry(item)
where source.scope = 'operation'
  and source.storage_key = 'furgo-demo-hotel-bookings'
  and source.owner_id is not null
on conflict (id) do nothing;

insert into public.pet_daycare_bookings (id, user_id, reference, status, outlet, visit_date, dropoff_time, pickup_time, details, created_at)
select
  coalesce(nullif(entry.item->>'id', ''), 'daycare-' || gen_random_uuid()::text),
  source.owner_id,
  coalesce(nullif(entry.item->>'reference', ''), entry.item->>'id', 'Pet Daycare booking'),
  coalesce(nullif(entry.item->>'status', ''), 'Pending / Confirmed'),
  coalesce(entry.item->>'outlet', ''),
  nullif(entry.item->>'date', '')::date,
  coalesce(entry.item->>'dropoffTime', ''),
  coalesce(entry.item->>'pickupTime', ''),
  entry.item,
  coalesce(nullif(entry.item->>'createdAt', '')::timestamptz, source.updated_at)
from public.app_data source
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(source.payload) = 'array' then source.payload else '[]'::jsonb end
) as entry(item)
where source.scope = 'operation'
  and source.storage_key in ('furgo-demo-daycare-bookings', 'furgo-demo-pet-daycare-bookings', 'furgo-demo-daycare-orders')
  and source.owner_id is not null
on conflict (id) do nothing;

do $$
declare
  target_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach target_table in array array['marketplace_orders', 'marketplace_order_items', 'pet_hotel_bookings', 'pet_daycare_bookings'] loop
      if not exists (
        select 1 from pg_publication_tables published
        where published.pubname = 'supabase_realtime' and published.schemaname = 'public' and published.tablename = target_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', target_table);
      end if;
    end loop;
  end if;
end;
$$;
