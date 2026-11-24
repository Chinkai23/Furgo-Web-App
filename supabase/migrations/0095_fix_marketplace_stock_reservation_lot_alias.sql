-- The reservation function used a PL/pgSQL record named `lot` and also used
-- `lot` as a SQL table alias before the record loop began. PL/pgSQL resolved
-- lot.quantity to the unassigned record, causing checkout to fail with:
-- record "lot" is not assigned yet.
create or replace function public.reserve_marketplace_order_inventory(p_order_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.marketplace_orders;
  catalog jsonb;
  order_line record;
  product jsonb;
  variant jsonb;
  warehouse_id uuid;
  source_variant_id text;
  source_variant_label text;
  requested integer;
  available bigint;
  remaining integer;
  take_quantity integer;
  stock_batch record;
  allocations jsonb;
begin
  select * into order_row
  from public.marketplace_orders
  where id = p_order_id
  for update;
  if not found then raise exception 'Marketplace order % was not found.', p_order_id; end if;
  if order_row.details ? 'warehouseInventoryReservedAt'
     and not (order_row.details ? 'warehouseInventoryReleasedAt') then return; end if;
  if lower(coalesce(order_row.details->>'paymentMethod', '')) = 'online payment'
     and lower(coalesce(order_row.payment_status, '')) in ('pending', 'pending payment') then return; end if;

  select data.payload into catalog
  from public.app_data data
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared';
  if jsonb_typeof(catalog) is distinct from 'array' then raise exception 'Marketplace product catalogue is not available.'; end if;

  for order_line in
    select lines.order_id, lines.line_number, lines.item
    from public.marketplace_order_items lines
    where lines.order_id = p_order_id
    order by lines.line_number
    for update
  loop
    requested := greatest(coalesce(nullif(order_line.item->>'quantity', '')::integer, 0), 0);
    if requested = 0 then continue; end if;

    select entry.value into product
    from jsonb_array_elements(catalog) entry(value)
    where entry.value->>'id' = order_line.item->>'productId'
    limit 1;
    if product is null then raise exception 'A product in this order is no longer in the Marketplace catalogue.'; end if;

    select entry.value into variant
    from jsonb_array_elements(coalesce(product->'variants', '[]'::jsonb)) entry(value)
    where entry.value->>'id' = order_line.item->>'variantId'
    limit 1;
    if variant is null then raise exception 'A product option in this order is no longer available.'; end if;

    warehouse_id := null;
    begin
      warehouse_id := nullif(coalesce(variant->>'warehouseProductId', product->>'warehouseProductId'), '')::uuid;
    exception when invalid_text_representation then warehouse_id := null;
    end;
    if warehouse_id is null then
      select warehouse.id into warehouse_id
      from public.warehouse_products warehouse
      where warehouse.marketplace_product_id = product->>'id'
      limit 1;
    end if;
    if warehouse_id is null then raise exception 'Product % is not linked to Warehouse Stock.', product->>'name'; end if;

    source_variant_id := nullif(variant->>'warehouseVariantId', '');
    source_variant_label := null;
    select source.value->>'label' into source_variant_label
    from public.warehouse_products warehouse
    cross join lateral jsonb_array_elements(coalesce(warehouse.product_data->'variants', '[]'::jsonb)) source(value)
    where warehouse.id = warehouse_id
      and source.value->>'id' = source_variant_id
    limit 1;
    source_variant_label := coalesce(source_variant_label, nullif(variant->>'label', ''), 'Standard');

    select coalesce(sum(stock_lot.quantity), 0)::bigint into available
    from public.warehouse_inventory_lots stock_lot
    where stock_lot.warehouse_product_id = warehouse_id
      and coalesce(stock_lot.variant, 'Standard') = source_variant_label;
    if available < requested then
      raise exception 'Not enough stock for % (%). Available: %, requested: %.', product->>'name', source_variant_label, available, requested;
    end if;

    remaining := requested;
    allocations := '[]'::jsonb;
    for stock_batch in
      select *
      from public.warehouse_inventory_lots candidate_lot
      where candidate_lot.warehouse_product_id = warehouse_id
        and coalesce(candidate_lot.variant, 'Standard') = source_variant_label
        and candidate_lot.quantity > 0
      order by candidate_lot.pick_order asc, candidate_lot.expires_on asc nulls last,
               candidate_lot.received_on asc, candidate_lot.created_at asc, candidate_lot.id asc
      for update
    loop
      exit when remaining <= 0;
      take_quantity := least(remaining, stock_batch.quantity);
      update public.warehouse_inventory_lots target_lot
      set quantity = target_lot.quantity - take_quantity,
          updated_by = order_row.user_id,
          updated_at = now()
      where target_lot.id = stock_batch.id;
      allocations := allocations || jsonb_build_array(jsonb_build_object(
        'lot_id', stock_batch.id,
        'quantity', take_quantity,
        'warehouse_product_id', stock_batch.warehouse_product_id,
        'product_name', stock_batch.product_name,
        'sku', stock_batch.sku,
        'variant', stock_batch.variant,
        'batch_number', stock_batch.batch_number,
        'received_on', stock_batch.received_on,
        'expires_on', stock_batch.expires_on,
        'location', stock_batch.location,
        'notes', stock_batch.notes,
        'created_by', stock_batch.created_by,
        'pick_order', stock_batch.pick_order
      ));
      remaining := remaining - take_quantity;
    end loop;
    if remaining > 0 then
      raise exception 'Stock changed while this order was being placed. Please refresh the Marketplace and try again.';
    end if;

    update public.marketplace_order_items lines
    set item = (lines.item - 'warehouseStockAllocations') || jsonb_build_object('warehouseStockAllocations', allocations)
    where lines.order_id = p_order_id
      and lines.line_number = order_line.line_number;
  end loop;

  update public.marketplace_orders orders
  set details = (coalesce(orders.details, '{}'::jsonb) - 'warehouseInventoryReleasedAt')
                || jsonb_build_object('warehouseInventoryReservedAt', now()),
      updated_at = now()
  where orders.id = p_order_id;
end;
$$;

revoke all on function public.reserve_marketplace_order_inventory(text) from public, anon, authenticated;
