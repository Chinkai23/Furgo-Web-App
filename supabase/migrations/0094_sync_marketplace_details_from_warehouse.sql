-- Keep the customer-facing listing in sync with its linked Warehouse Stock
-- product. The warehouse catalogue is the source of truth for product details;
-- Marketplace visibility and inventory remain managed by their existing flows.

create or replace function public.sync_marketplace_details_from_warehouse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog jsonb;
  current_product jsonb;
  updated_product jsonb;
  current_variant jsonb;
  source_variant jsonb;
  updated_variant jsonb;
  updated_variants jsonb := '[]'::jsonb;
  supplier_name text;
  preserved_id text;
  warehouse_variant_id text;
begin
  if new.marketplace_product_id is null or trim(new.marketplace_product_id) = '' then
    return new;
  end if;

  select access.supplier_name into supplier_name
  from public.marketplace_supplier_access access
  where access.supplier_user_id = new.created_by;

  select data.payload into catalog
  from public.app_data data
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared'
  for update;
  if jsonb_typeof(catalog) is distinct from 'array' then
    return new;
  end if;

  select entry into current_product
  from jsonb_array_elements(catalog) entry
  where entry->>'id' = new.marketplace_product_id
  limit 1;
  if current_product is null then
    return new;
  end if;

  for source_variant in
    select value
    from jsonb_array_elements(coalesce(new.product_data->'variants', '[]'::jsonb)) with ordinality rows(value, ordinality)
    order by ordinality
  loop
    warehouse_variant_id := coalesce(source_variant->>'id', '');
    current_variant := null;

    if warehouse_variant_id <> '' then
      select value into current_variant
      from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) value
      where value->>'warehouseVariantId' = warehouse_variant_id
      limit 1;
    end if;
    if current_variant is null then
      select value into current_variant
      from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) value
      where coalesce(value->>'label', '') = coalesce(source_variant->>'label', '')
        and lower(coalesce(value->>'supplierId', value->>'supplier', '')) = lower(coalesce(supplier_name, ''))
      limit 1;
    end if;

    -- Stock batches use the option label as their key. Keep those batch links
    -- intact if a warehouse edit renames an existing option.
    if current_variant is not null
      and coalesce(current_variant->>'label', '') is distinct from coalesce(source_variant->>'label', '') then
      update public.warehouse_inventory_lots lot
      set variant = coalesce(source_variant->>'label', 'Standard'),
          updated_at = now()
      where lot.warehouse_product_id = new.id
        and coalesce(lot.variant, 'Standard') = coalesce(current_variant->>'label', 'Standard');
    end if;

    preserved_id := coalesce(current_variant->>'id', 'warehouse-option-' || warehouse_variant_id);
    updated_variant := coalesce(current_variant, '{}'::jsonb) || source_variant;
    updated_variant := jsonb_set(updated_variant, '{id}', to_jsonb(preserved_id), true);
    updated_variant := jsonb_set(updated_variant, '{warehouseProductId}', to_jsonb(new.id::text), true);
    updated_variant := jsonb_set(updated_variant, '{warehouseVariantId}', to_jsonb(warehouse_variant_id), true);
    updated_variant := jsonb_set(updated_variant, '{supplierId}', to_jsonb(coalesce(supplier_name, current_variant->>'supplierId', current_variant->>'supplier', '')), true);
    updated_variant := jsonb_set(updated_variant, '{supplier}', to_jsonb(coalesce(supplier_name, current_variant->>'supplier', current_variant->>'supplierId', '')), true);
    if current_variant ? 'cost' then
      updated_variant := jsonb_set(updated_variant, '{cost}', current_variant->'cost', true);
    else
      updated_variant := jsonb_set(updated_variant, '{cost}', '0'::jsonb, true);
    end if;
    if current_variant ? 'frozen' then
      updated_variant := jsonb_set(updated_variant, '{frozen}', current_variant->'frozen', true);
    else
      updated_variant := jsonb_set(updated_variant, '{frozen}', 'false'::jsonb, true);
    end if;
    updated_variants := updated_variants || jsonb_build_array(updated_variant);
  end loop;

  updated_product := current_product || jsonb_build_object(
    'name', new.name,
    'category', new.product_data->'category',
    'description', new.product_data->'description',
    'petTypes', new.product_data->'petTypes',
    'suitableBreeds', new.product_data->'suitableBreeds',
    'issues', new.product_data->'issues',
    'ingredients', new.product_data->'ingredients',
    'nutrition', new.product_data->'nutrition',
    'images', coalesce(new.product_data->'images', '[]'::jsonb),
    'productCode', new.product_data->'productCode',
    'variants', updated_variants
  );
  -- Reassert listing identity and controls: warehouse edits must not publish,
  -- hide, or unfreeze a listing as a side effect.
  updated_product := jsonb_set(updated_product, '{id}', to_jsonb(new.marketplace_product_id), true);
  updated_product := jsonb_set(updated_product, '{hidden}', coalesce(current_product->'hidden', 'false'::jsonb), true);
  updated_product := jsonb_set(updated_product, '{frozenByAdmin}', coalesce(current_product->'frozenByAdmin', 'false'::jsonb), true);

  catalog := (
    select coalesce(jsonb_agg(case when entry->>'id' = new.marketplace_product_id then updated_product else entry end order by ordinality), '[]'::jsonb)
    from jsonb_array_elements(catalog) with ordinality rows(entry, ordinality)
  );

  update public.app_data data
  set payload = catalog,
      updated_at = now()
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared';

  return new;
end;
$$;

revoke all on function public.sync_marketplace_details_from_warehouse() from public, anon, authenticated;

drop trigger if exists warehouse_product_sync_marketplace_details on public.warehouse_products;
create trigger warehouse_product_sync_marketplace_details
after update of name, product_data on public.warehouse_products
for each row
when (new.marketplace_product_id is not null)
execute function public.sync_marketplace_details_from_warehouse();

-- Align existing linked listings with their current Warehouse Stock details.
update public.warehouse_products
set product_data = product_data,
    updated_at = now()
where marketplace_product_id is not null;
