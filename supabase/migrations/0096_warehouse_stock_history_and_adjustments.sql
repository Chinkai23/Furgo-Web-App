-- Keep a durable movement ledger for every warehouse stock addition, sale,
-- return, refund, manual adjustment, or batch deletion.
create table if not exists public.warehouse_inventory_stock_history (
  id uuid primary key default gen_random_uuid(),
  warehouse_product_id uuid references public.warehouse_products(id) on delete set null,
  lot_id uuid references public.warehouse_inventory_lots(id) on delete set null,
  store_user_id uuid not null references auth.users(id) on delete cascade,
  product_name text not null,
  sku text,
  variant text not null default 'Standard',
  batch_number text,
  quantity_delta integer not null check (quantity_delta <> 0),
  quantity_before integer not null default 0,
  quantity_after integer not null default 0,
  reason text not null,
  order_number text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists warehouse_inventory_stock_history_product_idx
  on public.warehouse_inventory_stock_history (warehouse_product_id, variant, created_at desc);
create index if not exists warehouse_inventory_stock_history_lot_idx
  on public.warehouse_inventory_stock_history (lot_id, created_at desc);

alter table public.warehouse_inventory_stock_history enable row level security;
drop policy if exists "Store account reads its stock history" on public.warehouse_inventory_stock_history;
create policy "Store account reads its stock history"
  on public.warehouse_inventory_stock_history for select to authenticated
  using (
    store_user_id = (select auth.uid())
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = (select auth.uid())
    )
  );
grant select on public.warehouse_inventory_stock_history to authenticated;
revoke insert, update, delete on public.warehouse_inventory_stock_history from anon, authenticated;

create or replace function public.guard_warehouse_inventory_quantity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.quantity is distinct from old.quantity
     and nullif(current_setting('furgo.stock.reason', true), '') is null then
    raise exception 'Use the stock adjustment flow and provide a reason before changing a batch quantity.';
  end if;
  if tg_op = 'DELETE' and old.quantity > 0
     and nullif(current_setting('furgo.stock.reason', true), '') is null then
    raise exception 'Stock must be adjusted with a reason before a batch can be deleted.';
  end if;
  return new;
end;
$$;

drop trigger if exists warehouse_inventory_quantity_change_guard on public.warehouse_inventory_lots;
create trigger warehouse_inventory_quantity_change_guard
before update of quantity on public.warehouse_inventory_lots
for each row execute function public.guard_warehouse_inventory_quantity_change();

create or replace function public.record_warehouse_inventory_stock_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  stock_delta integer;
  before_quantity integer;
  after_quantity integer;
  owner_user uuid;
  actor_user uuid;
  related_order text;
  movement_reason text;
  movement_notes text;
  movement_order text;
  order_id text;
