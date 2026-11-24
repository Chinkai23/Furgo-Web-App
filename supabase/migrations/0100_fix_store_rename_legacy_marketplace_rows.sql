-- Store renames must keep working for older Marketplace submissions that predate
-- warehouseProductId. The warehouse enforcement trigger rejects product_data
-- updates for those rows, so update only supplier_name on legacy submissions.
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

  -- Submissions linked to an existing warehouse product can safely update nested supplier data.
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
    and exists (
      select 1 from public.warehouse_products product
      where product.id::text = nullif(btrim(submission.product_data->>'warehouseProductId'), '')
    );

  -- Keep legacy or stale-linked submission details untouched so the
  -- warehouse-listing trigger does not reject their store rename.
  update public.marketplace_product_submissions submission
  set supplier_name = new_name
  where lower(btrim(submission.supplier_name)) = old_key
    and not exists (
      select 1 from public.warehouse_products product
      where product.id::text = nullif(btrim(submission.product_data->>'warehouseProductId'), '')
    );

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
