-- Use the Warehouse Stock product code as the single Marketplace product code.
-- Older listings may contain stale codes on the listing or seller-specific
-- record; resolve those codes from the linked warehouse product instead.

create or replace function public.marketplace_warehouse_product_code(p_listing jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  warehouse public.warehouse_products;
  product_code text;
begin
  if jsonb_typeof(p_listing) is distinct from 'object' then
    return null;
  end if;

  select product.* into warehouse
  from public.warehouse_products product
  where product.marketplace_product_id = p_listing->>'id'
     or product.id::text = p_listing->>'warehouseProductId'
     or exists (
       select 1
       from jsonb_array_elements(
         case when jsonb_typeof(p_listing->'variants') = 'array'
           then p_listing->'variants' else '[]'::jsonb end
       ) variant(value)
       where variant.value->>'warehouseProductId' = product.id::text
     )
  order by case
    when product.marketplace_product_id = p_listing->>'id' then 0
    when product.id::text = p_listing->>'warehouseProductId' then 1
    else 2
  end
  limit 1;

  if warehouse.id is null then
    return null;
  end if;

  product_code := nullif(btrim(warehouse.product_data->>'productCode'), '');
  if product_code is null then
    select nullif(btrim(variant.value->>'sku'), '') into product_code
    from jsonb_array_elements(
      case when jsonb_typeof(warehouse.product_data->'variants') = 'array'
        then warehouse.product_data->'variants' else '[]'::jsonb end
    ) with ordinality variant(value, ordinality)
    order by variant.ordinality
    limit 1;
  end if;

  return product_code;
end;
$$;
revoke all on function public.marketplace_warehouse_product_code(jsonb) from public, anon, authenticated;

create or replace function public.marketplace_catalog_with_warehouse_codes(p_catalog jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_catalog) is distinct from 'array' then
    return p_catalog;
  end if;

  return coalesce((
    select jsonb_agg(
      case
        when canonical.product_code is not null
          then jsonb_set(listing.value, '{productCode}', to_jsonb(canonical.product_code), true)
        else listing.value
      end
      order by listing.ordinality
    )
    from jsonb_array_elements(p_catalog) with ordinality listing(value, ordinality)
    cross join lateral (
      select public.marketplace_warehouse_product_code(listing.value) as product_code
    ) canonical
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.marketplace_catalog_with_warehouse_codes(jsonb) from public, anon, authenticated;

-- Correct existing shared catalogue rows immediately.
update public.app_data data
set payload = public.marketplace_catalog_with_warehouse_codes(data.payload),
    updated_at = now()
where data.record_id = 'shared:furgo-demo-marketplace-products:shared'
  and data.payload is distinct from public.marketplace_catalog_with_warehouse_codes(data.payload);

-- Keep the shared listing code aligned whenever the warehouse code or its
-- Marketplace link changes, including listings linked through a variant.
create or replace function public.sync_marketplace_product_codes_from_warehouse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.app_data data
  set payload = public.marketplace_catalog_with_warehouse_codes(data.payload),
      updated_at = now()
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared'
    and data.payload is distinct from public.marketplace_catalog_with_warehouse_codes(data.payload);
  return new;
end;
$$;
revoke all on function public.sync_marketplace_product_codes_from_warehouse() from public, anon, authenticated;

drop trigger if exists warehouse_product_sync_marketplace_product_codes on public.warehouse_products;
create trigger warehouse_product_sync_marketplace_product_codes
after insert or update of product_data, marketplace_product_id
on public.warehouse_products
for each row
execute function public.sync_marketplace_product_codes_from_warehouse();

-- Store Portal catalog RPC: normalize productCode from the linked warehouse
-- record before returning listings to the Store UI.
create or replace function public.get_marketplace_supplier_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  supplier_name text;
  catalog jsonb;
begin
  select access.supplier_name into supplier_name
  from public.marketplace_supplier_access access
  where access.supplier_user_id = auth.uid();
  if supplier_name is null then raise exception 'This account is not linked to a Store.'; end if;

  select public.marketplace_catalog_with_warehouse_codes(data.payload) into catalog
  from public.app_data data
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared';
  if jsonb_typeof(catalog) is distinct from 'array' then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(
      jsonb_set(product.value, '{variants}', coalesce((
        select jsonb_agg(variant.value order by variant.ordinality)
        from jsonb_array_elements(
          case when jsonb_typeof(product.value->'variants') = 'array'
            then product.value->'variants' else '[]'::jsonb end
        ) with ordinality variant(value, ordinality)
        where lower(coalesce(variant.value->>'supplierId', variant.value->>'supplier', '')) = lower(supplier_name)
      ), '[]'::jsonb), true)
      order by lower(coalesce(product.value->>'name', ''))
    )
    from jsonb_array_elements(catalog) product(value)
    where exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(product.value->'variants') = 'array'
          then product.value->'variants' else '[]'::jsonb end
      ) variant(value)
      where lower(coalesce(variant.value->>'supplierId', variant.value->>'supplier', '')) = lower(supplier_name)
    )
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_marketplace_supplier_catalog() from public, anon;
grant execute on function public.get_marketplace_supplier_catalog() to authenticated;

-- Director Store-scoped catalog RPC uses the same canonical code projection.
create or replace function public.get_marketplace_store_catalog(p_supplier_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  store_name text := btrim(coalesce(p_supplier_name, ''));
  catalog jsonb;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Only Directors can open a Store catalog this way.';
  end if;
  if store_name = '' then raise exception 'Choose a Store first.'; end if;

  select public.marketplace_catalog_with_warehouse_codes(data.payload) into catalog
  from public.app_data data
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared';
  if jsonb_typeof(catalog) is distinct from 'array' then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(
      jsonb_set(product.value, '{variants}', coalesce((
        select jsonb_agg(variant.value order by variant.ordinality)
        from jsonb_array_elements(
          case when jsonb_typeof(product.value->'variants') = 'array'
            then product.value->'variants' else '[]'::jsonb end
        ) with ordinality variant(value, ordinality)
        where lower(coalesce(variant.value->>'supplierId', variant.value->>'supplier', '')) = lower(store_name)
      ), '[]'::jsonb), true)
      order by lower(coalesce(product.value->>'name', ''))
    )
    from jsonb_array_elements(catalog) product(value)
    where exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(product.value->'variants') = 'array'
          then product.value->'variants' else '[]'::jsonb end
      ) variant(value)
      where lower(coalesce(variant.value->>'supplierId', variant.value->>'supplier', '')) = lower(store_name)
    )
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_marketplace_store_catalog(text) from public, anon;
grant execute on function public.get_marketplace_store_catalog(text) to authenticated;

