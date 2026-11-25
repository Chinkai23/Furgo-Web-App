-- Serialize warehouse work before taking product, batch, submission or catalog locks.
-- Checkout already takes this lock after its own order lock. Warehouse operations
-- inspect order references without taking order row locks.
create function public.lock_warehouse_inventory()
returns void language sql volatile set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('furgo marketplace warehouse allocations', 0));
$$;
revoke all on function public.lock_warehouse_inventory() from public, anon, authenticated;

create table public.warehouse_stock_requests (
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  operation text not null check (operation in ('receive', 'adjust')),
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, request_id)
);
alter table public.warehouse_stock_requests enable row level security;
revoke all on public.warehouse_stock_requests from public, anon, authenticated;

create function public.warehouse_stock_request_result(p_request_id uuid, p_operation text, p_request jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  saved public.warehouse_stock_requests;
begin
  if auth.uid() is null or p_request_id is null then
    raise exception 'Sign in and provide a stock request ID.' using errcode = 'PT403';
  end if;
  perform public.lock_warehouse_inventory();
  select * into saved from public.warehouse_stock_requests
  where actor_id = auth.uid() and request_id = p_request_id;
  if not found then return null; end if;
  if saved.operation <> p_operation or saved.request is distinct from p_request then
    raise exception 'This request ID belongs to a different stock movement.' using errcode = 'PT409';
  end if;
  return saved.result;
end;
$$;
revoke all on function public.warehouse_stock_request_result(uuid,text,jsonb) from public, anon, authenticated;

create function public.warehouse_variant_key(p_variant jsonb)
returns text language sql immutable set search_path = '' as $$
  select case when nullif(p_variant->>'id', '') is not null then 'id:' || (p_variant->>'id')
    else 'label:' || coalesce(nullif(p_variant->>'label', ''), 'Standard') end;
$$;
revoke all on function public.warehouse_variant_key(jsonb) from public, anon, authenticated;

create function public.warehouse_owners_share_store(p_first uuid, p_second uuid)
returns boolean language sql stable set search_path = '' as $$
  select p_first is not null and p_second is not null and (p_first = p_second or exists (
    select from public.marketplace_store_account_history first_account
    join public.marketplace_store_account_history second_account using (store_id)
    where first_account.user_id = p_first and second_account.user_id = p_second
      and first_account.removed_at is null and second_account.removed_at is null
  ) or exists (
    select from public.marketplace_supplier_access first_account
    join public.marketplace_supplier_access second_account
      on lower(btrim(first_account.supplier_name)) = lower(btrim(second_account.supplier_name))
    where first_account.supplier_user_id = p_first and second_account.supplier_user_id = p_second
  ));
$$;

create function public.warehouse_can_access_batch(p_owner uuid, p_product uuid)
returns boolean language sql stable set search_path = '' as $$
  select public.marketplace_store_can_access_owner(p_owner) and (
    p_product is null or exists (select from public.warehouse_products product where product.id = p_product
      and public.marketplace_store_can_access_owner(product.created_by))
  );
$$;
revoke all on function public.warehouse_owners_share_store(uuid,uuid),
  public.warehouse_can_access_batch(uuid,uuid) from public, anon, authenticated;

create function public.receive_warehouse_inventory_lot(p_request_id uuid, p_lot jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  result jsonb;
  product public.warehouse_products;
  batch public.warehouse_inventory_lots;
  owner_id uuid;
  variant_key text;
  variants jsonb;
  matched_variants jsonb;
  received date;
  units integer;
begin
  result := public.warehouse_stock_request_result(p_request_id, 'receive', p_lot);
  if result is not null then return result; end if;
  owner_id := coalesce(nullif(p_lot->>'created_by', '')::uuid, actor);
  select * into product from public.warehouse_products where id = (p_lot->>'warehouse_product_id')::uuid;
  if not found or not public.marketplace_store_can_access_owner(product.created_by)
    or not public.marketplace_store_can_access_owner(owner_id)
    or (owner_id <> actor and public.current_portal_level(actor) < 3) then
    raise exception 'This warehouse product is not available to your Store.' using errcode = 'PT403';
  end if;
  if not public.warehouse_owners_share_store(owner_id, product.created_by)
    and not (owner_id = actor and public.current_portal_level(actor) >= 3) then
    raise exception 'Choose an owner in the warehouse product’s Store.' using errcode = 'PT403';
  end if;

  units := (p_lot->>'quantity')::integer;
  received := (p_lot->>'received_on')::date;
  if units is null or units < 1 or received is null then
    raise exception 'Enter a positive quantity and a received date.' using errcode = 'PT422';
  end if;
  variants := product.product_data->'variants';
  if jsonb_typeof(variants) is distinct from 'array' or variants = '[]'::jsonb then
    variants := case when p_lot->>'variant_id' = 'standard' then '[{"id":"standard","label":"Standard"}]'::jsonb
      else '[{"label":"Standard"}]'::jsonb end;
  end if;
  variant_key := case when nullif(p_lot->>'variant_id', '') is not null then 'id:' || (p_lot->>'variant_id')
    else 'label:' || coalesce(nullif(p_lot->>'variant', ''), 'Standard') end;
  select jsonb_agg(value) into matched_variants from jsonb_array_elements(variants)
  where public.warehouse_variant_key(value) = variant_key;
  if coalesce(jsonb_array_length(matched_variants), 0) <> 1 or (
    select count(*) from jsonb_array_elements(variants) variant
    where coalesce(nullif(variant->>'label', ''), 'Standard') =
      coalesce(nullif(matched_variants->0->>'label', ''), 'Standard')
  ) <> 1 then
    raise exception 'The warehouse option changed. Refresh and select it again.' using errcode = 'PT409';
  end if;
  insert into public.warehouse_inventory_lots (
    warehouse_product_id, product_name, sku, variant, batch_number, quantity, received_on,
    expires_on, location, notes, created_by, updated_by
  ) values (
    product.id, product.name,
    coalesce(nullif(matched_variants->0->>'sku', ''), nullif(product.product_data->>'productCode', '')),
    coalesce(nullif(matched_variants->0->>'label', ''), 'Standard'),
    upper(to_char(received, 'DDMonYY')), units, received,
    nullif(p_lot->>'expires_on', '')::date, nullif(btrim(p_lot->>'location'), ''),
    nullif(btrim(p_lot->>'notes'), ''), owner_id, actor
  ) returning * into batch;
  result := jsonb_build_object('lot_id', batch.id, 'quantity', batch.quantity);
  insert into public.warehouse_stock_requests(actor_id, request_id, operation, request, result)
  values (actor, p_request_id, 'receive', p_lot, result);
  return result;
end;
$$;

create function public.adjust_warehouse_inventory_lot(
  p_lot_id uuid, p_quantity integer, p_reason text, p_notes text, p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  batch public.warehouse_inventory_lots;
  request_data jsonb := jsonb_build_object('lot_id', p_lot_id, 'quantity', p_quantity,
    'reason', p_reason, 'notes', p_notes);
  result jsonb;
begin
  result := public.warehouse_stock_request_result(p_request_id, 'adjust', request_data);
  if result is not null then return result; end if;
  if p_quantity is null or p_quantity < 1 or p_reason is null or p_reason not in
    ('Return to supplier', 'Clear expired stock', 'Damaged / lost stock', 'Stock correction', 'Other') then
    raise exception 'Enter a valid quantity and stock adjustment reason.' using errcode = 'PT422';
  end if;
  select * into batch from public.warehouse_inventory_lots where id = p_lot_id for update;
  if not found or not public.warehouse_can_access_batch(batch.created_by, batch.warehouse_product_id) then
    raise exception 'This batch is not in your Store warehouse.' using errcode = 'PT403';
  end if;
  if p_quantity > batch.quantity then
    raise exception 'The deduction exceeds the batch stock currently on hand.' using errcode = 'PT409';
  end if;
  perform set_config('furgo.stock.reason', p_reason, true);
  perform set_config('furgo.stock.notes', left(btrim(coalesce(p_notes, '')), 500), true);
  perform set_config('furgo.stock.order_id', '', true);
  perform set_config('furgo.stock.order_number', '', true);
  update public.warehouse_inventory_lots
  set quantity = quantity - p_quantity, updated_by = actor, updated_at = now() where id = p_lot_id;
  perform set_config('furgo.stock.reason', '', true);
  perform set_config('furgo.stock.notes', '', true);
  result := jsonb_build_object('lot_id', p_lot_id,
    'quantity_before', batch.quantity, 'quantity_after', batch.quantity - p_quantity);
  insert into public.warehouse_stock_requests(actor_id, request_id, operation, request, result)
  values (actor, p_request_id, 'adjust', request_data, result);
  return result;
end;
$$;

-- Preserve the legacy signature. Its previously ignored reference can carry
-- a request UUID for callers migrating to the request-aware contract.
create or replace function public.adjust_warehouse_inventory_lot(
  p_lot_id uuid, p_quantity integer, p_reason text, p_order_number text default null, p_notes text default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_order_number is null or p_order_number !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
    raise exception 'Reload the Store Portal before adjusting stock. A stock request ID is required.' using errcode = 'PT409';
  end if;
  perform public.adjust_warehouse_inventory_lot(p_lot_id, p_quantity, p_reason, p_notes, p_order_number::uuid);
end;
$$;
revoke all on function public.receive_warehouse_inventory_lot(uuid,jsonb),
  public.adjust_warehouse_inventory_lot(uuid,integer,text,text,uuid) from public, anon;
grant execute on function public.receive_warehouse_inventory_lot(uuid,jsonb),
  public.adjust_warehouse_inventory_lot(uuid,integer,text,text,uuid) to authenticated;

revoke insert, update, delete on public.warehouse_inventory_lots, public.warehouse_products,
  public.marketplace_product_submissions
  from public, anon, authenticated;
create policy "Marketplace catalog changes use RPCs" on public.app_data
  as restrictive for update to authenticated
  using (record_id <> 'shared:furgo-demo-marketplace-products:shared' and storage_key <> 'furgo-demo-marketplace-products')
  with check (record_id <> 'shared:furgo-demo-marketplace-products:shared' and storage_key <> 'furgo-demo-marketplace-products');
create policy "Marketplace catalog creation uses RPCs" on public.app_data
  as restrictive for insert to authenticated
  with check (record_id <> 'shared:furgo-demo-marketplace-products:shared' and storage_key <> 'furgo-demo-marketplace-products');
create policy "Marketplace catalog removal uses RPCs" on public.app_data
  as restrictive for delete to authenticated
  using (record_id <> 'shared:furgo-demo-marketplace-products:shared' and storage_key <> 'furgo-demo-marketplace-products');

create function public.warehouse_has_active_references(
  p_product uuid, p_lot uuid default null, p_label text default null,
  p_listing text default null, p_variant text default null
)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select from public.marketplace_order_items line
    join public.marketplace_orders orders on orders.id = line.order_id
    where (
      (p_lot is null and p_listing is not null and line.item->>'productId' = p_listing
        and (p_variant is null or line.item->>'variantId' = p_variant))
      or exists (
        select from jsonb_array_elements(case when jsonb_typeof(line.item->'warehouseStockAllocations') = 'array'
          then line.item->'warehouseStockAllocations' else '[]'::jsonb end) allocation
        where (p_lot is not null and allocation->>'lot_id' = p_lot::text)
          or (p_lot is null and allocation->>'warehouse_product_id' = p_product::text and
            (p_label is null or coalesce(allocation->>'variant', 'Standard') = p_label
              or exists (select from public.warehouse_inventory_lots lot
                where lot.id::text = allocation->>'lot_id' and coalesce(lot.variant, 'Standard') = p_label)))
      )
    ) and (
      lower(btrim(orders.status)) not in ('completed', 'delivered', 'cancelled')
      or (orders.details ? 'warehouseInventoryReservedAt' and not orders.details ? 'warehouseInventoryReleasedAt'
        and lower(btrim(orders.status)) not in ('completed', 'delivered'))
      or lower(coalesce(orders.details->>'refundStatus', '')) = 'refund processing'
      or exists (
        select from public.marketplace_item_returns item_return
        where item_return.order_id = line.order_id and item_return.line_number = line.line_number
          and item_return.status not in ('Refunded', 'Rejected')
      )
    )
  );
$$;
revoke all on function public.warehouse_has_active_references(uuid,uuid,text,text,text) from public, anon, authenticated;

create function public.guard_warehouse_physical_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'warehouse_inventory_lots' then
    if old.quantity <> 0 then
      raise exception 'Reduce stock to zero with an adjustment before deleting the batch.' using errcode = 'PT409';
    end if;
    if public.warehouse_has_active_references(old.warehouse_product_id, old.id) then
      raise exception 'This batch is still referenced by an active order or return.' using errcode = 'PT409';
    end if;
  else
    if exists (select from public.warehouse_inventory_lots where warehouse_product_id = old.id and quantity <> 0)
      or public.warehouse_has_active_references(old.id, p_listing => old.marketplace_product_id) then
      raise exception 'This product still has stock or is referenced by an active order or return.' using errcode = 'PT409';
    end if;
    if exists (select from public.marketplace_seller_product_submissions request
        where request.warehouse_product_id = old.id and request.status in ('Pending Review', 'In Waiting List'))
      or exists (select from public.marketplace_seller_products mapping
        join public.marketplace_seller_restocks restock on restock.seller_product_id = mapping.id
        where mapping.warehouse_product_id = old.id) then
      raise exception 'This product is referenced by a Seller request or stock history.' using errcode = 'PT409';
    end if;
  end if;
  return old;
end;
$$;
revoke all on function public.guard_warehouse_physical_delete() from public, anon, authenticated;
create trigger warehouse_lot_guard_delete before delete on public.warehouse_inventory_lots
for each row execute function public.guard_warehouse_physical_delete();
create trigger warehouse_product_guard_delete before delete on public.warehouse_products
for each row execute function public.guard_warehouse_physical_delete();

create function public.delete_warehouse_inventory_lot(p_lot_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_warehouse_inventory();
  delete from public.warehouse_inventory_lots where id = p_lot_id
    and public.warehouse_can_access_batch(created_by, warehouse_product_id);
  if not found then raise exception 'This batch is not in your Store warehouse.' using errcode = 'PT403'; end if;
end;
$$;

create function public.update_warehouse_inventory_lot(p_lot_id uuid, p_expected jsonb, p_fields jsonb)
returns public.warehouse_inventory_lots language plpgsql security definer set search_path = '' as $$
declare
  batch public.warehouse_inventory_lots;
  next_fields jsonb;
  received date;
begin
  perform public.lock_warehouse_inventory();
  select * into batch from public.warehouse_inventory_lots where id = p_lot_id for update;
  if not found or not public.warehouse_can_access_batch(batch.created_by, batch.warehouse_product_id) then
    raise exception 'This batch is not in your Store warehouse.' using errcode = 'PT403';
  end if;
  next_fields := public.merge_warehouse_fields(to_jsonb(batch), p_expected, p_fields,
    array['received_on','expires_on','location','notes']);
  received := (next_fields->>'received_on')::date;
  update public.warehouse_inventory_lots
  set received_on = received, expires_on = (next_fields->>'expires_on')::date,
    location = next_fields->>'location', notes = next_fields->>'notes',
    batch_number = case when received is distinct from batch.received_on then upper(to_char(received, 'DDMonYY'))
      else batch.batch_number end,
    updated_by = auth.uid(), updated_at = now()
  where id = p_lot_id returning * into batch;
  return batch;
end;
$$;
revoke all on function public.delete_warehouse_inventory_lot(uuid),
  public.update_warehouse_inventory_lot(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.delete_warehouse_inventory_lot(uuid),
  public.update_warehouse_inventory_lot(uuid,jsonb,jsonb) to authenticated;

-- Compare only fields the editor changed. JSON null and an absent legacy field
-- are equivalent, and retrying a patch that already landed is safe.
create function public.merge_warehouse_fields(p_current jsonb, p_expected jsonb, p_desired jsonb, p_allowed text[])
returns jsonb language plpgsql set search_path = '' as $$
declare
  field text;
  before_value jsonb;
  current_value jsonb;
begin
  if jsonb_typeof(p_expected) is distinct from 'object' or jsonb_typeof(p_desired) is distinct from 'object' then
    raise exception 'Refresh the record before saving changes.' using errcode = 'PT409';
  end if;
  for field in select jsonb_object_keys(p_desired) loop
    if not (field = any(p_allowed)) then continue; end if;
    before_value := coalesce(p_expected->field, 'null'::jsonb);
    if before_value = p_desired->field
      or (before_value = 'null'::jsonb and p_desired->field in ('""'::jsonb, '[]'::jsonb)) then continue; end if;
    current_value := coalesce(p_current->field, 'null'::jsonb);
    if current_value <> before_value and current_value <> p_desired->field then
      raise exception 'The % field changed. Refresh and review your edit.', field using errcode = 'PT409';
    end if;
    p_current := jsonb_set(p_current, array[field], p_desired->field, true);
  end loop;
  return p_current;
end;
$$;

create function public.warehouse_variant_map(p_variants jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  variant jsonb;
  key text;
  variants jsonb := '{}'::jsonb;
begin
  if p_variants is null or p_variants = 'null'::jsonb then return variants; end if;
  if jsonb_typeof(p_variants) <> 'array' then
    raise exception 'The product options could not be read.' using errcode = 'PT409';
  end if;
  for variant in select value from jsonb_array_elements(p_variants) loop
    key := public.warehouse_variant_key(variant);
    if jsonb_typeof(variant) <> 'object' or variants ? key then
      raise exception 'Product options have ambiguous identities. Refresh and review them.' using errcode = 'PT409';
    end if;
    variants := variants || jsonb_build_object(key, variant);
  end loop;
  return variants;
end;
$$;

create function public.merge_warehouse_product(
  p_current jsonb, p_expected jsonb, p_desired jsonb, p_product_fields text[], p_variant_fields text[]
)
returns jsonb language plpgsql set search_path = '' as $$
declare
  expected_variants jsonb;
  desired_variants jsonb;
  current_variants jsonb;
  current_variant jsonb;
  expected_variant jsonb;
  desired_variant jsonb;
  variant_key text;
  ordered jsonb;
begin
  p_current := public.merge_warehouse_fields(p_current, p_expected, p_desired, p_product_fields);
  if not p_desired ? 'variants' then return p_current; end if;
  expected_variants := public.warehouse_variant_map(p_expected->'variants');
  desired_variants := public.warehouse_variant_map(p_desired->'variants');
  current_variants := public.warehouse_variant_map(p_current->'variants');

  for variant_key, expected_variant in select key, value from jsonb_each(expected_variants) loop
    current_variant := current_variants->variant_key;
    desired_variant := desired_variants->variant_key;
    if desired_variant is null then
      if current_variant is not null and (current_variant - 'stock') is distinct from (expected_variant - 'stock') then
        raise exception 'An option changed before removal. Refresh and review your edit.' using errcode = 'PT409';
      end if;
      current_variants := current_variants - variant_key;
    elsif current_variant is null then
      if exists (select from unnest(p_variant_fields) field
        where coalesce(expected_variant->field, 'null'::jsonb) is distinct from coalesce(desired_variant->field, expected_variant->field, 'null'::jsonb)) then
        raise exception 'An edited option has been removed. Refresh and review your edit.' using errcode = 'PT409';
      end if;
    else
      current_variants := jsonb_set(current_variants, array[variant_key],
        public.merge_warehouse_fields(current_variant, expected_variant, desired_variant, p_variant_fields), true);
    end if;
  end loop;

  for variant_key, desired_variant in select key, value from jsonb_each(desired_variants) loop
    if expected_variants ? variant_key then continue; end if;
    if not current_variants ? variant_key then
      select jsonb_object_agg(key, value) into current_variant from jsonb_each(desired_variant)
      where key = 'id' or key = any(p_variant_fields);
      current_variants := current_variants || jsonb_build_object(variant_key, current_variant);
    else
      perform public.merge_warehouse_fields(current_variants->variant_key, '{}'::jsonb, desired_variant, p_variant_fields);
    end if;
  end loop;

  select coalesce(jsonb_agg(current_variants->entries.key order by entries.priority, entries.position), '[]'::jsonb)
  into ordered from (
    select distinct on (keys.key) keys.* from (
      select public.warehouse_variant_key(value) as key, 0 as priority, ordinality as position
      from jsonb_array_elements(coalesce(p_current->'variants', '[]'::jsonb)) with ordinality
      union all
      select public.warehouse_variant_key(value), 1, ordinality
      from jsonb_array_elements(p_desired->'variants') with ordinality
    ) keys order by keys.key, keys.priority, keys.position
  ) entries where current_variants ? entries.key;
  return jsonb_set(p_current, '{variants}', ordered, true);
end;
$$;
revoke all on function public.merge_warehouse_fields(jsonb,jsonb,jsonb,text[]),
  public.warehouse_variant_map(jsonb), public.merge_warehouse_product(jsonb,jsonb,jsonb,text[],text[])
  from public, anon, authenticated;

create function public.create_warehouse_product(
  p_name text, p_product_data jsonb, p_owner uuid, p_product_id uuid default gen_random_uuid()
)
returns public.warehouse_products language plpgsql security definer set search_path = '' as $$
declare
  product public.warehouse_products;
begin
  perform public.lock_warehouse_inventory();
  if auth.uid() is null or not public.marketplace_store_can_access_owner(p_owner)
    or (p_owner <> auth.uid() and public.current_portal_level(auth.uid()) < 3) then
    raise exception 'This warehouse is not available to your Store.' using errcode = 'PT403';
  end if;
  perform public.warehouse_variant_map(p_product_data->'variants');
  if (select count(*) <> count(distinct lower(btrim(coalesce(value->>'label', 'Standard'))))
    from jsonb_array_elements(coalesce(p_product_data->'variants', '[]'::jsonb))) then
    raise exception 'Each warehouse option needs a distinct label.' using errcode = 'PT422';
  end if;
  select * into product from public.warehouse_products where id = p_product_id;
  if found then
    if product.created_by is distinct from p_owner or product.updated_by is distinct from auth.uid()
      or product.name is distinct from p_name or product.product_data is distinct from p_product_data then
      raise exception 'This product creation request already exists. Refresh Warehouse Stock.' using errcode = 'PT409';
    end if;
    return product;
  end if;
  insert into public.warehouse_products(id, name, product_data, created_by, updated_by)
  values (p_product_id, p_name, p_product_data, p_owner, auth.uid()) returning * into product;
  return product;
end;
$$;

create function public.update_warehouse_product(p_product_id uuid, p_expected jsonb, p_desired jsonb)
returns public.warehouse_products language plpgsql security definer set search_path = '' as $$
declare
  product public.warehouse_products;
  next_product jsonb;
  current_data jsonb;
begin
  perform public.lock_warehouse_inventory();
  select * into product from public.warehouse_products where id = p_product_id for update;
  if not found or not public.marketplace_store_can_access_owner(product.created_by) then
    raise exception 'This product is not available to your Store.' using errcode = 'PT403';
  end if;
  current_data := product.product_data || jsonb_build_object('name', product.name);
  if public.warehouse_variant_map(current_data->'variants') = '{}'::jsonb
    and p_expected->'variants'->0->>'id' = 'standard' and p_expected->'variants'->0->>'label' = 'Standard' then
    current_data := jsonb_set(current_data, '{variants}', jsonb_build_array(jsonb_build_object(
      'id','standard','label','Standard','price',0,'sku',coalesce(product.product_data->>'productCode',''))));
  end if;
  next_product := public.merge_warehouse_product(current_data, p_expected, p_desired,
    array['name','category','description','petTypes','suitableBreeds','issues','ingredients','nutrition','images','productCode'],
    array['option','variant','label','price','sku','imageUrl','lowStockThreshold','lowStockAlertEnabled']);
  update public.warehouse_products
  set name = next_product->>'name',
    product_data = case when product.product_data ? 'name' then next_product else next_product - 'name' end,
    updated_by = auth.uid(), updated_at = now()
  where id = p_product_id returning * into product;
  return product;
end;
$$;
revoke all on function public.create_warehouse_product(text,jsonb,uuid,uuid),
  public.update_warehouse_product(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.create_warehouse_product(text,jsonb,uuid,uuid),
  public.update_warehouse_product(uuid,jsonb,jsonb) to authenticated;

-- Renaming a Marketplace label must keep its warehouse stock identity. Capture
-- a stable source ID for older options that were linked by label only.
create function public.preserve_marketplace_variant_stock_source(p_listing jsonb, p_old jsonb, p_new jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  warehouse public.warehouse_products;
  source_id text;
  matches text[];
begin
  if p_old->>'label' is not distinct from p_new->>'label' then return p_new; end if;
  source_id := coalesce(nullif(p_old->>'warehouseProductId', ''), nullif(p_listing->>'warehouseProductId', ''));
  select * into warehouse from public.warehouse_products
  where case when source_id is not null then id::text = source_id else marketplace_product_id = p_listing->>'id' end;
  if not found then return p_new; end if;
  select array_agg(value->>'id') into matches
  from jsonb_array_elements(coalesce(warehouse.product_data->'variants', '[]'::jsonb))
  where case when nullif(p_old->>'warehouseVariantId', '') is not null then value->>'id' = p_old->>'warehouseVariantId'
    else coalesce(value->>'label', 'Standard') = coalesce(p_old->>'label', 'Standard') end;
  if coalesce(cardinality(matches), 0) <> 1 or nullif(matches[1], '') is null then
    raise exception 'The option has no unique warehouse stock identity. Review its label in Warehouse Stock.' using errcode = 'PT409';
  end if;
  return p_new || jsonb_build_object('warehouseProductId', warehouse.id, 'warehouseVariantId', matches[1]);
end;
$$;
revoke all on function public.preserve_marketplace_variant_stock_source(jsonb,jsonb,jsonb) from public, anon, authenticated;

create function public.admin_update_marketplace_product_fields(
  p_product_id text, p_variant_id text, p_expected_product jsonb, p_product_fields jsonb, p_variant_fields jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  catalog jsonb;
  current_product jsonb;
  next_product jsonb;
  variant_key text := p_variant_id;
  current_variant jsonb;
  expected_variant jsonb;
  result jsonb;
begin
  if public.current_portal_level(auth.uid()) < 1
    or (public.has_role(auth.uid(), 'staff') and not
      public.admin_app_data_outlet_allowed('shared', 'furgo-demo-marketplace-products', '[]'::jsonb)) then
    raise exception 'This catalog is outside your editing permissions.' using errcode = 'PT403';
  end if;
  perform public.lock_warehouse_inventory();
  select payload into catalog from public.app_data where record_id = 'shared:furgo-demo-marketplace-products:shared' for update;
  if (select count(*) from jsonb_array_elements(catalog) where value->>'id' = p_product_id) <> 1 then
    raise exception 'The Marketplace product changed. Refresh and review your edit.' using errcode = 'PT409';
  end if;
  select value into current_product from jsonb_array_elements(catalog) where value->>'id' = p_product_id;
  if not starts_with(variant_key, 'label:') and not starts_with(variant_key, 'id:') then
    variant_key := 'id:' || variant_key;
  end if;
  current_variant := public.warehouse_variant_map(current_product->'variants')->variant_key;
  expected_variant := public.warehouse_variant_map(p_expected_product->'variants')->variant_key;
  if current_variant is null or expected_variant is null then
    raise exception 'The Marketplace option changed. Refresh and review your edit.' using errcode = 'PT409';
  end if;
  next_product := public.merge_warehouse_fields(current_product, p_expected_product, p_product_fields,
    array['name','category','description','petTypes','suitableBreeds','issues','extraDescription','ingredients','nutrition','images']);
  current_variant := public.preserve_marketplace_variant_stock_source(current_product, current_variant,
    public.merge_warehouse_fields(current_variant, expected_variant, p_variant_fields,
      array['label','supplierId','supplier','price','cost','sku','supplierSku']));
  if p_variant_fields ? 'price' and coalesce(current_variant->>'price', '') !~ '^[0-9]+([.][0-9]{1,2})?$'
    or p_variant_fields ? 'cost' and coalesce(current_variant->>'cost', '') !~ '^[0-9]+([.][0-9]{1,2})?$' then
    raise exception 'Enter a valid option price and cost.' using errcode = 'PT422';
  end if;
  if coalesce(nullif(current_variant->>'warehouseProductId', ''), nullif(current_product->>'warehouseProductId', '')) is null
    and not exists (select from public.warehouse_products where marketplace_product_id = p_product_id) and p_variant_fields ? 'stock' then
    if coalesce(p_variant_fields->>'stock', '') !~ '^[0-9]+$' then
      raise exception 'Enter a whole number of units.' using errcode = 'PT422';
    end if;
    current_variant := public.merge_warehouse_fields(current_variant, expected_variant, p_variant_fields, array['stock']);
  end if;
  select jsonb_set(next_product, '{variants}', jsonb_agg(
    case when public.warehouse_variant_key(value) = variant_key then current_variant else value end order by ordinality))
  into next_product from jsonb_array_elements(next_product->'variants') with ordinality;
  update public.app_data set payload = (
    select jsonb_agg(case when value->>'id' = p_product_id then next_product else value end order by ordinality)
    from jsonb_array_elements(catalog) with ordinality
  ), updated_at = now() where record_id = 'shared:furgo-demo-marketplace-products:shared'
  returning payload into result;
  return result;
end;
$$;
revoke all on function public.admin_update_marketplace_product_fields(text,text,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.admin_update_marketplace_product_fields(text,text,jsonb,jsonb,jsonb) to authenticated;

-- Keep existing catalog and warehouse identifiers. Stock batches use labels,
-- so a rename moves all affected lots in one statement, including label swaps.
create or replace function public.sync_marketplace_details_from_warehouse()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_variants jsonb := public.warehouse_variant_map(old.product_data->'variants');
  new_variants jsonb := public.warehouse_variant_map(new.product_data->'variants');
  old_variant jsonb;
  new_variant jsonb;
  variant_key text;
  from_label text;
  to_label text;
  renames jsonb := '{}'::jsonb;
  catalog jsonb;
  listing jsonb;
  original_listing jsonb;
  listing_variant jsonb;
  next_variant jsonb;
  next_variants jsonb := '[]'::jsonb;
  linked_keys text[] := array[]::text[];
  supplier_name text;
  field text;
  variant_fields text[] := array['option','variant','label','price','sku','imageUrl'];
  product_fields text[] := array['category','description','petTypes','suitableBreeds','issues','ingredients','nutrition','images','productCode'];
  matches text[];
begin
  if new.product_data = old.product_data and new.name = old.name then return new; end if;
  if (select count(*) <> count(distinct lower(btrim(coalesce(value->>'label', 'Standard'))))
    from jsonb_each(new_variants)) then
    raise exception 'Each warehouse option needs a distinct label.' using errcode = 'PT409';
  end if;

  for variant_key, old_variant in select key, value from jsonb_each(old_variants) loop
    from_label := coalesce(nullif(old_variant->>'label', ''), 'Standard');
    new_variant := new_variants->variant_key;
    if new_variant is null then
      if exists (select from public.warehouse_inventory_lots lot where lot.warehouse_product_id = new.id
        and coalesce(lot.variant, 'Standard') = from_label and lot.quantity > 0)
        or public.warehouse_has_active_references(new.id, p_label => from_label) then
        raise exception 'An option with stock or an active allocation cannot be removed.' using errcode = 'PT409';
      end if;
    else
      to_label := coalesce(nullif(new_variant->>'label', ''), 'Standard');
      if from_label <> to_label then renames := renames || jsonb_build_object(from_label, to_label); end if;
    end if;
  end loop;
  if renames <> '{}'::jsonb then
    if (select count(*) <> count(distinct coalesce(value->>'label', 'Standard')) from jsonb_each(old_variants)) then
      raise exception 'Existing batch labels are ambiguous. Review the warehouse options.' using errcode = 'PT409';
    end if;
    update public.warehouse_inventory_lots lot
    set variant = renames->>coalesce(lot.variant, 'Standard'), updated_at = now()
    where lot.warehouse_product_id = new.id and renames ? coalesce(lot.variant, 'Standard');
  end if;

  if new.marketplace_product_id is null then return new; end if;
  select payload into catalog from public.app_data where record_id = 'shared:furgo-demo-marketplace-products:shared' for update;
  select value into listing from jsonb_array_elements(catalog) where value->>'id' = new.marketplace_product_id;
  if listing is null then return new; end if;
  original_listing := listing;
  select access.supplier_name into supplier_name from public.marketplace_supplier_access access
  where access.supplier_user_id = new.created_by;

  for listing_variant in select value from jsonb_array_elements(coalesce(listing->'variants', '[]'::jsonb)) loop
    variant_key := null;
    if nullif(listing_variant->>'warehouseVariantId', '') is not null then
      if coalesce(nullif(listing_variant->>'warehouseProductId', ''), new.id::text) = new.id::text then
        variant_key := 'id:' || (listing_variant->>'warehouseVariantId');
      end if;
    elsif coalesce(nullif(listing_variant->>'warehouseProductId', ''), new.id::text) = new.id::text
      and (lower(coalesce(listing_variant->>'supplierId', listing_variant->>'supplier', '')) = lower(coalesce(supplier_name, ''))
        or nullif(coalesce(listing_variant->>'supplierId', listing_variant->>'supplier', ''), '') is null) then
      select array_agg(key) into matches from jsonb_each(old_variants)
      where coalesce(value->>'label', 'Standard') = coalesce(listing_variant->>'label', 'Standard');
      if cardinality(matches) > 1 then
        raise exception 'The linked Marketplace option is ambiguous.' using errcode = 'PT409';
      end if;
      variant_key := matches[1];
    end if;
    if old_variants = '{}'::jsonb and new_variants ? 'id:standard'
      and coalesce(listing_variant->>'label', 'Standard') = 'Standard'
      and coalesce(nullif(listing_variant->>'warehouseProductId', ''), new.id::text) = new.id::text
      and (variant_key is null or variant_key = 'id:standard') then
      variant_key := 'id:standard';
      old_variant := '{"id":"standard","label":"Standard"}'::jsonb;
    else
      old_variant := old_variants->variant_key;
    end if;
    new_variant := new_variants->variant_key;
    next_variant := listing_variant;
    if old_variant is not null then
      if variant_key = any(linked_keys) then
        raise exception 'Multiple Marketplace options share a warehouse option.' using errcode = 'PT409';
      end if;
      linked_keys := array_append(linked_keys, variant_key);
      if new_variant is null then continue; end if;
      foreach field in array variant_fields loop
        if old_variant->field is distinct from new_variant->field then
          next_variant := jsonb_set(next_variant, array[field], coalesce(new_variant->field, 'null'::jsonb), true);
        end if;
      end loop;
    end if;
    next_variants := next_variants || jsonb_build_array(next_variant);
  end loop;

  for new_variant in select value from jsonb_array_elements(coalesce(new.product_data->'variants', '[]'::jsonb)) loop
    variant_key := public.warehouse_variant_key(new_variant);
    if old_variants ? variant_key or variant_key = any(linked_keys) then continue; end if;
    next_variants := next_variants || jsonb_build_array(new_variant || jsonb_build_object(
      'id', 'warehouse-option-' || coalesce(nullif(new_variant->>'id', ''), gen_random_uuid()::text),
      'warehouseProductId', new.id::text, 'warehouseVariantId', coalesce(new_variant->>'id', ''),
      'supplierId', coalesce(supplier_name, ''), 'supplier', coalesce(supplier_name, ''),
      'cost', 0, 'frozen', false));
  end loop;

  if old.name is distinct from new.name then listing := jsonb_set(listing, '{name}', to_jsonb(new.name)); end if;
  foreach field in array product_fields loop
    if old.product_data->field is distinct from new.product_data->field then
      listing := jsonb_set(listing, array[field], coalesce(new.product_data->field, 'null'::jsonb), true);
    end if;
  end loop;
  listing := jsonb_set(listing, '{variants}', next_variants);
  if listing = original_listing then return new; end if;
  update public.app_data set payload = (
    select jsonb_agg(case when value->>'id' = new.marketplace_product_id then listing else value end order by ordinality)
    from jsonb_array_elements(catalog) with ordinality
  ), updated_at = now() where record_id = 'shared:furgo-demo-marketplace-products:shared';
  return new;
end;
$$;
drop trigger warehouse_product_sync_marketplace_details on public.warehouse_products;
create trigger warehouse_product_sync_marketplace_details
after update of name, product_data on public.warehouse_products
for each row execute function public.sync_marketplace_details_from_warehouse();

create function public.lock_warehouse_write_statement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_warehouse_inventory();
  return null;
end;
$$;
revoke all on function public.lock_warehouse_write_statement() from public, anon, authenticated;
create trigger warehouse_products_lock_write before insert or update or delete on public.warehouse_products
for each statement execute function public.lock_warehouse_write_statement();
create trigger warehouse_lots_lock_write before insert or update or delete on public.warehouse_inventory_lots
for each statement execute function public.lock_warehouse_write_statement();

create or replace function public.enforce_warehouse_product_marketplace_source()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  warehouse public.warehouse_products;
  variant jsonb;
  source_variants jsonb;
begin
  if new.action <> 'add' then return new; end if;
  select * into warehouse from public.warehouse_products product
  where product.id::text = new.product_data->>'warehouseProductId' for update;
  if not found or not public.marketplace_store_can_access_owner(warehouse.created_by)
    or not public.warehouse_owners_share_store(new.supplier_user_id, warehouse.created_by)
    or not exists (
      select from public.marketplace_supplier_access access
      where access.supplier_user_id = new.supplier_user_id
        and lower(btrim(access.supplier_name)) = lower(btrim(new.supplier_name))
    ) then
    raise exception 'Choose a warehouse product from your Store before publishing.' using errcode = 'PT403';
  end if;
  if warehouse.marketplace_product_id is not null and warehouse.marketplace_product_id <> ('supplier-' || new.id::text) then
    raise exception 'This warehouse product already has a Marketplace listing.' using errcode = 'PT409';
  end if;
  source_variants := public.warehouse_variant_map(warehouse.product_data->'variants');
  perform public.warehouse_variant_map(new.product_data->'variants');
  for variant in select value from jsonb_array_elements(new.product_data->'variants') loop
    if nullif(variant->>'warehouseProductId', '') is distinct from warehouse.id::text
      and nullif(variant->>'warehouseProductId', '') is not null then
      raise exception 'Every option must use the selected warehouse product.' using errcode = 'PT403';
    end if;
    if nullif(variant->>'warehouseVariantId', '') is not null then
      if source_variants = '{}'::jsonb and variant->>'warehouseVariantId' = 'standard'
        and variant->>'label' = 'Standard' then continue; end if;
      if not source_variants ? ('id:' || (variant->>'warehouseVariantId')) then
        raise exception 'A listing option no longer exists in the warehouse.' using errcode = 'PT409';
      end if;
    elsif source_variants <> '{}'::jsonb and (
      select count(*) from jsonb_each(source_variants)
      where coalesce(value->>'label', 'Standard') = coalesce(variant->>'label', 'Standard')
    ) <> 1 then
      raise exception 'A listing option has an ambiguous warehouse source.' using errcode = 'PT409';
    end if;
  end loop;
  return new;
end;
$$;

create trigger marketplace_submissions_lock_write before insert or update or delete on public.marketplace_product_submissions
for each statement execute function public.lock_warehouse_write_statement();

create function public.guard_marketplace_catalog_references()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  listing jsonb;
  surviving jsonb;
  removed_variant jsonb;
  payload jsonb;
  surviving_products jsonb;
begin
  if old.record_id <> 'shared:furgo-demo-marketplace-products:shared'
    or jsonb_typeof(old.payload) is distinct from 'array' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  payload := case when tg_op = 'UPDATE' and jsonb_typeof(new.payload) = 'array' then new.payload else '[]'::jsonb end;
  select coalesce(jsonb_object_agg(value->>'id', value), '{}'::jsonb) into surviving_products
  from jsonb_array_elements(payload) where value->>'id' is not null;
  for listing in select value from jsonb_array_elements(old.payload) where value->>'id' is not null loop
    surviving := surviving_products->(listing->>'id');
    if surviving is null then
      if public.warehouse_has_active_references(null, p_listing => listing->>'id') then
        raise exception 'This listing is referenced by an active order or return.' using errcode = 'PT409';
      end if;
    elsif listing->'variants' is distinct from surviving->'variants' then
      for removed_variant in
        select previous.value from jsonb_array_elements(coalesce(listing->'variants', '[]'::jsonb)) previous
        where not exists (
          select from jsonb_array_elements(coalesce(surviving->'variants', '[]'::jsonb)) active
          where public.warehouse_variant_key(active.value) = public.warehouse_variant_key(previous.value))
      loop
        if public.warehouse_has_active_references(null, p_listing => listing->>'id',
          p_variant => nullif(removed_variant->>'id', '')) then
          raise exception 'This listing option is referenced by an active order or return.' using errcode = 'PT409';
        end if;
      end loop;
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_marketplace_catalog_references() from public, anon, authenticated;
create trigger marketplace_guard_catalog_references before update of payload or delete on public.app_data
for each row when (old.record_id = 'shared:furgo-demo-marketplace-products:shared')
execute function public.guard_marketplace_catalog_references();

-- Acquire the stock lock before existing workflows take their first row lock.

alter function public.reorder_warehouse_inventory_lots(uuid[]) rename to reorder_warehouse_inventory_lots_locked;
revoke all on function public.reorder_warehouse_inventory_lots_locked(uuid[]) from public, anon, authenticated;
create function public.reorder_warehouse_inventory_lots(p_lot_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_warehouse_inventory();
  perform public.reorder_warehouse_inventory_lots_locked(p_lot_ids);
end;
$$;
revoke all on function public.reorder_warehouse_inventory_lots(uuid[]) from public, anon;
grant execute on function public.reorder_warehouse_inventory_lots(uuid[]) to authenticated;


alter function public.delete_store_warehouse_product(uuid) rename to delete_store_warehouse_product_locked;
revoke all on function public.delete_store_warehouse_product_locked(uuid) from public, anon, authenticated;
create function public.delete_store_warehouse_product(p_warehouse_product_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_warehouse_inventory();
  if exists (select from public.warehouse_products product where product.id = p_warehouse_product_id
    and public.marketplace_store_can_access_owner(product.created_by))
    and public.warehouse_has_active_references(p_warehouse_product_id) then
    raise exception 'This product is referenced by an active order or return.' using errcode = 'PT409';
  end if;
  return public.delete_store_warehouse_product_locked(p_warehouse_product_id);
end;
$$;
revoke all on function public.delete_store_warehouse_product(uuid) from public, anon;
grant execute on function public.delete_store_warehouse_product(uuid) to authenticated;


alter function public.rename_marketplace_store(text,text) rename to rename_marketplace_store_locked;
revoke all on function public.rename_marketplace_store_locked(text,text) from public, anon, authenticated;
create or replace function public.rename_marketplace_store_locked(p_current_store_name text, p_supplier_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  old_name text := btrim(coalesce(p_current_store_name, ''));
  new_name text := btrim(coalesce(p_supplier_name, ''));
  old_key text;
  new_key text;
  store_id_value uuid;
  catalog jsonb;
  renamed_catalog jsonb;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then raise exception 'Only Directors can edit Store names.'; end if;
  if char_length(old_name) not between 1 and 100 then raise exception 'Choose a Store to rename.'; end if;
  if char_length(new_name) not between 1 and 100 then raise exception 'Store name must be 1 to 100 characters.'; end if;
  old_key := lower(old_name); new_key := lower(new_name);
  select store.id into store_id_value from public.marketplace_stores store where store.store_key = old_key for update;
  if store_id_value is null then raise exception 'Store could not be found.'; end if;
  if old_key = new_key then
    update public.marketplace_stores set store_name = new_name, updated_at = now() where id = store_id_value;
    update public.marketplace_supplier_access set supplier_name = new_name, updated_at = now() where lower(btrim(supplier_name)) = old_key;
    return jsonb_build_object('ok', true, 'supplier_name', new_name);
  end if;
  if exists (select 1 from public.marketplace_stores where store_key = new_key) then
    raise exception 'Another Store already uses that name.';
  end if;

  select coalesce(payload, '[]'::jsonb) into catalog
  from public.app_data where record_id = 'shared:furgo-demo-marketplace-products:shared' for update;
  if catalog is not null then
    if jsonb_typeof(catalog) <> 'array' then raise exception 'Marketplace catalog data is not an array.'; end if;
    select coalesce(jsonb_agg(
      case when jsonb_typeof(product.value->'variants') = 'array' then
        jsonb_set(product.value, '{variants}', coalesce((
          select jsonb_agg(
            case when lower(btrim(coalesce(variant.value->>'supplierId', variant.value->>'supplier', ''))) = old_key
              then jsonb_set(jsonb_set(variant.value, '{supplierId}', to_jsonb(new_name), true), '{supplier}', to_jsonb(new_name), true)
              else variant.value end order by variant.ordinality
          ) from jsonb_array_elements(product.value->'variants') with ordinality as variant(value, ordinality)
        ), '[]'::jsonb), true)
      else product.value end order by product.ordinality
    ), '[]'::jsonb) into renamed_catalog
    from jsonb_array_elements(catalog) with ordinality as product(value, ordinality);
    update public.app_data set payload = renamed_catalog, updated_at = now()
    where record_id = 'shared:furgo-demo-marketplace-products:shared';
  end if;

  -- Order transitions lock their order before inventory. A rename already owns
  -- the inventory lock, so take these legacy reference locks without waiting.
  perform 1 from public.marketplace_orders orders
  where coalesce(orders.details->'supplierShipments', '{}'::jsonb) ? old_key
  order by orders.id for update nowait;
  perform 1 from public.marketplace_order_items lines
  where lower(btrim(coalesce(lines.item->>'supplierId', lines.item->>'supplier', ''))) = old_key
  order by lines.order_id, lines.line_number for update nowait;
  perform 1 from public.marketplace_item_returns item_return
  where lower(btrim(item_return.supplier_name)) = old_key order by item_return.id for update nowait;
  update public.marketplace_supplier_access set supplier_name = new_name, updated_at = now()
  where lower(btrim(supplier_name)) = old_key;

  update public.marketplace_product_submissions submission
  set supplier_name = new_name,
      product_data = case when jsonb_typeof(submission.product_data->'variants') = 'array' then
        jsonb_set(submission.product_data, '{variants}', coalesce((
          select jsonb_agg(
            case when lower(btrim(coalesce(variant.value->>'supplierId', variant.value->>'supplier', old_name))) = old_key
              then jsonb_set(jsonb_set(variant.value, '{supplierId}', to_jsonb(new_name), true), '{supplier}', to_jsonb(new_name), true)
              else variant.value end order by variant.ordinality
          ) from jsonb_array_elements(submission.product_data->'variants') with ordinality as variant(value, ordinality)
        ), '[]'::jsonb), true)
      else submission.product_data end
  where lower(btrim(submission.supplier_name)) = old_key
    and exists (select 1 from public.warehouse_products product
      where product.id::text = nullif(btrim(submission.product_data->>'warehouseProductId'), ''));
  update public.marketplace_product_submissions submission set supplier_name = new_name
  where lower(btrim(submission.supplier_name)) = old_key
    and not exists (select 1 from public.warehouse_products product
      where product.id::text = nullif(btrim(submission.product_data->>'warehouseProductId'), ''));

  update public.marketplace_order_items lines
  set item = case when lower(btrim(coalesce(lines.item->>'supplierId', lines.item->>'supplier', ''))) = old_key
    then jsonb_set(jsonb_set(lines.item, '{supplierId}', to_jsonb(new_name), true), '{supplier}', to_jsonb(new_name), true)
    else lines.item end
  where lower(btrim(coalesce(lines.item->>'supplierId', lines.item->>'supplier', ''))) = old_key;
  update public.marketplace_item_returns set supplier_name = new_name, updated_at = now()
  where lower(btrim(supplier_name)) = old_key;
  if exists (
    select 1 from public.marketplace_orders order_row
    where coalesce(order_row.details->'supplierShipments', '{}'::jsonb) ? old_key
      and coalesce(order_row.details->'supplierShipments', '{}'::jsonb) ? new_key
  ) then raise exception 'Shipment records already use the new Store name. Resolve the duplicate before renaming.'; end if;
  update public.marketplace_orders order_row
  set details = jsonb_set(coalesce(order_row.details, '{}'::jsonb), '{supplierShipments}',
    (coalesce(order_row.details->'supplierShipments', '{}'::jsonb) - old_key)
      || case when coalesce(order_row.details->'supplierShipments', '{}'::jsonb) ? old_key
        then jsonb_build_object(new_key, order_row.details->'supplierShipments'->old_key) else '{}'::jsonb end, true)
  where coalesce(order_row.details->'supplierShipments', '{}'::jsonb) ? old_key;
  update public.marketplace_stores set store_name = new_name, store_key = new_key, updated_at = now()
  where id = store_id_value;
  return jsonb_build_object('ok', true, 'supplier_name', new_name);
exception when lock_not_available then
  raise exception 'The Store has an order update in progress. Try the rename again.' using errcode = 'PT409';
end;
$$;

create function public.rename_marketplace_store(p_current_store_name text, p_supplier_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_warehouse_inventory();
  return public.rename_marketplace_store_locked(p_current_store_name, p_supplier_name);
end;
$$;
revoke all on function public.rename_marketplace_store(text,text) from public, anon;
grant execute on function public.rename_marketplace_store(text,text) to authenticated;


alter function public.delete_marketplace_store(text) rename to delete_marketplace_store_locked;
revoke all on function public.delete_marketplace_store_locked(text) from public, anon, authenticated;
create function public.delete_marketplace_store(p_supplier_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_warehouse_inventory();
  return public.delete_marketplace_store_locked(p_supplier_name);
end;
$$;
revoke all on function public.delete_marketplace_store(text) from public, anon;
grant execute on function public.delete_marketplace_store(text) to authenticated;


alter function public.manage_marketplace_supplier_product(text,text) rename to manage_marketplace_supplier_product_locked;
revoke all on function public.manage_marketplace_supplier_product_locked(text,text) from public, anon, authenticated;
create function public.manage_marketplace_supplier_product(p_action text, p_product_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_warehouse_inventory();
  if p_action = 'delete' and exists (
    select from public.app_data data
    cross join lateral jsonb_array_elements(data.payload) product
    cross join lateral jsonb_array_elements(product->'variants') variant
    where data.record_id = 'shared:furgo-demo-marketplace-products:shared' and product->>'id' = p_product_id
      and not exists (select from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid()
        and lower(btrim(access.supplier_name)) = lower(btrim(coalesce(variant->>'supplierId', variant->>'supplier', ''))))
  ) then
    raise exception 'This listing also contains options from another Store.' using errcode = 'PT403';
  end if;
  return public.manage_marketplace_supplier_product_locked(p_action, p_product_id);
end;
$$;
revoke all on function public.manage_marketplace_supplier_product(text,text) from public, anon;
grant execute on function public.manage_marketplace_supplier_product(text,text) to authenticated;


alter function public.submit_marketplace_supplier_product(text,text,jsonb) rename to submit_marketplace_supplier_product_locked;
revoke all on function public.submit_marketplace_supplier_product_locked(text,text,jsonb) from public, anon, authenticated;
create function public.submit_marketplace_supplier_product(p_action text, p_product_id text, p_product_data jsonb)
returns public.marketplace_product_submissions language plpgsql security definer set search_path = '' as $$
declare
  warehouse public.warehouse_products;
  source_variants jsonb;
  listing_variants jsonb;
begin
  perform public.lock_warehouse_inventory();
  if p_action is distinct from 'add' then
    return public.submit_marketplace_supplier_product_locked(p_action, p_product_id, p_product_data);
  end if;
  select * into warehouse from public.warehouse_products where id::text = p_product_data->>'warehouseProductId';
  if not found or not public.marketplace_store_can_access_owner(warehouse.created_by)
    or not public.warehouse_owners_share_store(auth.uid(), warehouse.created_by) then
    raise exception 'Choose a warehouse product from your Store before publishing.' using errcode = 'PT403';
  end if;
  source_variants := warehouse.product_data->'variants';
  if public.warehouse_variant_map(source_variants) = '{}'::jsonb then
    source_variants := '[{"id":"standard","label":"Standard","price":0}]'::jsonb;
  end if;
  select jsonb_agg(value || jsonb_build_object(
    'id', coalesce(nullif(value->>'id', ''), gen_random_uuid()::text),
    'warehouseProductId', warehouse.id, 'warehouseVariantId', coalesce(value->>'id', ''), 'stock', 0
  ) order by ordinality) into listing_variants from jsonb_array_elements(source_variants) with ordinality;
  return public.submit_marketplace_supplier_product_locked(p_action, p_product_id,
    warehouse.product_data || jsonb_build_object('name', warehouse.name,
      'warehouseProductId', warehouse.id, 'variants', listing_variants));
end;
$$;
revoke all on function public.submit_marketplace_supplier_product(text,text,jsonb) from public, anon;
grant execute on function public.submit_marketplace_supplier_product(text,text,jsonb) to authenticated;


alter function public.update_marketplace_pending_product_request(uuid,jsonb) rename to update_marketplace_pending_product_request_locked;
revoke all on function public.update_marketplace_pending_product_request_locked(uuid,jsonb) from public, anon, authenticated;
create function public.update_marketplace_pending_product_request(p_submission_id uuid, p_product_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_warehouse_inventory();
  return public.update_marketplace_pending_product_request_locked(p_submission_id, p_product_data);
end;
$$;
revoke all on function public.update_marketplace_pending_product_request(uuid,jsonb) from public, anon;
grant execute on function public.update_marketplace_pending_product_request(uuid,jsonb) to authenticated;


alter function public.review_marketplace_product_submission(uuid,text,text) rename to review_marketplace_product_submission_locked;
revoke all on function public.review_marketplace_product_submission_locked(uuid,text,text) from public, anon, authenticated;
create function public.review_marketplace_product_submission(p_submission_id uuid, p_decision text, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_warehouse_inventory();
  if p_decision = 'approve' and exists (
    select from public.marketplace_product_submissions request
    where request.id = p_submission_id and request.action in ('edit', 'edit_variant')
  ) then
    raise exception 'Ask the Store to resubmit this old edit from the current product.' using errcode = 'PT409';
  end if;
  return public.review_marketplace_product_submission_locked(p_submission_id, p_decision, p_reason);
end;
$$;
revoke all on function public.review_marketplace_product_submission(uuid,text,text) from public, anon;
grant execute on function public.review_marketplace_product_submission(uuid,text,text) to authenticated;

create function public.patch_marketplace_supplier_product(p_product_id text, p_expected jsonb, p_desired jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  supplier_name text;
  catalog jsonb;
  listing jsonb;
  owned jsonb;
  other_variants jsonb;
  next_listing jsonb;
  owned_variants jsonb;
  own_options jsonb;
  next_options jsonb;
  variant_fields text[] := array['option','variant','label','price','sku','supplierSku','imageUrl'];
begin
  select lower(btrim(access.supplier_name)) into supplier_name from public.marketplace_supplier_access access
  where access.supplier_user_id = auth.uid();
  if supplier_name is null then raise exception 'This account is not linked to a Store.' using errcode = 'PT403'; end if;
  perform public.lock_warehouse_inventory();
  select payload into catalog from public.app_data where record_id = 'shared:furgo-demo-marketplace-products:shared' for update;
  if (select count(*) from jsonb_array_elements(catalog) where value->>'id' = p_product_id) <> 1 then
    raise exception 'The listing changed. Refresh and review your edit.' using errcode = 'PT409';
  end if;
  select value into listing from jsonb_array_elements(catalog) where value->>'id' = p_product_id;
  select coalesce(jsonb_agg(value order by ordinality) filter (where belongs), '[]'::jsonb),
    coalesce(jsonb_agg(value order by ordinality) filter (where not belongs), '[]'::jsonb)
  into owned_variants, other_variants
  from (
    select value, ordinality, lower(btrim(coalesce(value->>'supplierId', value->>'supplier', ''))) = supplier_name as belongs
    from jsonb_array_elements(listing->'variants') with ordinality
  ) variants;
  own_options := public.warehouse_variant_map(owned_variants);
  if owned_variants = '[]'::jsonb then
    raise exception 'This product is not assigned to your Store.' using errcode = 'PT403';
  end if;
  if exists (
    select from jsonb_array_elements(coalesce(p_desired->'variants', '[]'::jsonb)) proposed
    join jsonb_array_elements(other_variants) other
    on public.warehouse_variant_key(proposed.value) = public.warehouse_variant_key(other.value)
  ) then
    raise exception 'An option belongs to another Store.' using errcode = 'PT403';
  end if;
  if coalesce(nullif(listing->>'warehouseProductId', ''), (
    select p.id::text from public.warehouse_products p where p.marketplace_product_id = p_product_id
  )) is null and not exists (
    select from jsonb_array_elements(owned_variants) variant where nullif(variant->>'warehouseProductId', '') is not null
  ) then
    variant_fields := variant_fields || array['stock'];
  end if;
  owned := jsonb_set(listing, '{variants}', owned_variants);
  next_listing := public.merge_warehouse_product(owned, p_expected, p_desired,
    array['name','category','description','petTypes','ingredients','nutrition','images'], variant_fields);
  next_options := public.warehouse_variant_map(next_listing->'variants');
  if exists (select from jsonb_each(next_options) where not own_options ? key)
    and not ('stock' = any(variant_fields)) then
    raise exception 'Add new options in Warehouse Stock before listing them.' using errcode = 'PT409';
  end if;
  if jsonb_array_length(next_listing->'variants') not between 1 and 30 or nullif(btrim(next_listing->>'name'), '') is null
    or exists (select from jsonb_array_elements(next_listing->'variants') variant
      where coalesce(nullif(btrim(variant->>'label'), ''), '') = ''
        or coalesce(variant->>'price', '') !~ '^[0-9]+([.][0-9]{1,2})?$'
        or ('stock' = any(variant_fields) and coalesce(variant->>'stock', '') !~ '^[0-9]+$')) then
    raise exception 'Enter a name and valid options for this product.' using errcode = 'PT422';
  end if;
  if coalesce((select approval_required from public.marketplace_store_product_settings
      where setting_key = 'store_product_approval'), true)
    and next_listing->'variants' is distinct from owned_variants then
    raise exception 'Save option changes from Warehouse Stock or refresh the listing for review.' using errcode = 'PT409';
  end if;

  -- Keep the order and content of other Stores' options and of untouched options.
  select jsonb_set(next_listing, '{variants}', jsonb_agg(entries.value order by entries.priority, entries.position))
  into next_listing
  from (
    select case when not own_options ? public.warehouse_variant_key(value) then value
      when not next_options ? public.warehouse_variant_key(value) then null
      else public.preserve_marketplace_variant_stock_source(listing, value,
        next_options->(public.warehouse_variant_key(value))) end as value,
      0 as priority, ordinality as position
    from jsonb_array_elements(listing->'variants') with ordinality
    union all
    select value || jsonb_build_object('supplierId', supplier_name, 'supplier', supplier_name, 'cost', 0, 'frozen', false),
      1, ordinality
    from jsonb_array_elements(next_listing->'variants') with ordinality
    where not own_options ? public.warehouse_variant_key(value)
  ) entries where entries.value is not null;
  update public.app_data set payload = (
    select jsonb_agg(case when value->>'id' = p_product_id then next_listing else value end order by ordinality)
    from jsonb_array_elements(catalog) with ordinality
  ), updated_at = now() where record_id = 'shared:furgo-demo-marketplace-products:shared';
  return jsonb_build_object('variant_change_pending', false, 'product_id', p_product_id);
end;
$$;

-- Old listings editors supplied no baseline, so only the new RPC can apply edits safely.
create or replace function public.edit_marketplace_supplier_product(p_product_id text, p_product_data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Reload the Store Portal before saving listing edits.' using errcode = 'PT409';
end;
$$;
revoke all on function public.patch_marketplace_supplier_product(text,jsonb,jsonb) from public, anon;
grant execute on function public.patch_marketplace_supplier_product(text,jsonb,jsonb) to authenticated;

alter table public.marketplace_seller_product_submissions add column warehouse_edit_baseline jsonb;

alter function public.seller_submit_product_request(uuid,jsonb,jsonb,uuid)
  rename to submit_seller_product_request_record;
revoke all on function public.submit_seller_product_request_record(uuid,jsonb,jsonb,uuid)
  from public, anon, authenticated;

create function public.submit_seller_product_request_with_baseline(
  p_request_id uuid, p_product_data jsonb, p_seller_details jsonb, p_warehouse_product_id uuid, p_expected jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  request_id uuid;
  product public.warehouse_products;
  current_seller_id uuid := public.seller_portal_require_scope();
begin
  perform public.lock_warehouse_inventory();
  if p_warehouse_product_id is not null then
    select warehouse.* into product from public.warehouse_products warehouse
    join public.marketplace_seller_products mapping on mapping.warehouse_product_id = warehouse.id
    where warehouse.id = p_warehouse_product_id and mapping.seller_id = current_seller_id;
    if not found then raise exception 'This product is not assigned to your seller account.' using errcode = 'PT403'; end if;
    if jsonb_typeof(p_expected) is distinct from 'object' then
      raise exception 'Reload the product before submitting an edit request.' using errcode = 'PT409';
    end if;
    perform public.merge_warehouse_product(product.product_data || jsonb_build_object('name', product.name),
      p_expected, p_product_data, array['name','category','petTypes','description','ingredients','nutrition','images'],
      array['option','variant','label','price','imageUrl','images']);
  end if;
  request_id := public.submit_seller_product_request_record(p_request_id, p_product_data, p_seller_details, p_warehouse_product_id);
  if p_warehouse_product_id is not null then
    update public.marketplace_seller_product_submissions set warehouse_edit_baseline = p_expected where id = request_id;
  end if;
  return request_id;
end;
$$;

create function public.seller_submit_product_request(p_request_id uuid, p_product_data jsonb,
  p_seller_details jsonb, p_warehouse_product_id uuid default null)
returns uuid language sql security definer set search_path = '' as $$
  select public.submit_seller_product_request_with_baseline(p_request_id, p_product_data,
    p_seller_details, p_warehouse_product_id, null);
$$;
revoke all on function public.seller_submit_product_request(uuid,jsonb,jsonb,uuid),
  public.submit_seller_product_request_with_baseline(uuid,jsonb,jsonb,uuid,jsonb) from public, anon;
grant execute on function public.seller_submit_product_request(uuid,jsonb,jsonb,uuid),
  public.submit_seller_product_request_with_baseline(uuid,jsonb,jsonb,uuid,jsonb) to authenticated;

create or replace function public.admin_marketplace_seller_review_product_request(
  p_request_id uuid,
  p_decision text,
  p_note text default ''
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  submission public.marketplace_seller_product_submissions;
  seller public.marketplace_seller_profiles;
  existing_product public.warehouse_products;
  active_store_user uuid;
  warehouse_id uuid;
  product_json jsonb;
  approved_variants jsonb := '[]'::jsonb;
  variant jsonb;
  new_code text;
  prefix text;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;
  if p_decision is null or p_decision not in ('Approve','Reject','In Waiting List') then
    raise exception 'Choose Approve, Reject, or In Waiting List.';
  end if;
  if char_length(coalesce(p_note,'')) > 1000 then raise exception 'The admin note is too long.'; end if;
  if p_decision = 'Reject' and btrim(coalesce(p_note,'')) = '' then
    raise exception 'Add a reason before rejecting this product request.';
  end if;

  perform public.lock_warehouse_inventory();
  select * into submission from public.marketplace_seller_product_submissions
    where id = p_request_id for update;
  if not found then raise exception 'Seller product request not found.'; end if;
  if submission.status not in ('Pending Review','In Waiting List') then
    raise exception 'This request has already been decided. A rejected request must be resubmitted by the seller before it can be reviewed again.';
  end if;

  if p_decision = 'Approve' then
    select profile.* into seller from public.marketplace_seller_profiles profile where profile.id = submission.seller_id;
    if submission.warehouse_product_id is not null then
      select product.* into existing_product from public.warehouse_products product
      join public.marketplace_seller_products mapping on mapping.warehouse_product_id = product.id
      where product.id = submission.warehouse_product_id and mapping.seller_id = submission.seller_id
      for update of product;
      if not found then raise exception 'The seller product is no longer available in warehouse inventory.'; end if;
      if submission.warehouse_edit_baseline is null then
        raise exception 'This older edit request needs review against the current warehouse product. Ask the Seller to resubmit it from the current product.' using errcode = 'PT409';
      end if;
      product_json := public.merge_warehouse_product(
        existing_product.product_data || jsonb_build_object('name', existing_product.name),
        submission.warehouse_edit_baseline, submission.product_data,
        array['name','category','petTypes','description','ingredients','nutrition','images'],
        array['option','variant','label','price','imageUrl','images']);
      if exists (
        select 1 from public.warehouse_inventory_lots lot
        where lot.warehouse_product_id = submission.warehouse_product_id and lot.quantity > 0
          and not exists (
            select 1 from jsonb_array_elements(product_json->'variants') submitted_variant
            where coalesce(submitted_variant->>'label','') = coalesce(lot.variant,'')
          )
      ) then
        raise exception 'An option with warehouse stock cannot be removed or renamed until its batch stock is zero.';
      end if;
      product_json := jsonb_set(product_json, '{sellerDetails}', jsonb_build_object(
        'businessName', coalesce(submission.seller_details->>'businessName',seller.business_name),
        'contactName', coalesce(submission.seller_details->>'contactName',seller.contact_name),
        'contactEmail', coalesce(submission.seller_details->>'contactEmail',seller.contact_email),
        'contactPhone', coalesce(submission.seller_details->>'contactPhone',seller.contact_phone),
        'businessAddress', coalesce(submission.seller_details->>'businessAddress',seller.business_address)
      ), true);
      update public.warehouse_products set name = trim(product_json->>'name'),
        product_data = case when existing_product.product_data ? 'name' then product_json else product_json - 'name' end,
        updated_by = auth.uid(), updated_at = now()
      where id = submission.warehouse_product_id;
      warehouse_id := submission.warehouse_product_id;
    else
    select history.user_id into active_store_user
    from public.marketplace_store_account_history history
    join public.marketplace_supplier_access access on access.supplier_user_id = history.user_id
    where history.removed_at is null
    order by history.assigned_at, history.user_id limit 1;
    if active_store_user is null then
      raise exception 'Assign at least one account to a Store before approving seller products into warehouse inventory.';
    end if;

    prefix := case lower(trim(coalesce(submission.product_data->>'category','other')))
      when 'food' then 'FD' when 'snacks' then 'SN' when 'supplements' then 'ST'
      when 'toys' then 'TY' when 'grooming' then 'GR' else 'OT' end;
    loop
      new_code := prefix || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
      exit when not exists (
        select 1 from public.warehouse_products product
        where product.product_data->>'productCode' = new_code
      );
    end loop;

    for variant in select value from jsonb_array_elements(submission.product_data->'variants') loop
      approved_variants := approved_variants || jsonb_build_array(
        jsonb_set(variant, '{stock}', '0'::jsonb, true)
      );
    end loop;
    product_json := submission.product_data;
    product_json := jsonb_set(product_json, '{productCode}', to_jsonb(new_code), true);
    product_json := jsonb_set(product_json, '{hidden}', 'true'::jsonb, true);
    product_json := jsonb_set(product_json, '{variants}', approved_variants, true);
    product_json := jsonb_set(product_json, '{sellerDetails}', jsonb_build_object(
      'businessName', coalesce(submission.seller_details->>'businessName',seller.business_name),
      'contactName', coalesce(submission.seller_details->>'contactName',seller.contact_name),
      'contactEmail', coalesce(submission.seller_details->>'contactEmail',seller.contact_email),
      'contactPhone', coalesce(submission.seller_details->>'contactPhone',seller.contact_phone),
      'businessAddress', coalesce(submission.seller_details->>'businessAddress',seller.business_address)
    ), true);

    insert into public.warehouse_products(name, product_data, marketplace_product_id, created_by, updated_by)
      values (trim(submission.product_data->>'name'), product_json, null, active_store_user, active_store_user)
      returning id into warehouse_id;
    insert into public.marketplace_seller_products(seller_id, warehouse_product_id, seller_sku, listing_status)
      values (submission.seller_id, warehouse_id, new_code, 'Inactive');
    end if;
  end if;

  update public.marketplace_seller_product_submissions request set
    status = case p_decision when 'Approve' then 'Approved' when 'Reject' then 'Rejected' else 'In Waiting List' end,
    admin_note = btrim(coalesce(p_note,'')), warehouse_product_id = coalesce(warehouse_id, request.warehouse_product_id),
    reviewed_at = now(), reviewed_by = auth.uid()
  where request.id = submission.id returning * into submission;

  return jsonb_build_object('id',submission.id,'status',submission.status,
    'warehouse_product_id',submission.warehouse_product_id,'admin_note',submission.admin_note);
end;
$$;

create function public.reorder_active_warehouse_inventory_lots(p_lot_ids uuid[], p_expected_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  first_batch public.warehouse_inventory_lots;
  current_ids uuid[];
begin
  perform public.lock_warehouse_inventory();
  select * into first_batch from public.warehouse_inventory_lots where id = p_lot_ids[1];
  if not found or not public.warehouse_can_access_batch(first_batch.created_by, first_batch.warehouse_product_id) then
    raise exception 'This batch is not in your Store warehouse.' using errcode = 'PT403';
  end if;
  select array_agg(lot.id order by nullif(lot.pick_order, 0) nulls last, lot.expires_on nulls last, lot.received_on, lot.created_at, lot.id)
  into current_ids from public.warehouse_inventory_lots lot
  where lot.warehouse_product_id is not distinct from first_batch.warehouse_product_id
    and (first_batch.warehouse_product_id is not null or lot.product_name = first_batch.product_name)
    and coalesce(lot.variant, 'Standard') = coalesce(first_batch.variant, 'Standard')
    and lot.quantity > 0 and public.marketplace_store_can_access_owner(lot.created_by);
  if current_ids = p_lot_ids then return; end if;
  if current_ids is distinct from p_expected_ids
    or cardinality(current_ids) is distinct from cardinality(p_lot_ids)
    or not (current_ids @> p_lot_ids) or not (p_lot_ids @> current_ids) then
    raise exception 'The active batches or their pick order changed. Refresh and try again.' using errcode = 'PT409';
  end if;
  update public.warehouse_inventory_lots lot
  set pick_order = ordered.position, updated_by = auth.uid(), updated_at = now()
  from unnest(p_lot_ids) with ordinality ordered(id, position) where lot.id = ordered.id;
end;
$$;
revoke all on function public.reorder_active_warehouse_inventory_lots(uuid[],uuid[]) from public, anon;
grant execute on function public.reorder_active_warehouse_inventory_lots(uuid[],uuid[]) to authenticated;

-- Return requests already hold their order row before insertion.
create trigger marketplace_returns_lock_inventory_reference before insert on public.marketplace_item_returns
for each statement execute function public.lock_warehouse_write_statement();

-- Keep the source IDs accessible when an eligible batch or product is removed.
-- Existing rows are retained. Foreign key cleanup captures their previous IDs.
alter table public.warehouse_inventory_stock_history
  add column original_lot_id uuid,
  add column original_warehouse_product_id uuid;

create function public.preserve_warehouse_history_source_ids()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.original_lot_id := coalesce(old.original_lot_id, old.lot_id, new.lot_id);
    new.original_warehouse_product_id := coalesce(
      old.original_warehouse_product_id, old.warehouse_product_id, new.warehouse_product_id);
  else
    new.original_lot_id := new.lot_id;
    new.original_warehouse_product_id := new.warehouse_product_id;
  end if;
  return new;
end;
$$;
revoke all on function public.preserve_warehouse_history_source_ids() from public, anon, authenticated;
create trigger warehouse_history_preserve_source_ids before insert or update of lot_id, warehouse_product_id
on public.warehouse_inventory_stock_history for each row execute function public.preserve_warehouse_history_source_ids();

alter function public.seller_portal_request_restock(uuid,integer,text) rename to seller_portal_request_restock_locked;
revoke all on function public.seller_portal_request_restock_locked(uuid,integer,text) from public, anon, authenticated;
create function public.seller_portal_request_restock(p_product_id uuid, p_quantity integer, p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_warehouse_inventory();
  return public.seller_portal_request_restock_locked(p_product_id, p_quantity, p_note);
end;
$$;
revoke all on function public.seller_portal_request_restock(uuid,integer,text) from public, anon;
grant execute on function public.seller_portal_request_restock(uuid,integer,text) to authenticated;
