-- Seller Portal displays the same listing visibility chosen in Store Portal.
-- This is a read-only projection of the shared marketplace catalog's hidden
-- flag; it does not create or maintain a second seller listing status.

create or replace function public.seller_portal_store_listing_statuses()
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
  select data.payload into catalog
  from public.app_data data
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared';

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'warehouse_product_id', product.warehouse_product_id,
      'status', case
        when listing.value is null or listing.value->'hidden' = 'true'::jsonb then 'Hidden'
        else 'Live'
      end
    ) order by warehouse.name)
    from public.marketplace_seller_products product
    join public.warehouse_products warehouse on warehouse.id = product.warehouse_product_id
    left join lateral (
      select entry.value
      from jsonb_array_elements(
        case when jsonb_typeof(catalog) = 'array' then catalog else '[]'::jsonb end
      ) entry(value)
      where entry.value->>'id' = coalesce(product.marketplace_product_id, warehouse.marketplace_product_id)
        or entry.value->>'warehouseProductId' = warehouse.id::text
        or exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(entry.value->'variants') = 'array'
              then entry.value->'variants' else '[]'::jsonb end
          ) option_row(value)
          where option_row.value->>'warehouseProductId' = warehouse.id::text
        )
      order by case
        when entry.value->>'id' = coalesce(product.marketplace_product_id, warehouse.marketplace_product_id) then 0
        when entry.value->>'warehouseProductId' = warehouse.id::text then 1
        else 2
      end
      limit 1
    ) listing on true
    where product.seller_id = seller_scope
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.seller_portal_store_listing_statuses() from public, anon;
grant execute on function public.seller_portal_store_listing_statuses() to authenticated;
