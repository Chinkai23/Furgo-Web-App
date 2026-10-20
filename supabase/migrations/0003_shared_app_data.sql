-- Section: Shared prototype application data
-- Function: Sync customer-owned records and Admin-managed catalogs/settings across signed-in devices.

create table public.app_data (
  record_id text primary key,
  scope text not null check (scope in ('shared', 'customer', 'operation')),
  storage_key text not null,
  owner_id uuid references auth.users (id) on delete cascade,
  payload jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  check ((scope = 'shared' and owner_id is null) or (scope <> 'shared' and owner_id is not null))
);

create index app_data_owner_scope_idx on public.app_data (owner_id, scope, storage_key);
create index app_data_key_scope_idx on public.app_data (storage_key, scope);

alter table public.app_data enable row level security;

create policy "Signed-in users read shared app data"
  on public.app_data for select to authenticated
  using (scope = 'shared');

create policy "Users read their own app data and admins read all"
  on public.app_data for select to authenticated
  using (owner_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

create policy "Users create their own app data and admins create shared data"
  on public.app_data for insert to authenticated
  with check (
    (scope in ('customer', 'operation') and owner_id = (select auth.uid()))
    or (scope = 'shared' and public.has_role((select auth.uid()), 'admin'))
    or (public.has_role((select auth.uid()), 'admin'))
  );

create policy "Users update their own app data and admins manage all"
  on public.app_data for update to authenticated
  using (owner_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'))
  with check (owner_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

create policy "Users delete their own app data and admins manage all"
  on public.app_data for delete to authenticated
  using (owner_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

grant select, insert, update, delete on public.app_data to authenticated;

-- Section: Live portal updates
-- Function: Publish this table so Admin boards and customer/driver views can receive changes without a refresh.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_data'
     ) then
    alter publication supabase_realtime add table public.app_data;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'grooming_bookings'
     ) then
    alter publication supabase_realtime add table public.grooming_bookings;
  end if;
end;
$$;
