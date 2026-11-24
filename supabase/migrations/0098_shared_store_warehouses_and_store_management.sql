-- Treat a Store as a shared warehouse for every account assigned the same store name.
-- Admins can assign several existing accounts together, rename a store as a group,
-- and delete a store only when all warehouse stock is zero.

create or replace function public.marketplace_store_can_access_owner(p_owner_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner_user_id is not null and exists (
    select 1
    from public.marketplace_supplier_access caller
    join public.marketplace_supplier_access owner_access
      on lower(btrim(owner_access.supplier_name)) = lower(btrim(caller.supplier_name))
    where caller.supplier_user_id = auth.uid()
      and owner_access.supplier_user_id = p_owner_user_id
  );
$$;
revoke all on function public.marketplace_store_can_access_owner(uuid) from public, anon;
grant execute on function public.marketplace_store_can_access_owner(uuid) to authenticated;

create or replace function public.assign_marketplace_store_accounts(p_emails text[], p_supplier_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
  target_user uuid;
  assigned_count integer := 0;
  store_name text := btrim(coalesce(p_supplier_name, ''));
begin
  if public.current_portal_level(auth.uid()) < 3 then raise exception 'Only Directors can assign Store accounts.'; end if;
  if char_length(store_name) not between 1 and 100 then raise exception 'Store name must be 1 to 100 characters.'; end if;
  if coalesce(array_length(p_emails, 1), 0) = 0 then raise exception 'Enter at least one account email.'; end if;

  foreach target_email in array p_emails loop
    target_email := lower(btrim(coalesce(target_email, '')));
    if target_email = '' then continue; end if;
    select profile.id into target_user
    from public.profiles profile
    where lower(profile.email) = target_email
    limit 1;
    if target_user is null then raise exception 'No Furgo account uses %. Ask the user to register first.', target_email; end if;
    insert into public.marketplace_supplier_access (supplier_user_id, supplier_name, assigned_by, updated_at)
    values (target_user, store_name, auth.uid(), now())
    on conflict (supplier_user_id) do update
      set supplier_name = excluded.supplier_name, assigned_by = excluded.assigned_by, updated_at = now();
    assigned_count := assigned_count + 1;
  end loop;
  if assigned_count = 0 then raise exception 'Enter at least one valid account email.'; end if;
  return jsonb_build_object('ok', true, 'assigned_count', assigned_count, 'supplier_name', store_name);
end;
$$;
revoke all on function public.assign_marketplace_store_accounts(text[], text) from public, anon;
grant execute on function public.assign_marketplace_store_accounts(text[], text) to authenticated;

create or replace function public.rename_marketplace_store(p_current_store_name text, p_supplier_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_name text := btrim(coalesce(p_current_store_name, ''));
  new_name text := btrim(coalesce(p_supplier_name, ''));
  old_key text;
  new_key text;
  catalog jsonb;
  renamed_catalog jsonb;
begin
  if public.current_portal_level(auth.uid()) < 3 then raise exception 'Only Directors can edit Store names.'; end if;
  if char_length(old_name) not between 1 and 100 then raise exception 'Choose a Store to rename.'; end if;
  if char_length(new_name) not between 1 and 100 then raise exception 'Store name must be 1 to 100 characters.'; end if;
  old_key := lower(old_name);
  new_key := lower(new_name);
  if not exists (select 1 from public.marketplace_supplier_access where lower(btrim(supplier_name)) = old_key) then
    raise exception 'Store could not be found.';
  end if;
  if old_key = new_key then
    update public.marketplace_supplier_access set supplier_name = new_name, updated_at = now()
    where lower(btrim(supplier_name)) = old_key;
    return jsonb_build_object('ok', true, 'supplier_name', new_name);
  end if;
  if exists (select 1 from public.marketplace_supplier_access where lower(btrim(supplier_name)) = new_key) then
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
  where lower(btrim(submission.supplier_name)) = old_key;

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
        then jsonb_build_object(new_key, order_row.details->'supplierShipments'->old_key) else '{}'::jsonb end,
    true)
  where coalesce(order_row.details->'supplierShipments', '{}'::jsonb) ? old_key;
  update public.marketplace_supplier_access set supplier_name = new_name, updated_at = now()
  where lower(btrim(supplier_name)) = old_key;
  return jsonb_build_object('ok', true, 'supplier_name', new_name);
end;
$$;
revoke all on function public.rename_marketplace_store(text, text) from public, anon;
grant execute on function public.rename_marketplace_store(text, text) to authenticated;

create or replace function public.delete_marketplace_store(p_supplier_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  store_name text := btrim(coalesce(p_supplier_name, ''));
  store_key text;
  members uuid[];
  product_ids text[];
  stock_total bigint;
  catalog jsonb;
  remaining_catalog jsonb;
begin
  if public.current_portal_level(auth.uid()) < 3 then raise exception 'Only Directors can delete a Store.'; end if;
  if char_length(store_name) not between 1 and 100 then raise exception 'Choose a valid Store.'; end if;
  store_key := lower(store_name);
  select array_agg(access.supplier_user_id) into members
  from public.marketplace_supplier_access access
  where lower(btrim(access.supplier_name)) = store_key;
  if coalesce(array_length(members, 1), 0) = 0 then raise exception 'Store could not be found.'; end if;

  select coalesce(sum(lot.quantity), 0)::bigint into stock_total
  from public.warehouse_inventory_lots lot
  where lot.created_by = any(members)
     or lot.warehouse_product_id in (select product.id from public.warehouse_products product where product.created_by = any(members));
  if stock_total > 0 then
    raise exception 'This Store has % units in stock. Reduce all batches to zero before deleting the Store.', stock_total;
  end if;

  select coalesce(array_agg(product.marketplace_product_id), array[]::text[]) into product_ids
  from public.warehouse_products product
  where product.created_by = any(members) and nullif(trim(product.marketplace_product_id), '') is not null;
  select coalesce(payload, '[]'::jsonb) into catalog
  from public.app_data where record_id = 'shared:furgo-demo-marketplace-products:shared' for update;
  if catalog is not null then
    if jsonb_typeof(catalog) <> 'array' then raise exception 'Marketplace catalog data is not an array.'; end if;
    select coalesce(jsonb_agg(product.value order by product.ordinality), '[]'::jsonb) into remaining_catalog
    from jsonb_array_elements(catalog) with ordinality as product(value, ordinality)
    where not (coalesce(product.value->>'id', '') = any(product_ids))
      and not exists (
        select 1 from jsonb_array_elements(
          case when jsonb_typeof(product.value->'variants') = 'array' then product.value->'variants' else '[]'::jsonb end
        ) as variant(value)
        where lower(btrim(coalesce(variant.value->>'supplierId', variant.value->>'supplier', ''))) = store_key
      );
    update public.app_data set payload = remaining_catalog, updated_at = now()
    where record_id = 'shared:furgo-demo-marketplace-products:shared';
  end if;

  delete from public.warehouse_inventory_lots lot
  where lot.created_by = any(members)
     or lot.warehouse_product_id in (select product.id from public.warehouse_products product where product.created_by = any(members));
  delete from public.warehouse_products product where product.created_by = any(members);
  delete from public.marketplace_supplier_access access where access.supplier_user_id = any(members);
  return jsonb_build_object('ok', true, 'store_name', store_name, 'accounts_removed', array_length(members, 1), 'stock', stock_total);
end;
$$;
revoke all on function public.delete_marketplace_store(text) from public, anon;
grant execute on function public.delete_marketplace_store(text) to authenticated;

-- RLS shares inventory only with accounts assigned to the same Store name.
drop policy if exists "Store account reads its warehouse products" on public.warehouse_products;
create policy "Store members read shared warehouse products" on public.warehouse_products
  for select to authenticated using (public.marketplace_store_can_access_owner(created_by));
drop policy if exists "Store account adds its warehouse products" on public.warehouse_products;
create policy "Store members add warehouse products" on public.warehouse_products
  for insert to authenticated with check (created_by = (select auth.uid()) and public.marketplace_store_can_access_owner(created_by));
drop policy if exists "Store account edits its warehouse products" on public.warehouse_products;
create policy "Store members edit shared warehouse products" on public.warehouse_products
  for update to authenticated using (public.marketplace_store_can_access_owner(created_by))
  with check (public.marketplace_store_can_access_owner(created_by) and updated_by = (select auth.uid()));
drop policy if exists "Store account removes its warehouse products" on public.warehouse_products;
create policy "Store members remove shared warehouse products" on public.warehouse_products
  for delete to authenticated using (public.marketplace_store_can_access_owner(created_by));

drop policy if exists "Store account reads its warehouse inventory" on public.warehouse_inventory_lots;
create policy "Store members read shared warehouse inventory" on public.warehouse_inventory_lots
  for select to authenticated using (public.marketplace_store_can_access_owner(created_by));
drop policy if exists "Store account adds its warehouse inventory" on public.warehouse_inventory_lots;
create policy "Store members add warehouse inventory" on public.warehouse_inventory_lots
  for insert to authenticated with check (
    created_by = (select auth.uid()) and public.marketplace_store_can_access_owner(created_by)
    and (warehouse_product_id is null or exists (
      select 1 from public.warehouse_products product
      where product.id = warehouse_product_id and public.marketplace_store_can_access_owner(product.created_by)
    ))
  );
drop policy if exists "Store account updates its warehouse inventory" on public.warehouse_inventory_lots;
create policy "Store members update shared warehouse inventory" on public.warehouse_inventory_lots
  for update to authenticated using (public.marketplace_store_can_access_owner(created_by))
  with check (
    public.marketplace_store_can_access_owner(created_by) and updated_by = (select auth.uid())
    and (warehouse_product_id is null or exists (
      select 1 from public.warehouse_products product
      where product.id = warehouse_product_id and public.marketplace_store_can_access_owner(product.created_by)
    ))
  );
drop policy if exists "Store account removes its warehouse inventory" on public.warehouse_inventory_lots;
create policy "Store members remove shared warehouse inventory" on public.warehouse_inventory_lots
  for delete to authenticated using (public.marketplace_store_can_access_owner(created_by));

drop policy if exists "Store account reads its stock history" on public.warehouse_inventory_stock_history;
create policy "Store members read shared stock history" on public.warehouse_inventory_stock_history
  for select to authenticated using (public.marketplace_store_can_access_owner(store_user_id));

create or replace function public.adjust_warehouse_inventory_lot(
  p_lot_id uuid, p_quantity integer, p_reason text, p_order_number text default null, p_notes text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare stock_lot public.warehouse_inventory_lots;
begin
  if auth.uid() is null then raise exception 'Sign in to adjust stock.'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Enter a quantity of at least one.'; end if;
  if p_reason not in ('Return to supplier', 'Clear expired stock', 'Damaged / lost stock', 'Stock correction', 'Other') then
    raise exception 'Choose a valid reason for the stock deduction.';
  end if;
  select * into stock_lot from public.warehouse_inventory_lots where id = p_lot_id for update;
  if not found then raise exception 'The stock batch could not be found.'; end if;
  if not public.marketplace_store_can_access_owner(stock_lot.created_by) then raise exception 'This batch is not in your Store warehouse.'; end if;
  if p_quantity > stock_lot.quantity then raise exception 'The deduction cannot exceed the batch stock currently on hand.'; end if;
  perform set_config('furgo.stock.reason', p_reason, true);
  perform set_config('furgo.stock.order_id', '', true);
  perform set_config('furgo.stock.order_number', '', true);
  perform set_config('furgo.stock.notes', coalesce(nullif(left(trim(coalesce(p_notes, '')), 500), ''), ''), true);
  update public.warehouse_inventory_lots set quantity = quantity - p_quantity, updated_by = auth.uid(), updated_at = now() where id = p_lot_id;
  perform set_config('furgo.stock.reason', '', true);
  perform set_config('furgo.stock.order_id', '', true);
  perform set_config('furgo.stock.order_number', '', true);
  perform set_config('furgo.stock.notes', '', true);
end;
$$;
revoke all on function public.adjust_warehouse_inventory_lot(uuid, integer, text, text, text) from public, anon;
grant execute on function public.adjust_warehouse_inventory_lot(uuid, integer, text, text, text) to authenticated;

create or replace function public.reorder_warehouse_inventory_lots(p_lot_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  lot_id uuid;
  ordinal integer := 0;
  total_count integer;
  accessible_count integer;
  first_product uuid;
  first_variant text;
begin
  if auth.uid() is null then raise exception 'Sign in to arrange warehouse batches.'; end if;
  if coalesce(array_length(p_lot_ids, 1), 0) = 0 then raise exception 'Choose at least one stock batch.'; end if;
  if (select count(distinct listed.id) from unnest(p_lot_ids) as listed(id)) <> array_length(p_lot_ids, 1) then
    raise exception 'A stock batch can only appear once in the order.';
  end if;
  select count(*) into accessible_count from public.warehouse_inventory_lots lot
  where lot.id = any(p_lot_ids) and public.marketplace_store_can_access_owner(lot.created_by);
  if accessible_count <> array_length(p_lot_ids, 1) then raise exception 'One or more batches are not in your Store warehouse.'; end if;
  select warehouse_product_id, coalesce(variant, 'Standard') into first_product, first_variant
  from public.warehouse_inventory_lots where id = any(p_lot_ids) limit 1;
  if exists (select 1 from public.warehouse_inventory_lots lot where lot.id = any(p_lot_ids)
    and (lot.warehouse_product_id is distinct from first_product or coalesce(lot.variant, 'Standard') <> first_variant)) then
    raise exception 'Reorder batches from one product option at a time.';
  end if;
  select count(*) into total_count from public.warehouse_inventory_lots lot
  where lot.warehouse_product_id is not distinct from first_product and coalesce(lot.variant, 'Standard') = first_variant
    and public.marketplace_store_can_access_owner(lot.created_by);
  if total_count <> array_length(p_lot_ids, 1) then raise exception 'Include every batch for this product option when changing its pick order.'; end if;
  foreach lot_id in array p_lot_ids loop
    ordinal := ordinal + 1;
    update public.warehouse_inventory_lots set pick_order = ordinal, updated_by = auth.uid(), updated_at = now() where id = lot_id;
  end loop;
end;
$$;
revoke all on function public.reorder_warehouse_inventory_lots(uuid[]) from public, anon;
grant execute on function public.reorder_warehouse_inventory_lots(uuid[]) to authenticated;

create or replace function public.delete_store_warehouse_product(p_warehouse_product_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  warehouse_product public.warehouse_products;
  total_stock bigint;
begin
  if auth.uid() is null then raise exception 'Sign in before deleting a Warehouse product.'; end if;
  select product.* into warehouse_product from public.warehouse_products product
  where product.id = p_warehouse_product_id and public.marketplace_store_can_access_owner(product.created_by) for update;
  if not found then raise exception 'This Warehouse product is not in your Store warehouse.'; end if;
  select coalesce(sum(lot.quantity), 0)::bigint into total_stock from public.warehouse_inventory_lots lot
  where lot.warehouse_product_id = warehouse_product.id;
  if total_stock > 0 then raise exception 'This product still has % units in stock. Reduce every stock batch to zero before deleting it.', total_stock; end if;
  if nullif(trim(warehouse_product.marketplace_product_id), '') is not null and exists (
    select 1 from public.app_data catalog cross join lateral jsonb_array_elements(
      case when jsonb_typeof(catalog.payload) = 'array' then catalog.payload else '[]'::jsonb end
    ) entry(value) where catalog.record_id = 'shared:furgo-demo-marketplace-products:shared'
      and entry.value->>'id' = warehouse_product.marketplace_product_id
  ) then perform public.manage_marketplace_supplier_product('delete', warehouse_product.marketplace_product_id); end if;
  delete from public.warehouse_inventory_lots lot where lot.warehouse_product_id = warehouse_product.id;
  delete from public.warehouse_products product where product.id = warehouse_product.id;
  return jsonb_build_object('deleted', true, 'warehouse_product_id', warehouse_product.id,
    'marketplace_product_id', warehouse_product.marketplace_product_id, 'stock', total_stock);
end;
$$;
revoke all on function public.delete_store_warehouse_product(uuid) from public, anon;
grant execute on function public.delete_store_warehouse_product(uuid) to authenticated;
