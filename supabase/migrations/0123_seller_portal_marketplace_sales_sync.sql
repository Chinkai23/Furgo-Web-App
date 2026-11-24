-- Keep Seller Portal sales and settlement data in sync with the shared
-- Marketplace orders that Store Portal fulfils. Also backfill orders created
-- before the seller sale-line triggers were installed or before mappings were
-- complete.

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

  -- Only paid orders count as sales. Existing ledger rows are kept in sync if
  -- their order later moves to a cancellation, return, refund, or fulfilment state.
  if lower(coalesce(paid_status, '')) not in ('paid','paid with furgo credit','successful','succeeded','completed')
     and not exists (
       select 1 from public.marketplace_seller_sale_lines existing
       where existing.internal_order_id = p_order_id
         and existing.internal_line_number = p_line_number
     ) then
    return;
  end if;

  -- Older seller mappings can have a null marketplace_product_id even though
  -- their warehouse row is already linked to the Marketplace product.
  select data.payload into marketplace_catalog
  from public.app_data data
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared';

  select sp.* into seller_product
  from public.marketplace_seller_products sp
  join public.warehouse_products warehouse
    on warehouse.id = sp.warehouse_product_id
  where sp.marketplace_product_id = line_item->>'productId'
     or warehouse.marketplace_product_id = line_item->>'productId'
     or exists (
       select 1
       from jsonb_array_elements(
         case when jsonb_typeof(marketplace_catalog) = 'array' then marketplace_catalog else '[]'::jsonb end
       ) as entry(value)
       where entry.value->>'id' = line_item->>'productId'
         and (
           entry.value->>'warehouseProductId' = warehouse.id::text
           or exists (
             select 1 from jsonb_array_elements(
               case when jsonb_typeof(entry.value->'variants') = 'array' then entry.value->'variants' else '[]'::jsonb end
             ) as mapped_variant(value)
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

  -- Apply the fee rule effective on the order date, so a later fee edit does
  -- not rewrite the seller's historical earnings calculation.
  select * into fee
  from public.marketplace_seller_fee_rules
  where seller_id = seller_product.seller_id
    and effective_from <= order_created_at
    and (effective_to is null or effective_to > order_created_at)
  order by effective_from desc
  limit 1;

  commission_amount_value := round(gross * coalesce(fee.commission_percent, 0) / 100, 2);
  service_fee_value := round(qty * coalesce(fee.service_fee_per_unit, 0), 2);
  sale_status := case
    when exists (select 1 from public.marketplace_item_returns returned
      where returned.order_id = p_order_id and returned.line_number = p_line_number and returned.status = 'Refunded') then 'Refunded'
    when exists (select 1 from public.marketplace_item_returns returned
      where returned.order_id = p_order_id and returned.line_number = p_line_number and returned.status = 'Refund Processing') then 'Returned'
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
    commission_amount_value, service_fee_value, gross - commission_amount_value - service_fee_value
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

-- Refresh all existing paid lines and preserve the same triggers for future
-- payment changes, line inserts, and return/refund updates.
do $$
declare order_line record;
begin
  for order_line in
    select lines.order_id, lines.line_number
    from public.marketplace_order_items lines
    join public.marketplace_orders orders on orders.id = lines.order_id
    where lower(coalesce(orders.payment_status, '')) in ('paid','paid with furgo credit','successful','succeeded','completed')
  loop
    perform public.seller_portal_sync_sale_line(order_line.order_id, order_line.line_number);
  end loop;
end;
$$;

-- Snapshot units sold and inventory sales are based on this ledger, so refresh
-- is also triggered whenever an order status/payment status changes.
drop trigger if exists seller_portal_order_status_sync on public.marketplace_orders;
create trigger seller_portal_order_status_sync
after update of status, payment_status on public.marketplace_orders
for each row execute function public.seller_portal_sync_order_lines();

drop trigger if exists seller_portal_inserted_line_sync on public.marketplace_order_items;
create trigger seller_portal_inserted_line_sync
after insert on public.marketplace_order_items
for each row execute function public.seller_portal_sync_inserted_line();

drop trigger if exists seller_portal_return_status_sync on public.marketplace_item_returns;
create trigger seller_portal_return_status_sync
after insert or update of status on public.marketplace_item_returns
for each row execute function public.seller_portal_sync_return_status();
