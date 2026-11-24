-- Store seller business/contact information when a Director assigns the
-- seller account. Product requests reuse this saved profile instead of asking
-- the seller to enter the same details on every submission.

drop function if exists public.admin_marketplace_seller_assign(text, text, text);

create or replace function public.admin_marketplace_seller_assign(
  p_email text,
  p_business_name text,
  p_contact_name text,
  p_contact_phone text,
  p_business_address text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid;
  seller_key uuid;
  email_value text := lower(trim(coalesce(p_email, '')));
  business_value text := trim(coalesce(p_business_name, ''));
  contact_name_value text := trim(coalesce(p_contact_name, ''));
  contact_phone_value text := trim(coalesce(p_contact_phone, ''));
  business_address_value text := trim(coalesce(p_business_address, ''));
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;
  if email_value = '' or business_value = '' or business_address_value = '' then
    raise exception 'Account email, business name, and business address are required.';
  end if;
  if char_length(business_value) > 160 or char_length(contact_name_value) > 120
    or char_length(contact_phone_value) > 40 or char_length(business_address_value) > 500 then
    raise exception 'Seller business or contact details exceed the allowed length.';
  end if;

  select id into target_user
  from public.profiles
  where lower(email) = email_value
  limit 1;
  if target_user is null then
    raise exception 'No Furgo account uses this email. Ask the seller to register first.';
  end if;

  select seller_id into seller_key
  from public.marketplace_seller_users
  where user_id = target_user;

  if seller_key is null then
    select id into seller_key
    from public.marketplace_seller_profiles
    where lower(contact_email) = email_value
    order by created_at
    limit 1;

    if seller_key is null then
      insert into public.marketplace_seller_profiles(
        business_name, contact_name, contact_email, contact_phone,
        business_address, created_by
      ) values (
        business_value, contact_name_value, email_value, contact_phone_value,
        business_address_value, auth.uid()
      ) returning id into seller_key;
    else
      update public.marketplace_seller_profiles set
        business_name = business_value,
        contact_name = contact_name_value,
        contact_email = email_value,
        contact_phone = contact_phone_value,
        business_address = business_address_value,
        updated_at = now()
      where id = seller_key;
    end if;

    insert into public.marketplace_seller_users(seller_id, user_id, assigned_by)
    values (seller_key, target_user, auth.uid());

    if not exists (
      select 1 from public.marketplace_seller_fee_rules where seller_id = seller_key
    ) then
      insert into public.marketplace_seller_fee_rules(seller_id, created_by)
      values (seller_key, auth.uid());
    end if;
  else
    update public.marketplace_seller_profiles set
      business_name = business_value,
      contact_name = contact_name_value,
      contact_email = email_value,
      contact_phone = contact_phone_value,
      business_address = business_address_value,
      updated_at = now()
    where id = seller_key;
  end if;

  return seller_key;
end;
$$;

revoke all on function public.admin_marketplace_seller_assign(text, text, text, text, text)
  from public, anon;
grant execute on function public.admin_marketplace_seller_assign(text, text, text, text, text)
  to authenticated;
