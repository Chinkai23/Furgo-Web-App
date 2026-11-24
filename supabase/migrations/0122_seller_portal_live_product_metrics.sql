-- Use the shared Marketplace catalogue and paid order lines for Seller Portal
-- product metrics, so per-option sold counts match the Store Portal.
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
  select data.payload into catalog
  from public.app_data data
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared';

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'warehouse_product_id', warehouse.id,
      'seller_product_id', seller_product.id,
      'seller_sku', seller_product.seller_sku,
      'name', coalesce(nullif(listing.value->>'name', ''), warehouse.name),
      'category', coalesce(nullif(listing.value->>'category', ''), 'Other'),
      'product_code', coalesce(nullif(listing.value->>'productCode', ''), ''),
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
