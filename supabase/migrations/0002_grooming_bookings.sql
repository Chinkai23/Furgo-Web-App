-- Section: Grooming schedule and appointment persistence
-- Function: Share Admin availability and customer appointments across devices.

create table public.service_settings (
  service_key text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.service_settings (service_key, settings)
values ('grooming', '{}'::jsonb)
on conflict (service_key) do nothing;

create table public.grooming_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reference text not null unique,
  outlet text not null,
  appointment_date date not null,
  appointment_time text not null,
  status text not null default 'Pending Payment'
    check (status in ('Pending Payment', 'Pending / Confirmed', 'In Progress', 'Completed', 'Cancelled')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index grooming_bookings_user_created_idx
  on public.grooming_bookings (user_id, created_at desc);

create index grooming_bookings_slot_idx
  on public.grooming_bookings (outlet, appointment_date, appointment_time);

-- A live appointment owns its slot; cancellation makes the slot available again.
create unique index grooming_bookings_one_active_per_slot_idx
  on public.grooming_bookings (outlet, appointment_date, appointment_time)
  where status <> 'Cancelled';

alter table public.service_settings enable row level security;
alter table public.grooming_bookings enable row level security;

create policy "Authenticated users can read service settings"
  on public.service_settings for select to authenticated
  using (true);

create policy "Admins can insert service settings"
  on public.service_settings for insert to authenticated
  with check (public.has_role((select auth.uid()), 'admin'));

create policy "Admins can update service settings"
  on public.service_settings for update to authenticated
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));

create policy "Customers and admins can read grooming bookings"
  on public.grooming_bookings for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

create policy "Customers can create their own grooming bookings"
  on public.grooming_bookings for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status in ('Pending Payment', 'Pending / Confirmed')
  );

create policy "Admins can update grooming bookings"
  on public.grooming_bookings for update to authenticated
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));

grant select on public.service_settings to authenticated;
grant insert, update on public.service_settings to authenticated;
grant select, insert, update on public.grooming_bookings to authenticated;