-- Seller Portal code is sourced directly from the joined warehouse product,
-- not the seller's separate listing or SKU fields.
create or replace function public.seller_portal_live_products()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  seller_scope uuid := public.seller_portal_require_scope();
  catalog jsonb;
begin
  select public.marketplace_catalog_with_warehouse_codes(data.payload) into catalog
  from public.app_data data
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared';

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'warehouse_product_id', warehouse.id,
      'seller_product_id', seller_product.id,
      'seller_sku', seller_product.seller_sku,
      'name', coalesce(nullif(listing.value->>'name', ''), warehouse.name),
      'category', coalesce(nullif(listing.value->>'category', ''), 'Other'),
      'product_code', coalesce(
        nullif(btrim(warehouse.product_data->>'productCode'), ''),
        nullif(btrim(warehouse.product_data #>> '{variants,0,sku}'), ''),
        ''
      ),
      'images', coalesce(listing.value->'images', '[]'::jsonb),
      'variants', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', variant.value->>'id',
          'label', coalesce(nullif(variant.value->>'label', ''), nullif(concat_ws(' · ',
            coalesce(nullif(variant.value->>'optionLabel', ''), nullif(variant.value->>'option', '')),
            coalesce(nullif(variant.value->>'variantLabel', ''), nullif(variant.value->>'variant', ''))), ''), 'Standard'),
          'price', coalesce(nullif(variant.value->>'price', ''), '0'),
          'stock', coalesce(nullif(variant.value->>'stock', ''), '0'),
          'units_sold', coalesce((
            select sum(greatest(coalesce(nullif(order_item.item->>'quantity', '')::integer, 0), 0))
            from public.marketplace_order_items order_item
            join public.marketplace_orders customer_order on customer_order.id = order_item.order_id
            where order_item.item->>'productId' = listing.value->>'id'
              and (
                order_item.item->>'variantId' = variant.value->>'id'
                or coalesce(order_item.item->>'variantLabel', order_item.item->>'variant_label', order_item.item->>'variant') =
                  coalesce(nullif(variant.value->>'label', ''), nullif(concat_ws(' · ',
                    coalesce(nullif(variant.value->>'optionLabel', ''), nullif(variant.value->>'option', '')),
                    coalesce(nullif(variant.value->>'variantLabel', ''), nullif(variant.value->>'variant', ''))), ''), 'Standard')
              )
              and lower(coalesce(customer_order.payment_status, '')) = 'paid'
              and coalesce(customer_order.status, '') !~* '(cancel|refund)'
          ), 0)
        ) order by variant.ordinality)
        from jsonb_array_elements(
          case when jsonb_typeof(listing.value->'variants') = 'array'
            then listing.value->'variants' else '[]'::jsonb end
        ) with ordinality as variant(value, ordinality)
      ), '[]'::jsonb)
    ) order by coalesce(nullif(listing.value->>'name', ''), warehouse.name))
    from public.marketplace_seller_products seller_product
    join public.warehouse_products warehouse on warehouse.id = seller_product.warehouse_product_id
    join lateral (
      select entry.value
      from jsonb_array_elements(
        case when jsonb_typeof(catalog) = 'array' then catalog else '[]'::jsonb end
      ) as entry(value)
      where entry.value->>'id' = coalesce(seller_product.marketplace_product_id, warehouse.marketplace_product_id)
        or entry.value->>'warehouseProductId' = warehouse.id::text
        or exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(entry.value->'variants') = 'array'
              then entry.value->'variants' else '[]'::jsonb end
          ) as mapped_variant(value)
          where mapped_variant.value->>'warehouseProductId' = warehouse.id::text
        )
      order by case
        when entry.value->>'id' = coalesce(seller_product.marketplace_product_id, warehouse.marketplace_product_id) then 0
        when entry.value->>'warehouseProductId' = warehouse.id::text then 1
        else 2
      end
      limit 1
    ) listing on true
    where seller_product.seller_id = seller_scope
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.seller_portal_live_products() from public, anon;
grant execute on function public.seller_portal_live_products() to authenticated;
