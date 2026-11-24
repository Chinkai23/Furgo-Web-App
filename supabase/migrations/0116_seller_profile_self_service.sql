-- Allow an assigned seller account to update its own account display name and
-- business contact details from the Seller Portal profile page.
create or replace function public.seller_portal_update_profile(
  p_display_name text,
  p_business_name text,
  p_contact_name text,
  p_contact_phone text,
  p_business_address text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  seller_scope uuid := public.seller_portal_require_scope();
  display_name_value text := btrim(coalesce(p_display_name, ''));
  business_name_value text := btrim(coalesce(p_business_name, ''));
  contact_name_value text := btrim(coalesce(p_contact_name, ''));
  contact_phone_value text := btrim(coalesce(p_contact_phone, ''));
  business_address_value text := btrim(coalesce(p_business_address, ''));
  result jsonb;
begin
  if char_length(display_name_value) not between 1 and 80
    or char_length(business_name_value) not between 1 and 160
    or char_length(contact_name_value) > 120
    or char_length(contact_phone_value) > 40
    or char_length(business_address_value) not between 1 and 500 then
    raise exception 'Enter a username, business name, and business address within the allowed lengths.';
  end if;

  update public.profiles
  set display_name = display_name_value
  where id = auth.uid();

  update public.marketplace_seller_profiles
  set business_name = business_name_value,
      contact_name = contact_name_value,
      contact_phone = contact_phone_value,
      business_address = business_address_value,
      updated_at = now()
  where id = seller_scope;

  select jsonb_build_object(
    'business_name', profile.business_name,
    'contact_name', profile.contact_name,
    'contact_email', profile.contact_email,
    'contact_phone', profile.contact_phone,
    'business_address', profile.business_address
  )
  into result
  from public.marketplace_seller_profiles profile
  where profile.id = seller_scope;

  return coalesce(result, '{}'::jsonb);
end;
$$;

revoke all on function public.seller_portal_update_profile(text, text, text, text, text)
  from public, anon;
grant execute on function public.seller_portal_update_profile(text, text, text, text, text)
  to authenticated;
