-- Sync additional account-owned customer data through app_data.
-- Keep marketplace supplier contact details separate from the shared app_data
-- catalog and visible only to authorized Admin Portal users.
create table if not exists public.marketplace_supplier_contacts (
  id boolean primary key default true check (id),
  contacts jsonb not null default '[]'::jsonb check (jsonb_typeof(contacts) = 'array'),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.marketplace_supplier_contacts enable row level security;

drop policy if exists "Admin portal users read marketplace supplier contacts" on public.marketplace_supplier_contacts;
create policy "Admin portal users read marketplace supplier contacts"
  on public.marketplace_supplier_contacts for select to authenticated
  using (public.current_portal_level((select auth.uid())) >= 1);

drop policy if exists "Managers and Directors manage marketplace supplier contacts" on public.marketplace_supplier_contacts;
create policy "Managers and Directors manage marketplace supplier contacts"
  on public.marketplace_supplier_contacts for all to authenticated
  using (public.current_portal_level((select auth.uid())) >= 2)
  with check (public.current_portal_level((select auth.uid())) >= 2);

grant select, insert, update, delete on public.marketplace_supplier_contacts to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketplace_supplier_contacts'
     ) then
    alter publication supabase_realtime add table public.marketplace_supplier_contacts;
  end if;
end;
$$;
