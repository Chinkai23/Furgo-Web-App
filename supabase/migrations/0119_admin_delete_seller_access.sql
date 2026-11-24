-- Soft-delete a seller portal profile from Manage Sellers while preserving
-- product mappings, submissions, sales, and payout history for the ledger.
alter table public.marketplace_seller_profiles
  add column if not exists deleted_at timestamptz;

create or replace function public.seller_portal_require_scope()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  seller_scope uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to access Seller Portal.';
  end if;

  select member.seller_id into seller_scope
  from public.marketplace_seller_users member
  join public.marketplace_seller_profiles seller on seller.id = member.seller_id
  where member.user_id = auth.uid()
    and seller.deleted_at is null;

  if seller_scope is null then
    raise exception 'Seller Portal access is not assigned to this account.';
  end if;
  return seller_scope;
end;
$$;
revoke all on function public.seller_portal_require_scope() from public, anon, authenticated;

create or replace function public.seller_portal_has_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.marketplace_seller_users member
    join public.marketplace_seller_profiles seller on seller.id = member.seller_id
    where member.user_id = auth.uid()
      and seller.deleted_at is null
  );
$$;
revoke all on function public.seller_portal_has_access() from public, anon;
grant execute on function public.seller_portal_has_access() to authenticated;

create or replace function public.admin_marketplace_sellers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  out_data jsonb;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;

  select jsonb_build_object(
    'sellers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', seller.id,
        'business_name', seller.business_name,
        'contact_name', seller.contact_name,
        'contact_email', seller.contact_email,
        'contact_phone', seller.contact_phone,
        'assigned_users', coalesce((
          select jsonb_agg(jsonb_build_object(
            'user_id', member.user_id,
            'email', profile.email,
            'display_name', profile.display_name
          ))
          from public.marketplace_seller_users member
          left join public.profiles profile on profile.id = member.user_id
          where member.seller_id = seller.id
        ), '[]'::jsonb),
        'products', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', seller_product.id,
            'warehouse_product_id', warehouse_product.id,
            'name', warehouse_product.name,
            'sku', seller_product.seller_sku,
            'listing_status', seller_product.listing_status,
            'low_stock_threshold', seller_product.low_stock_threshold
          ))
          from public.marketplace_seller_products seller_product
          join public.warehouse_products warehouse_product
            on warehouse_product.id = seller_product.warehouse_product_id
          where seller_product.seller_id = seller.id
        ), '[]'::jsonb),
        'restock_requests', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', request.id,
            'product_name', warehouse_product.name,
            'seller_sku', seller_product.seller_sku,
            'requested_quantity', request.requested_quantity,
            'note', request.note,
            'status', request.status,
            'admin_note', request.admin_note,
            'requested_at', request.requested_at
          ) order by request.requested_at desc)
          from public.marketplace_seller_restocks request
          join public.marketplace_seller_products seller_product
            on seller_product.id = request.seller_product_id
          join public.warehouse_products warehouse_product
            on warehouse_product.id = seller_product.warehouse_product_id
          where request.seller_id = seller.id
        ), '[]'::jsonb),
        'payouts', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', payout.id,
            'reference', payout.payout_reference,
            'period_start', payout.period_start,
            'period_end', payout.period_end,
            'amount', payout.amount,
            'status', payout.status,
            'paid_date', payout.paid_date
          ) order by payout.created_at desc)
          from public.marketplace_seller_payouts payout
          where payout.seller_id = seller.id
        ), '[]'::jsonb),
        'fees', coalesce((
          select jsonb_build_object(
            'commission_percent', fee.commission_percent,
            'service_fee_per_unit', fee.service_fee_per_unit
          )
          from public.marketplace_seller_fee_rules fee
          where fee.seller_id = seller.id and fee.effective_to is null
          order by fee.effective_from desc
          limit 1
        ), '{}'::jsonb)
      ) order by seller.business_name)
      from public.marketplace_seller_profiles seller
      where seller.deleted_at is null
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', warehouse_product.id,
        'name', warehouse_product.name,
        'marketplace_product_id', warehouse_product.marketplace_product_id,
        'assigned', exists (
          select 1 from public.marketplace_seller_products seller_product
          where seller_product.warehouse_product_id = warehouse_product.id
        )
      ) order by warehouse_product.name)
      from public.warehouse_products warehouse_product
    ), '[]'::jsonb)
  ) into out_data;

  return out_data;
end;
$$;
revoke all on function public.admin_marketplace_sellers() from public, anon;
grant execute on function public.admin_marketplace_sellers() to authenticated;

-- Restore a soft-deleted seller profile when a Director reassigns that seller.
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
        business_address, created_by, deleted_at
      ) values (
        business_value, contact_name_value, email_value, contact_phone_value,
        business_address_value, auth.uid(), null
      ) returning id into seller_key;
    else
      update public.marketplace_seller_profiles set
        business_name = business_value,
        contact_name = contact_name_value,
        contact_email = email_value,
        contact_phone = contact_phone_value,
        business_address = business_address_value,
        deleted_at = null,
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
      deleted_at = null,
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

create or replace function public.admin_marketplace_seller_delete(p_seller_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;

  update public.marketplace_seller_profiles
  set deleted_at = now(), updated_at = now()
  where id = p_seller_id and deleted_at is null;

  if not found then
    raise exception 'This seller was not found or has already been deleted.';
  end if;

  delete from public.marketplace_seller_users
  where seller_id = p_seller_id;
end;
$$;
revoke all on function public.admin_marketplace_seller_delete(uuid) from public, anon;
grant execute on function public.admin_marketplace_seller_delete(uuid) to authenticated;
