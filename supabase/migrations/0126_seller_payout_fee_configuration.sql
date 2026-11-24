-- Give directors seller-specific warehouse, fulfilment, marketplace, and
-- payout-basis controls while preserving the existing effective-dated rules.

alter table public.marketplace_seller_fee_rules
  add column if not exists warehouse_fee_enabled boolean not null default false,
  add column if not exists warehouse_fee_per_unit numeric(12,2) not null default 0 check (warehouse_fee_per_unit >= 0),
  add column if not exists pack_ship_fee_per_unit numeric(12,2) not null default 0 check (pack_ship_fee_per_unit >= 0),
  add column if not exists payout_basis text not null default 'net_after_fees'
    check (payout_basis in ('net_after_fees','gross_sales'));

-- Treat legacy service fees as Pack & Ship fees so existing rules keep their
-- current meaning after this migration.
update public.marketplace_seller_fee_rules
set pack_ship_fee_per_unit = service_fee_per_unit
where pack_ship_fee_per_unit = 0 and service_fee_per_unit > 0;

create or replace function public.admin_marketplace_seller_get_fee_configuration(p_seller_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare configuration jsonb;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;
  if not exists (select 1 from public.marketplace_seller_profiles where id = p_seller_id and deleted_at is null) then
    raise exception 'Seller was not found.';
  end if;
  select jsonb_build_object(
    'warehouse_fee_enabled', fee.warehouse_fee_enabled,
    'warehouse_fee_per_unit', fee.warehouse_fee_per_unit,
    'pack_ship_fee_per_unit', fee.pack_ship_fee_per_unit,
    'marketplace_fee_percent', fee.commission_percent,
    'payout_basis', fee.payout_basis,
    'effective_from', fee.effective_from
  ) into configuration
  from public.marketplace_seller_fee_rules fee
  where fee.seller_id = p_seller_id and fee.effective_to is null
  order by fee.effective_from desc
  limit 1;
  return coalesce(configuration, jsonb_build_object(
    'warehouse_fee_enabled', false,
    'warehouse_fee_per_unit', 0,
    'pack_ship_fee_per_unit', 0,
    'marketplace_fee_percent', 0,
    'payout_basis', 'net_after_fees'
  ));
end;
$$;
revoke all on function public.admin_marketplace_seller_get_fee_configuration(uuid) from public, anon;
grant execute on function public.admin_marketplace_seller_get_fee_configuration(uuid) to authenticated;

create or replace function public.admin_marketplace_seller_set_fee_configuration(
  p_seller_id uuid,
  p_warehouse_fee_enabled boolean,
  p_warehouse_fee_per_unit numeric,
  p_pack_ship_fee_per_unit numeric,
  p_marketplace_fee_percent numeric,
  p_payout_basis text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare warehouse_rate numeric(12,2);
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;
  if not exists (select 1 from public.marketplace_seller_profiles where id = p_seller_id and deleted_at is null) then
    raise exception 'Seller was not found.';
  end if;
  if coalesce(p_warehouse_fee_per_unit, -1) < 0
    or coalesce(p_pack_ship_fee_per_unit, -1) < 0
    or coalesce(p_marketplace_fee_percent, -1) < 0
    or p_marketplace_fee_percent > 100
    or coalesce(p_payout_basis, '') not in ('net_after_fees','gross_sales') then
    raise exception 'Enter valid fee amounts and payout calculation.';
  end if;
  warehouse_rate := case when coalesce(p_warehouse_fee_enabled, false) then p_warehouse_fee_per_unit else 0 end;
  update public.marketplace_seller_fee_rules
  set effective_to = now()
  where seller_id = p_seller_id and effective_to is null;
  insert into public.marketplace_seller_fee_rules (
    seller_id, commission_percent, service_fee_per_unit,
    warehouse_fee_enabled, warehouse_fee_per_unit, pack_ship_fee_per_unit, payout_basis, created_by
  ) values (
    p_seller_id, p_marketplace_fee_percent,
    warehouse_rate + p_pack_ship_fee_per_unit,
    coalesce(p_warehouse_fee_enabled, false), warehouse_rate, p_pack_ship_fee_per_unit, p_payout_basis, auth.uid()
  );
end;
$$;
revoke all on function public.admin_marketplace_seller_set_fee_configuration(uuid,boolean,numeric,numeric,numeric,text) from public, anon;
grant execute on function public.admin_marketplace_seller_set_fee_configuration(uuid,boolean,numeric,numeric,numeric,text) to authenticated;

create or replace function public.admin_marketplace_seller_calculate_payout(
  p_seller_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare totals jsonb;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;
  if not exists (select 1 from public.marketplace_seller_profiles where id = p_seller_id and deleted_at is null) then
    raise exception 'Seller was not found.';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Choose a valid payout date range.';
  end if;

  select jsonb_build_object(
    'units', coalesce(sum(sale.quantity), 0),
    'gross_sales', coalesce(round(sum(sale.gross_sales), 2), 0),
    'marketplace_fee', coalesce(round(sum(sale.commission_amount), 2), 0),
    'service_fee', coalesce(round(sum(sale.service_fee_amount), 2), 0),
    'payout_amount', coalesce(round(sum(sale.seller_net_earnings), 2), 0)
  ) into totals
  from public.marketplace_seller_sale_lines sale
  where sale.seller_id = p_seller_id
    and sale.sale_date between p_period_start and p_period_end
    and sale.product_sale_status not in ('Cancelled','Returned','Refunded');

  return coalesce(totals, jsonb_build_object(
    'units', 0, 'gross_sales', 0, 'marketplace_fee', 0,
    'service_fee', 0, 'payout_amount', 0
  ));
end;
$$;
revoke all on function public.admin_marketplace_seller_calculate_payout(uuid,date,date) from public, anon;
grant execute on function public.admin_marketplace_seller_calculate_payout(uuid,date,date) to authenticated;

-- Use the selected fee configuration for future sales and keep the existing
-- order-line reconciliation behavior intact.
create or replace function public.seller_portal_sync_sale_line(p_order_id text, p_line_number integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  line_item jsonb;
  order_status text;
  paid_status text;
  order_created_at timestamptz;
  marketplace_catalog jsonb;
  seller_product public.marketplace_seller_products;
  product_data jsonb;
  fee public.marketplace_seller_fee_rules;
  qty integer;
  unit_amount numeric(12,2);
  gross numeric(12,2);
  commission_amount_value numeric(12,2);
  service_fee_value numeric(12,2);
  payout_basis_value text;
  sale_status text;
begin
  select item into line_item
  from public.marketplace_order_items
  where order_id = p_order_id and line_number = p_line_number;
  if line_item is null then return; end if;

  select status, payment_status, created_at
    into order_status, paid_status, order_created_at
  from public.marketplace_orders where id = p_order_id;
  if not found then return; end if;

  if lower(coalesce(paid_status, '')) not in ('paid','paid with furgo credit','successful','succeeded','completed')
     and not exists (
       select 1 from public.marketplace_seller_sale_lines existing
       where existing.internal_order_id = p_order_id
         and existing.internal_line_number = p_line_number
     ) then
    return;
  end if;

  select data.payload into marketplace_catalog
  from public.app_data data
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared';

  select sp.* into seller_product
  from public.marketplace_seller_products sp
  join public.warehouse_products warehouse on warehouse.id = sp.warehouse_product_id
  where sp.marketplace_product_id = line_item->>'productId'
     or warehouse.marketplace_product_id = line_item->>'productId'
     or exists (
       select 1
       from jsonb_array_elements(case when jsonb_typeof(marketplace_catalog) = 'array' then marketplace_catalog else '[]'::jsonb end) as entry(value)
       where entry.value->>'id' = line_item->>'productId'
         and (
           entry.value->>'warehouseProductId' = warehouse.id::text
           or exists (
             select 1 from jsonb_array_elements(case when jsonb_typeof(entry.value->'variants') = 'array' then entry.value->'variants' else '[]'::jsonb end) as mapped_variant(value)
             where mapped_variant.value->>'warehouseProductId' = warehouse.id::text
           )
         )
     )
  order by case when sp.marketplace_product_id = line_item->>'productId' then 0
                when warehouse.marketplace_product_id = line_item->>'productId' then 1 else 2 end
  limit 1;
  if not found then return; end if;

  select warehouse.product_data into product_data
  from public.warehouse_products warehouse
  where warehouse.id = seller_product.warehouse_product_id;

  qty := greatest(coalesce(nullif(line_item->>'quantity', '')::integer, 0), 0);
  unit_amount := greatest(coalesce(
    nullif(line_item->>'unitPrice', '')::numeric,
    nullif(line_item->>'total', '')::numeric / nullif(qty, 0),
    0
  ), 0);
  gross := round(unit_amount * qty, 2);

  select * into fee
  from public.marketplace_seller_fee_rules
  where seller_id = seller_product.seller_id
    and effective_from <= order_created_at
    and (effective_to is null or effective_to > order_created_at)
  order by effective_from desc
  limit 1;

  commission_amount_value := round(gross * coalesce(fee.commission_percent, 0) / 100, 2);
  service_fee_value := round(qty * coalesce(fee.service_fee_per_unit, 0), 2);
  payout_basis_value := coalesce(fee.payout_basis, 'net_after_fees');
  sale_status := case
    when exists (select 1 from public.marketplace_item_returns returned where returned.order_id = p_order_id and returned.line_number = p_line_number and returned.status = 'Refunded') then 'Refunded'
    when exists (select 1 from public.marketplace_item_returns returned where returned.order_id = p_order_id and returned.line_number = p_line_number and returned.status = 'Refund Processing') then 'Returned'
    when lower(coalesce(order_status, '')) like '%cancel%' then 'Cancelled'
    when lower(coalesce(order_status, '')) like '%refund%' then 'Refunded'
    when lower(coalesce(order_status, '')) like '%return%' then 'Returned'
    when lower(coalesce(order_status, '')) like '%deliver%' or lower(coalesce(order_status, '')) = 'completed' then 'Completed'
    when lower(coalesce(order_status, '')) like '%ship%' then 'Shipped'
    else 'Processing'
  end;

  insert into public.marketplace_seller_sale_lines (
    seller_id, warehouse_product_id, internal_order_id, internal_line_number, sale_date,
    product_name, product_image, seller_sku, variant, quantity, unit_price, gross_sales,
    product_sale_status, commission_percent_snapshot, commission_amount, service_fee_amount, seller_net_earnings
  ) values (
    seller_product.seller_id, seller_product.warehouse_product_id, p_order_id, p_line_number,
    (timezone('Asia/Kuala_Lumpur', order_created_at))::date,
    coalesce(nullif(line_item->>'name', ''), product_data->>'name', 'Product'),
    coalesce(nullif(line_item->>'imageUrl', ''), product_data->'images'->>0, ''),
    seller_product.seller_sku,
    coalesce(nullif(line_item->>'variantLabel', ''), nullif(line_item->>'variant_label', ''), nullif(line_item->>'variant', ''), ''),
    qty, unit_amount, gross, sale_status, coalesce(fee.commission_percent, 0),
    commission_amount_value, service_fee_value,
    case when payout_basis_value = 'gross_sales' then gross else greatest(0, gross - commission_amount_value - service_fee_value) end
  )
  on conflict (internal_order_id, internal_line_number) do update set
    seller_id = excluded.seller_id,
    warehouse_product_id = excluded.warehouse_product_id,
    sale_date = excluded.sale_date,
    product_name = excluded.product_name,
    product_image = excluded.product_image,
    seller_sku = excluded.seller_sku,
    variant = excluded.variant,
    quantity = excluded.quantity,
    unit_price = excluded.unit_price,
    gross_sales = excluded.gross_sales,
    product_sale_status = excluded.product_sale_status,
    commission_percent_snapshot = excluded.commission_percent_snapshot,
    commission_amount = excluded.commission_amount,
    service_fee_amount = excluded.service_fee_amount,
    seller_net_earnings = excluded.seller_net_earnings,
    updated_at = now();
end;
$$;
revoke all on function public.seller_portal_sync_sale_line(text, integer) from public, anon, authenticated;
