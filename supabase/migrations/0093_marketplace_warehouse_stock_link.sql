-- Make warehouse inventory batches the authoritative Marketplace stock ledger.

alter table public.warehouse_inventory_lots
  add column if not exists pick_order integer;

with ranked as (
  select id,
         row_number() over (
           partition by warehouse_product_id, coalesce(variant, 'Standard')
           order by expires_on asc nulls last, received_on asc, created_at asc, id asc
         )::integer as next_pick_order
  from public.warehouse_inventory_lots
)
update public.warehouse_inventory_lots lots
set pick_order = ranked.next_pick_order
from ranked
where lots.id = ranked.id
  and lots.pick_order is null;

alter table public.warehouse_inventory_lots
  alter column pick_order set default 0,
  alter column pick_order set not null;

create index if not exists warehouse_inventory_lots_pick_order_idx
  on public.warehouse_inventory_lots (warehouse_product_id, variant, pick_order, expires_on);

create or replace function public.set_warehouse_lot_default_pick_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and coalesce(new.pick_order, 0) <= 0 then
    select coalesce(max(lot.pick_order), 0) + 1 into new.pick_order
    from public.warehouse_inventory_lots lot
    where lot.warehouse_product_id is not distinct from new.warehouse_product_id
      and coalesce(lot.variant, 'Standard') = coalesce(new.variant, 'Standard');
  end if;
  return new;
end;
$$;

drop trigger if exists warehouse_inventory_lots_default_pick_order on public.warehouse_inventory_lots;
create trigger warehouse_inventory_lots_default_pick_order
before insert on public.warehouse_inventory_lots
for each row execute function public.set_warehouse_lot_default_pick_order();

