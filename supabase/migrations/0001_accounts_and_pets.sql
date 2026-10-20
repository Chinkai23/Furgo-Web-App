-- Section: Development database foundation
-- Function: Define customer, admin, and driver identities plus customer and pet data.

create type public.app_role as enum ('customer', 'admin', 'driver');
create type public.account_status as enum ('active', 'restricted', 'blacklisted');

-- Section: Customer profiles
-- Function: Store app-visible contact details while keeping phone/email changes tied to Auth verification.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  email text,
  phone_e164 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Section: Access roles
-- Function: Assign customer/admin/driver access. Only trusted server-side setup should grant admin or driver roles.
create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Section: Role lookup
-- Function: Check a user's role without exposing role rows to client-side edits.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;

revoke all on function public.has_role(uuid, public.app_role) from public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

-- Section: Account controls
-- Function: Let the account owner view status while reserving status changes for administrators.
create table public.account_controls (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status public.account_status not null default 'active',
  admin_note text not null default '',
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Section: Pet profiles
-- Function: Persist each pet's details, remarks, photo path, and vaccination document paths.
create table public.pet_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  breed text not null default '',
  sex text not null default '' check (sex in ('', 'Female', 'Male')),
  birth_date date,
  neutered boolean,
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg >= 0),
  colour text not null default '',
  remarks text[] not null default '{}',
  photo_path text,
  vaccination_cards jsonb not null default '[]'::jsonb,
  vaccination_valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pet_profiles_user_id_idx on public.pet_profiles (user_id);
create index user_roles_role_idx on public.user_roles (role, user_id);

-- Section: New account setup
-- Function: Create a basic profile and safe default customer role/status after Auth signup.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email, phone_e164)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    new.phone
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'customer');

  insert into public.account_controls (user_id)
  values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- Section: Verified contact synchronization
-- Function: Keep displayed email and phone in sync with Supabase Auth after its verification flow succeeds.
create or replace function public.sync_auth_user_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email,
      phone_e164 = new.phone,
      updated_at = now()
  where id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_contact_updated
  after update of email, phone on auth.users
  for each row execute procedure public.sync_auth_user_contact();

-- Section: Row-level security
-- Function: Limit customer data to its owner and allow authorized administrators to manage support workflows.
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.account_controls enable row level security;
alter table public.pet_profiles enable row level security;

create policy "Profiles are readable by owner or admin"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

create policy "Owners can update their display name"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "Users can read their own roles"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

create policy "Owners and admins can read account status"
  on public.account_controls for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

create policy "Admins can update account status"
  on public.account_controls for update to authenticated
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));

create policy "Pet profiles are readable by owner or admin"
  on public.pet_profiles for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

create policy "Owners can add pet profiles"
  on public.pet_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners and admins can edit pet profiles"
  on public.pet_profiles for update to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'))
  with check (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

create policy "Owners and admins can delete pet profiles"
  on public.pet_profiles for delete to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

grant select on public.profiles, public.user_roles, public.account_controls, public.pet_profiles to authenticated;
grant insert, update, delete on public.pet_profiles to authenticated;
grant update on public.account_controls to authenticated;

-- Section: Private pet documents
-- Function: Store pet photos and vaccination files privately under a folder named with the owner's Auth ID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pet-records',
  'pet-records',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create policy "Owners and admins can view pet records"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'pet-records'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.has_role((select auth.uid()), 'admin')
    )
  );

create policy "Owners can upload pet records"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pet-records'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Owners and admins can update pet records"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'pet-records'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.has_role((select auth.uid()), 'admin')
    )
  )
  with check (
    bucket_id = 'pet-records'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.has_role((select auth.uid()), 'admin')
    )
  );

create policy "Owners and admins can delete pet records"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pet-records'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.has_role((select auth.uid()), 'admin')
    )
  );