begin
  if tg_op = 'INSERT' then
    stock_delta := coalesce(new.quantity, 0);
    before_quantity := 0;
    after_quantity := coalesce(new.quantity, 0);
    owner_user := new.created_by;
    actor_user := coalesce(new.updated_by, new.created_by, auth.uid());
  elsif tg_op = 'DELETE' then
    stock_delta := -coalesce(old.quantity, 0);
    before_quantity := coalesce(old.quantity, 0);
    after_quantity := 0;
    owner_user := old.created_by;
    actor_user := coalesce(old.updated_by, auth.uid());
  else
    stock_delta := new.quantity - old.quantity;
    before_quantity := old.quantity;
    after_quantity := new.quantity;
    owner_user := new.created_by;
    actor_user := coalesce(new.updated_by, auth.uid());
  end if;

  if stock_delta = 0 or owner_user is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  movement_reason := coalesce(nullif(current_setting('furgo.stock.reason', true), ''),
    case when tg_op = 'INSERT' then 'Add on stock' when stock_delta < 0 then 'Stock deduction' else 'Stock correction' end);
  movement_notes := nullif(current_setting('furgo.stock.notes', true), '');
  movement_order := nullif(current_setting('furgo.stock.order_number', true), '');
  order_id := nullif(current_setting('furgo.stock.order_id', true), '');
  if movement_order is null and order_id is not null then
    select orders.reference into related_order from public.marketplace_orders orders where orders.id = order_id;
    movement_order := related_order;
  end if;

  insert into public.warehouse_inventory_stock_history (
    warehouse_product_id, lot_id, store_user_id, product_name, sku, variant, batch_number,
    quantity_delta, quantity_before, quantity_after, reason, order_number, notes, created_by
  ) values (
    case when tg_op = 'DELETE' then old.warehouse_product_id else new.warehouse_product_id end,
    case when tg_op = 'DELETE' then null else new.id end,
    owner_user,
    case when tg_op = 'DELETE' then old.product_name else new.product_name end,
    case when tg_op = 'DELETE' then old.sku else new.sku end,
    coalesce(case when tg_op = 'DELETE' then old.variant else new.variant end, 'Standard'),
    case when tg_op = 'DELETE' then old.batch_number else new.batch_number end,
    stock_delta, before_quantity, after_quantity, movement_reason,
    movement_order,
    coalesce(movement_notes, case when tg_op = 'INSERT' then (case when tg_op = 'DELETE' then old.notes else new.notes end) end),
    actor_user
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists warehouse_inventory_stock_history_insert on public.warehouse_inventory_lots;
drop trigger if exists warehouse_inventory_stock_history_update on public.warehouse_inventory_lots;
drop trigger if exists warehouse_inventory_stock_history_delete on public.warehouse_inventory_lots;
create trigger warehouse_inventory_stock_history_insert
after insert on public.warehouse_inventory_lots
for each row execute function public.record_warehouse_inventory_stock_history();
create trigger warehouse_inventory_stock_history_update
after update of quantity on public.warehouse_inventory_lots
for each row execute function public.record_warehouse_inventory_stock_history();
create trigger warehouse_inventory_stock_history_delete
after delete on public.warehouse_inventory_lots
for each row execute function public.record_warehouse_inventory_stock_history();

create or replace function public.adjust_warehouse_inventory_lot(
  p_lot_id uuid,
  p_quantity integer,
  p_reason text,
  p_order_number text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  stock_lot public.warehouse_inventory_lots;
begin
  if auth.uid() is null then raise exception 'Sign in to adjust stock.'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Enter a quantity of at least one.'; end if;
  if p_reason not in ('Sales', 'Return to supplier', 'Return / refund', 'Clear expired stock', 'Change stock', 'Damaged stock', 'Other') then
    raise exception 'Choose a valid reason for the stock deduction.';
  end if;
  select * into stock_lot from public.warehouse_inventory_lots where id = p_lot_id for update;
  if not found then raise exception 'The stock batch could not be found.'; end if;
  if stock_lot.created_by <> auth.uid() then raise exception 'You can only adjust stock owned by your Store account.'; end if;
  if not exists (select 1 from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid()) then
    raise exception 'Your account does not have Store inventory access.';
  end if;
  if p_quantity > stock_lot.quantity then raise exception 'The deduction cannot exceed the batch stock currently on hand.'; end if;

  perform set_config('furgo.stock.reason', p_reason, true);
  perform set_config('furgo.stock.order_id', '', true);
  perform set_config('furgo.stock.order_number', coalesce(nullif(left(trim(coalesce(p_order_number, '')), 80), ''), ''), true);
  perform set_config('furgo.stock.notes', coalesce(nullif(left(trim(coalesce(p_notes, '')), 500), ''), ''), true);
  update public.warehouse_inventory_lots
  set quantity = quantity - p_quantity,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_lot_id;
  perform set_config('furgo.stock.reason', '', true);
  perform set_config('furgo.stock.order_id', '', true);
  perform set_config('furgo.stock.order_number', '', true);
  perform set_config('furgo.stock.notes', '', true);
end;
$$;
revoke all on function public.adjust_warehouse_inventory_lot(uuid, integer, text, text, text) from public, anon;
grant execute on function public.adjust_warehouse_inventory_lot(uuid, integer, text, text, text) to authenticated;

-- Annotate marketplace deductions with their order reference for the history ledger.
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
  select * into order_row from public.marketplace_orders where id = p_order_id for update;
  if not found then raise exception 'Marketplace order % was not found.', p_order_id; end if;
  if order_row.details ? 'warehouseInventoryReservedAt' and not (order_row.details ? 'warehouseInventoryReleasedAt') then return; end if;
  if lower(coalesce(order_row.details->>'paymentMethod', '')) = 'online payment'
     and lower(coalesce(order_row.payment_status, '')) in ('pending', 'pending payment') then return; end if;
  perform set_config('furgo.stock.reason', 'Marketplace sale', true);
  perform set_config('furgo.stock.order_id', p_order_id, true);
  perform set_config('furgo.stock.order_number', '', true);
  perform set_config('furgo.stock.notes', '', true);

  select data.payload into catalog from public.app_data data
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared';
  if jsonb_typeof(catalog) is distinct from 'array' then raise exception 'Marketplace product catalogue is not available.'; end if;

  for order_line in
    select lines.order_id, lines.line_number, lines.item from public.marketplace_order_items lines
    where lines.order_id = p_order_id order by lines.line_number for update
  loop
    requested := greatest(coalesce(nullif(order_line.item->>'quantity', '')::integer, 0), 0);
    if requested = 0 then continue; end if;
    select entry.value into product from jsonb_array_elements(catalog) entry(value)
    where entry.value->>'id' = order_line.item->>'productId' limit 1;
    if product is null then raise exception 'A product in this order is no longer in the Marketplace catalogue.'; end if;
    select entry.value into variant from jsonb_array_elements(coalesce(product->'variants', '[]'::jsonb)) entry(value)
    where entry.value->>'id' = order_line.item->>'variantId' limit 1;
    if variant is null then raise exception 'A product option in this order is no longer available.'; end if;
    warehouse_id := null;
    begin
      warehouse_id := nullif(coalesce(variant->>'warehouseProductId', product->>'warehouseProductId'), '')::uuid;
    exception when invalid_text_representation then warehouse_id := null;
    end;
    if warehouse_id is null then
      select warehouse.id into warehouse_id from public.warehouse_products warehouse
      where warehouse.marketplace_product_id = product->>'id' limit 1;
    end if;
    if warehouse_id is null then raise exception 'Product % is not linked to Warehouse Stock.', product->>'name'; end if;
    source_variant_id := nullif(variant->>'warehouseVariantId', '');
    source_variant_label := null;
    select source.value->>'label' into source_variant_label
    from public.warehouse_products warehouse
    cross join lateral jsonb_array_elements(coalesce(warehouse.product_data->'variants', '[]'::jsonb)) source(value)
    where warehouse.id = warehouse_id and source.value->>'id' = source_variant_id limit 1;
    source_variant_label := coalesce(source_variant_label, nullif(variant->>'label', ''), 'Standard');
    select coalesce(sum(stock_lot.quantity), 0)::bigint into available
    from public.warehouse_inventory_lots stock_lot
    where stock_lot.warehouse_product_id = warehouse_id and coalesce(stock_lot.variant, 'Standard') = source_variant_label;
    if available < requested then
      raise exception 'Not enough stock for % (%). Available: %, requested: %.', product->>'name', source_variant_label, available, requested;
    end if;
    remaining := requested;
    allocations := '[]'::jsonb;
    for stock_batch in
      select * from public.warehouse_inventory_lots candidate_lot
      where candidate_lot.warehouse_product_id = warehouse_id
        and coalesce(candidate_lot.variant, 'Standard') = source_variant_label and candidate_lot.quantity > 0
      order by candidate_lot.pick_order asc, candidate_lot.expires_on asc nulls last,
               candidate_lot.received_on asc, candidate_lot.created_at asc, candidate_lot.id asc for update
    loop
      exit when remaining <= 0;
      take_quantity := least(remaining, stock_batch.quantity);
      update public.warehouse_inventory_lots target_lot
      set quantity = target_lot.quantity - take_quantity, updated_by = order_row.user_id, updated_at = now()
      where target_lot.id = stock_batch.id;
      allocations := allocations || jsonb_build_array(jsonb_build_object(
        'lot_id', stock_batch.id, 'quantity', take_quantity, 'warehouse_product_id', stock_batch.warehouse_product_id,
        'product_name', stock_batch.product_name, 'sku', stock_batch.sku, 'variant', stock_batch.variant,
        'batch_number', stock_batch.batch_number, 'received_on', stock_batch.received_on, 'expires_on', stock_batch.expires_on,
        'location', stock_batch.location, 'notes', stock_batch.notes, 'created_by', stock_batch.created_by, 'pick_order', stock_batch.pick_order
      ));
      remaining := remaining - take_quantity;
    end loop;
    if remaining > 0 then raise exception 'Stock changed while this order was being placed. Please refresh the Marketplace and try again.'; end if;
    update public.marketplace_order_items lines
    set item = (lines.item - 'warehouseStockAllocations') || jsonb_build_object('warehouseStockAllocations', allocations)
    where lines.order_id = p_order_id and lines.line_number = order_line.line_number;
  end loop;
  update public.marketplace_orders orders
  set details = (coalesce(orders.details, '{}'::jsonb) - 'warehouseInventoryReleasedAt') || jsonb_build_object('warehouseInventoryReservedAt', now()),
      updated_at = now()
  where orders.id = p_order_id;
  perform set_config('furgo.stock.reason', '', true);
  perform set_config('furgo.stock.order_id', '', true);
end;
$$;
revoke all on function public.reserve_marketplace_order_inventory(text) from public, anon, authenticated;

-- Restored allocations are logged as returns/refunds, including their order reference.
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
  perform set_config('furgo.stock.reason', 'Return / refund', true);
  perform set_config('furgo.stock.order_id', p_order_id, true);
  perform set_config('furgo.stock.order_number', '', true);
  perform set_config('furgo.stock.notes', '', true);
  for order_line in
    select lines.order_id, lines.line_number, lines.item from public.marketplace_order_items lines
    where lines.order_id = p_order_id order by lines.line_number for update
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
          existing_lot, nullif(allocation->>'warehouse_product_id', '')::uuid,
          coalesce(allocation->>'product_name', 'Restored Marketplace stock'), allocation->>'sku', allocation->>'variant',
          allocation->>'batch_number', coalesce(nullif(allocation->>'quantity', '')::integer, 0),
          coalesce(nullif(allocation->>'received_on', '')::date, current_date), nullif(allocation->>'expires_on', '')::date,
          allocation->>'location', allocation->>'notes', coalesce(nullif(allocation->>'created_by', '')::uuid, order_row.user_id),
          coalesce(nullif(allocation->>'created_by', '')::uuid, order_row.user_id), coalesce(nullif(allocation->>'pick_order', '')::integer, 0)
        );
      end if;
    end loop;
  end loop;
  update public.marketplace_orders orders
  set details = coalesce(orders.details, '{}'::jsonb) || jsonb_build_object('warehouseInventoryReleasedAt', now()), updated_at = now()
  where orders.id = p_order_id;
  perform set_config('furgo.stock.reason', '', true);
  perform set_config('furgo.stock.order_id', '', true);
end;
$$;
revoke all on function public.release_marketplace_order_inventory(text) from public, anon, authenticated;
