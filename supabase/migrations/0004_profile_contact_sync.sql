-- Section: Profile contact synchronization
-- Function: Copy the registration phone stored in Auth metadata into the profile table for email/password accounts.

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
    coalesce(new.phone, nullif(new.raw_user_meta_data ->> 'phone_e164', ''))
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        email = excluded.email,
        phone_e164 = coalesce(excluded.phone_e164, public.profiles.phone_e164),
        updated_at = now();

  insert into public.user_roles (user_id, role)
  values (new.id, 'customer')
  on conflict (user_id, role) do nothing;

  insert into public.account_controls (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function public.sync_auth_user_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email,
      phone_e164 = coalesce(new.phone, nullif(new.raw_user_meta_data ->> 'phone_e164', ''), phone_e164),
      updated_at = now()
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_contact_updated on auth.users;
create trigger on_auth_user_contact_updated
  after update of email, phone, raw_user_meta_data on auth.users
  for each row execute procedure public.sync_auth_user_contact();

-- Backfill existing email/password accounts from the phone value saved at registration.
update public.profiles as profile
set display_name = coalesce(nullif(profile.display_name, ''), nullif(auth_user.raw_user_meta_data ->> 'display_name', ''), ''),
    email = coalesce(auth_user.email, profile.email),
    phone_e164 = coalesce(auth_user.phone, nullif(auth_user.raw_user_meta_data ->> 'phone_e164', ''), profile.phone_e164),
    updated_at = now()
from auth.users as auth_user
where profile.id = auth_user.id;
