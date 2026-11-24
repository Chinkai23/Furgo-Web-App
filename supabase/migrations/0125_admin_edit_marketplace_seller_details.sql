-- Let Directors maintain a seller's saved business and contact details from
-- Admin Portal → Manage Sellers.

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
        'business_address', seller.business_address,
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

create or replace function public.admin_marketplace_seller_update_details(
  p_seller_id uuid,
  p_business_name text,
  p_contact_name text,
  p_contact_phone text,
  p_business_address text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  business_value text := btrim(coalesce(p_business_name, ''));
  contact_name_value text := btrim(coalesce(p_contact_name, ''));
  contact_phone_value text := btrim(coalesce(p_contact_phone, ''));
  business_address_value text := btrim(coalesce(p_business_address, ''));
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;
  if business_value = '' or business_address_value = '' then
    raise exception 'Business name and business address are required.';
  end if;
  if char_length(business_value) > 160 or char_length(contact_name_value) > 120
    or char_length(contact_phone_value) > 40 or char_length(business_address_value) > 500 then
    raise exception 'Seller business or contact details exceed the allowed length.';
  end if;

  update public.marketplace_seller_profiles
  set business_name = business_value,
      contact_name = contact_name_value,
      contact_phone = contact_phone_value,
      business_address = business_address_value,
      updated_at = now()
  where id = p_seller_id and deleted_at is null;

  if not found then
    raise exception 'This seller was not found or has already been deleted.';
  end if;
end;
$$;
revoke all on function public.admin_marketplace_seller_update_details(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.admin_marketplace_seller_update_details(uuid, text, text, text, text)
  to authenticated;
