-- Section: Public Marketplace supplier identity
-- Function: Publish supplier company names and profile photos on customer product details.

update storage.buckets
set public = true
where id = 'supplier-profile-photos';

create or replace function public.get_marketplace_supplier_profiles()
returns table (supplier_name text, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (lower(access.supplier_name))
    access.supplier_name,
    profile.avatar_path
  from public.marketplace_supplier_access access
  left join public.profiles profile on profile.id = access.supplier_user_id
  order by lower(access.supplier_name), (profile.avatar_path is not null) desc, access.created_at asc;
$$;

revoke all on function public.get_marketplace_supplier_profiles() from public;
grant execute on function public.get_marketplace_supplier_profiles() to anon, authenticated;

create or replace function public.get_marketplace_supplier_accounts()
returns table (
  supplier_user_id uuid,
  supplier_name text,
  created_at timestamptz,
  display_name text,
  email text,
  phone_e164 text,
  supplier_contact_phone text,
  avatar_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Only Directors can view supplier account details.';
  end if;

  return query
  select access.supplier_user_id, access.supplier_name, access.created_at,
    profile.display_name, profile.email, profile.phone_e164,
    profile.supplier_contact_phone, profile.avatar_path
  from public.marketplace_supplier_access access
  left join public.profiles profile on profile.id = access.supplier_user_id
  order by access.supplier_name;
end;
$$;

revoke all on function public.get_marketplace_supplier_accounts() from public, anon;
grant execute on function public.get_marketplace_supplier_accounts() to authenticated;