create or replace function public.sync_marketplace_catalog_stock(p_catalog jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  product jsonb;
  variant jsonb;
  updated_product jsonb;
  updated_variants jsonb;
  output_catalog jsonb := '[]'::jsonb;
  product_warehouse_id uuid;
  variant_warehouse_id uuid;
  source_variant_id text;
  source_variant_label text;
  stock_total bigint;
begin
  if jsonb_typeof(p_catalog) is distinct from 'array' then
    return coalesce(p_catalog, '[]'::jsonb);
  end if;

  for product in select value from jsonb_array_elements(p_catalog) loop
    product_warehouse_id := null;
    begin
      product_warehouse_id := nullif(product->>'warehouseProductId', '')::uuid;
    exception when invalid_text_representation then
      product_warehouse_id := null;
    end;
    if product_warehouse_id is null then
      select warehouse.id into product_warehouse_id
      from public.warehouse_products warehouse
      where warehouse.marketplace_product_id = product->>'id'
      limit 1;
    end if;

    updated_variants := '[]'::jsonb;
    if jsonb_typeof(product->'variants') = 'array' then
      for variant in select value from jsonb_array_elements(product->'variants') loop
        variant_warehouse_id := product_warehouse_id;
        begin
          variant_warehouse_id := coalesce(nullif(variant->>'warehouseProductId', '')::uuid, product_warehouse_id);
        exception when invalid_text_representation then
          variant_warehouse_id := product_warehouse_id;
        end;
        if variant_warehouse_id is null then
          updated_variants := updated_variants || jsonb_build_array(variant);
          continue;
        end if;

        source_variant_id := nullif(variant->>'warehouseVariantId', '');
        source_variant_label := null;
        select source.value->>'label' into source_variant_label
        from public.warehouse_products warehouse
        cross join lateral jsonb_array_elements(coalesce(warehouse.product_data->'variants', '[]'::jsonb)) source(value)
        where warehouse.id = variant_warehouse_id
          and source.value->>'id' = source_variant_id
        limit 1;
        source_variant_label := coalesce(source_variant_label, nullif(variant->>'label', ''), 'Standard');

        select coalesce(sum(lot.quantity), 0)::bigint into stock_total
        from public.warehouse_inventory_lots lot
        where lot.warehouse_product_id = variant_warehouse_id
          and coalesce(lot.variant, 'Standard') = source_variant_label;

        updated_variants := updated_variants || jsonb_build_array(
          jsonb_set(variant, '{stock}', to_jsonb(stock_total), true)
        );
      end loop;
      updated_product := jsonb_set(product, '{variants}', updated_variants, true);
    else
      updated_product := product;
    end if;
    output_catalog := output_catalog || jsonb_build_array(updated_product);
  end loop;
  return output_catalog;
end;
$$;

revoke all on function public.sync_marketplace_catalog_stock(jsonb) from public, anon, authenticated;

create or replace function public.enforce_marketplace_catalog_warehouse_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.record_id = 'shared:furgo-demo-marketplace-products:shared' then
    new.payload := public.sync_marketplace_catalog_stock(new.payload);
  end if;
  return new;
end;
$$;

drop trigger if exists app_data_marketplace_catalog_stock on public.app_data;
create trigger app_data_marketplace_catalog_stock
before insert or update of payload on public.app_data
for each row execute function public.enforce_marketplace_catalog_warehouse_stock();

create or replace function public.refresh_marketplace_stock_for_warehouse_product(p_warehouse_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_warehouse_product_id is null then return; end if;
  update public.app_data data
  set payload = data.payload,
      updated_at = now()
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared'
    and exists (
      select 1 from public.warehouse_products warehouse
      where warehouse.id = p_warehouse_product_id
        and warehouse.marketplace_product_id is not null
    );
end;
$$;
revoke all on function public.refresh_marketplace_stock_for_warehouse_product(uuid) from public, anon, authenticated;

create or replace function public.sync_marketplace_stock_after_lot_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_marketplace_stock_for_warehouse_product(old.warehouse_product_id);
    return old;
  end if;
  perform public.refresh_marketplace_stock_for_warehouse_product(new.warehouse_product_id);
  if tg_op = 'UPDATE' and old.warehouse_product_id is distinct from new.warehouse_product_id then
    perform public.refresh_marketplace_stock_for_warehouse_product(old.warehouse_product_id);
  end if;
  return new;
end;
$$;

drop trigger if exists warehouse_inventory_lots_sync_marketplace_stock on public.warehouse_inventory_lots;
create trigger warehouse_inventory_lots_sync_marketplace_stock
after insert or delete on public.warehouse_inventory_lots
for each row execute function public.sync_marketplace_stock_after_lot_change();
drop trigger if exists warehouse_inventory_lots_update_sync_marketplace_stock on public.warehouse_inventory_lots;
create trigger warehouse_inventory_lots_update_sync_marketplace_stock
after update of quantity, variant, warehouse_product_id on public.warehouse_inventory_lots
for each row execute function public.sync_marketplace_stock_after_lot_change();

-- A newly received batch starts in expiry order. Staff can then manually reorder it.
create or replace function public.sort_new_warehouse_lot_by_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  with ranked as (
    select id,
           row_number() over (
             order by expires_on asc nulls last, received_on asc, created_at asc, id asc
           )::integer as next_pick_order
    from public.warehouse_inventory_lots
    where warehouse_product_id is not distinct from new.warehouse_product_id
      and coalesce(variant, 'Standard') = coalesce(new.variant, 'Standard')
  )
  update public.warehouse_inventory_lots lot
  set pick_order = ranked.next_pick_order
  from ranked
  where lot.id = ranked.id;
  return new;
end;
$$;

drop trigger if exists warehouse_inventory_lots_sort_new_batch on public.warehouse_inventory_lots;
create trigger warehouse_inventory_lots_sort_new_batch
after insert on public.warehouse_inventory_lots
for each row execute function public.sort_new_warehouse_lot_by_expiry();

drop trigger if exists warehouse_inventory_lots_resort_expiry on public.warehouse_inventory_lots;
create trigger warehouse_inventory_lots_resort_expiry
after update of expires_on, received_on on public.warehouse_inventory_lots
for each row
when (old.expires_on is distinct from new.expires_on or old.received_on is distinct from new.received_on)
execute function public.sort_new_warehouse_lot_by_expiry();

create or replace function public.reorder_warehouse_inventory_lots(p_lot_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  lot_id uuid;
  ordinal integer := 0;
  total_count integer;
  owned_count integer;
  first_product uuid;
  first_variant text;
begin
  if auth.uid() is null then raise exception 'Sign in to arrange warehouse batches.'; end if;
  if coalesce(array_length(p_lot_ids, 1), 0) = 0 then raise exception 'Choose at least one stock batch.'; end if;
  if (select count(distinct listed.id) from unnest(p_lot_ids) as listed(id)) <> array_length(p_lot_ids, 1) then
    raise exception 'A stock batch can only appear once in the order.';
  end if;

  select count(*) into total_count
  from public.warehouse_inventory_lots
  where id = any(p_lot_ids)
    and created_by = auth.uid();
  owned_count := total_count;
  if owned_count <> array_length(p_lot_ids, 1) then raise exception 'One or more batches are not in your Store account.'; end if;
  select warehouse_product_id, coalesce(variant, 'Standard')
  into first_product, first_variant
  from public.warehouse_inventory_lots
  where id = any(p_lot_ids)
  limit 1;
  if exists (
    select 1 from public.warehouse_inventory_lots lot
    where lot.id = any(p_lot_ids)
      and (lot.warehouse_product_id is distinct from first_product
        or coalesce(lot.variant, 'Standard') <> first_variant)
  ) then raise exception 'Reorder batches from one product option at a time.'; end if;

  select count(*) into total_count
  from public.warehouse_inventory_lots lot
  where lot.warehouse_product_id is not distinct from first_product
    and coalesce(lot.variant, 'Standard') = first_variant
    and lot.created_by = auth.uid();
  if total_count <> array_length(p_lot_ids, 1) then
    raise exception 'Include every batch for this product option when changing its pick order.';
  end if;

  foreach lot_id in array p_lot_ids loop
    ordinal := ordinal + 1;
    update public.warehouse_inventory_lots
    set pick_order = ordinal, updated_by = auth.uid(), updated_at = now()
    where id = lot_id and created_by = auth.uid();
  end loop;
end;
$$;
revoke all on function public.reorder_warehouse_inventory_lots(uuid[]) from public, anon;
grant execute on function public.reorder_warehouse_inventory_lots(uuid[]) to authenticated;

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
  lot record;
  allocations jsonb;
begin
  select * into order_row from public.marketplace_orders where id = p_order_id for update;
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
    where warehouse.id = warehouse_id and source.value->>'id' = source_variant_id
    limit 1;
    source_variant_label := coalesce(source_variant_label, nullif(variant->>'label', ''), 'Standard');

    select coalesce(sum(lot.quantity), 0)::bigint into available
    from public.warehouse_inventory_lots lot
    where lot.warehouse_product_id = warehouse_id
      and coalesce(lot.variant, 'Standard') = source_variant_label;
    if available < requested then
      raise exception 'Not enough stock for % (%). Available: %, requested: %.', product->>'name', source_variant_label, available, requested;
    end if;

    remaining := requested;
    allocations := '[]'::jsonb;
    for lot in
      select * from public.warehouse_inventory_lots stock_lot
      where stock_lot.warehouse_product_id = warehouse_id
        and coalesce(stock_lot.variant, 'Standard') = source_variant_label
        and stock_lot.quantity > 0
      order by stock_lot.pick_order asc, stock_lot.expires_on asc nulls last,
               stock_lot.received_on asc, stock_lot.created_at asc, stock_lot.id asc
      for update
    loop
      exit when remaining <= 0;
      take_quantity := least(remaining, lot.quantity);
      update public.warehouse_inventory_lots stock_lot
      set quantity = stock_lot.quantity - take_quantity,
          updated_by = order_row.user_id,
          updated_at = now()
      where stock_lot.id = lot.id;
      allocations := allocations || jsonb_build_array(jsonb_build_object(
        'lot_id', lot.id, 'quantity', take_quantity,
        'warehouse_product_id', lot.warehouse_product_id,
        'product_name', lot.product_name, 'sku', lot.sku, 'variant', lot.variant,
        'batch_number', lot.batch_number, 'received_on', lot.received_on,
        'expires_on', lot.expires_on, 'location', lot.location, 'notes', lot.notes,
        'created_by', lot.created_by, 'pick_order', lot.pick_order
      ));
      remaining := remaining - take_quantity;
    end loop;
    if remaining > 0 then
      raise exception 'Stock changed while this order was being placed. Please refresh the Marketplace and try again.';
    end if;
    update public.marketplace_order_items lines
    set item = (lines.item - 'warehouseStockAllocations') || jsonb_build_object('warehouseStockAllocations', allocations)
    where lines.order_id = p_order_id and lines.line_number = order_line.line_number;
  end loop;

  update public.marketplace_orders orders
  set details = (coalesce(orders.details, '{}'::jsonb) - 'warehouseInventoryReleasedAt')
                || jsonb_build_object('warehouseInventoryReservedAt', now()),
      updated_at = now()
  where orders.id = p_order_id;
end;
$$;
revoke all on function public.reserve_marketplace_order_inventory(text) from public, anon, authenticated;

create or replace function public.release_marketplace_order_inventory(p_order_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.marketplace_orders;
  order_line record;
  allocation jsonb;
  existing_lot uuid;
begin
  select * into order_row from public.marketplace_orders where id = p_order_id for update;
  if not found or not (order_row.details ? 'warehouseInventoryReservedAt')
     or order_row.details ? 'warehouseInventoryReleasedAt' then return; end if;
  for order_line in
    select lines.order_id, lines.line_number, lines.item
    from public.marketplace_order_items lines
    where lines.order_id = p_order_id
    order by lines.line_number
    for update
  loop
    for allocation in select value from jsonb_array_elements(coalesce(order_line.item->'warehouseStockAllocations', '[]'::jsonb)) loop
      existing_lot := nullif(allocation->>'lot_id', '')::uuid;
      update public.warehouse_inventory_lots lot
      set quantity = lot.quantity + coalesce(nullif(allocation->>'quantity', '')::integer, 0),
          updated_by = order_row.user_id, updated_at = now()
      where lot.id = existing_lot;
      if not found then
        insert into public.warehouse_inventory_lots (
          id, warehouse_product_id, product_name, sku, variant, batch_number, quantity,
          received_on, expires_on, location, notes, created_by, updated_by, pick_order
        ) values (
          existing_lot,
          nullif(allocation->>'warehouse_product_id', '')::uuid,
          coalesce(allocation->>'product_name', 'Restored Marketplace stock'),
          allocation->>'sku', allocation->>'variant', allocation->>'batch_number',
          coalesce(nullif(allocation->>'quantity', '')::integer, 0),
          coalesce(nullif(allocation->>'received_on', '')::date, current_date),
          nullif(allocation->>'expires_on', '')::date,
          allocation->>'location', allocation->>'notes',
          coalesce(nullif(allocation->>'created_by', '')::uuid, order_row.user_id),
          coalesce(nullif(allocation->>'created_by', '')::uuid, order_row.user_id),
          coalesce(nullif(allocation->>'pick_order', '')::integer, 0)
        );
      end if;
    end loop;
  end loop;
  update public.marketplace_orders orders
  set details = coalesce(orders.details, '{}'::jsonb) || jsonb_build_object('warehouseInventoryReleasedAt', now()),
      updated_at = now()
  where orders.id = p_order_id;
end;
$$;
revoke all on function public.release_marketplace_order_inventory(text) from public, anon, authenticated;

-- Portal edits to an order's regular details must not erase the stock reservation ledger.
create or replace function public.preserve_marketplace_inventory_order_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.details := coalesce(new.details, '{}'::jsonb);
    if old.details ? 'warehouseInventoryReservedAt'
       and not (new.details ? 'warehouseInventoryReservedAt') then
      new.details := new.details || jsonb_build_object('warehouseInventoryReservedAt', old.details->'warehouseInventoryReservedAt');
    end if;
    if old.details ? 'warehouseInventoryReleasedAt'
       and not (new.details ? 'warehouseInventoryReleasedAt')
       and (not (new.details ? 'warehouseInventoryReservedAt')
         or lower(coalesce(old.payment_status, '')) in ('payment rejected', 'failed payment')
            and lower(coalesce(new.payment_status, '')) in ('paid', 'paid with furgo credit', 'successful', 'succeeded', 'completed')) then
      new.details := new.details || jsonb_build_object('warehouseInventoryReleasedAt', old.details->'warehouseInventoryReleasedAt');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_order_preserve_inventory_details on public.marketplace_orders;
create trigger marketplace_order_preserve_inventory_details
before update of details on public.marketplace_orders
for each row execute function public.preserve_marketplace_inventory_order_details();

create or replace function public.sync_marketplace_order_inventory_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  paid_status boolean;
  cancelled_status boolean;
begin
  paid_status := lower(coalesce(new.payment_status, '')) in ('paid', 'paid with furgo credit', 'successful', 'succeeded', 'completed');
  cancelled_status := lower(coalesce(new.status, '')) like '%cancel%'
    or lower(coalesce(new.payment_status, '')) in ('payment rejected', 'failed payment');
  if paid_status and lower(coalesce(old.payment_status, '')) not in ('paid', 'paid with furgo credit', 'successful', 'succeeded', 'completed') then
    perform public.reserve_marketplace_order_inventory(new.id);
  elsif cancelled_status then
    perform public.release_marketplace_order_inventory(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_order_inventory_status on public.marketplace_orders;
create trigger marketplace_order_inventory_status
after update of status, payment_status on public.marketplace_orders
for each row execute function public.sync_marketplace_order_inventory_status();

create or replace function public.create_marketplace_order(p_order jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  v_order_id text := nullif(p_order->>'id', '');
  existing_owner uuid;
  payment_status_value text := coalesce(nullif(p_order->>'paymentStatus', ''), 'Pending');
begin
  if actor_id is null then raise exception 'Sign in before placing a Marketplace order.'; end if;
  if v_order_id is null then raise exception 'Marketplace order id is required.'; end if;
  if jsonb_typeof(p_order->'items') is distinct from 'array' or jsonb_array_length(p_order->'items') = 0 then
    raise exception 'Marketplace order must contain at least one product.';
  end if;

  insert into public.marketplace_orders (
    id, user_id, reference, status, payment_status, total, outlet, details, created_at, updated_at
  ) values (
    v_order_id, actor_id,
    coalesce(nullif(p_order->>'reference', ''), v_order_id),
    coalesce(nullif(p_order->>'status', ''), 'New Order'),
    payment_status_value,
    coalesce(nullif(p_order->>'total', '')::numeric, 0),
    coalesce(nullif(p_order->>'outlet', ''), nullif(p_order->>'fulfillmentOutlet', ''), ''),
    p_order - 'items' - 'userId' - '_cloudOwnerId',
    coalesce(nullif(p_order->>'createdAt', '')::timestamptz, now()), now()
  ) on conflict (id) do nothing;

  select orders.user_id into existing_owner
  from public.marketplace_orders orders where orders.id = v_order_id for update;
  if existing_owner is distinct from actor_id then raise exception 'This Marketplace order belongs to another account.'; end if;

  insert into public.marketplace_order_items (order_id, line_number, item)
  select v_order_id, product.ordinality::integer, product.value
  from jsonb_array_elements(p_order->'items') with ordinality as product(value, ordinality)
  on conflict (order_id, line_number) do nothing;

  if lower(coalesce(p_order->>'paymentMethod', '')) <> 'online payment'
     or lower(payment_status_value) not in ('pending', 'pending payment') then
    perform public.reserve_marketplace_order_inventory(v_order_id);
  end if;
end;
$$;
revoke all on function public.create_marketplace_order(jsonb) from public, anon;
grant execute on function public.create_marketplace_order(jsonb) to authenticated;

-- Keep already-linked listings accurate immediately after applying the migration.
update public.app_data data
set payload = data.payload,
    updated_at = now()
where data.record_id = 'shared:furgo-demo-marketplace-products:shared';
