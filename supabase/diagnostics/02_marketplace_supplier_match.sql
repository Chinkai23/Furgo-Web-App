-- STEP 2 — Check whether each Marketplace product line matches a supplier.
-- Run after 01_marketplace_order_rows.sql in Supabase SQL Editor.
-- Read-only; it changes no data.

with catalog_variants as (
  select
    product.value->>'id' as product_id,
    variant.value->>'id' as variant_id,
    coalesce(nullif(trim(variant.value->>'supplierId'), ''), nullif(trim(variant.value->>'supplier'), '')) as catalog_supplier
  from public.app_data catalog
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(catalog.payload) = 'array' then catalog.payload else '[]'::jsonb end
  ) as product(value)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(product.value->'variants') = 'array' then product.value->'variants' else '[]'::jsonb end
  ) as variant(value)
  where catalog.record_id = 'shared:furgo-demo-marketplace-products:shared'
), lines as (
  select
    orders.id as order_id,
    orders.reference,
    orders.created_at,
    items.line_number,
    items.item->>'productId' as product_id,
    items.item->>'variantId' as variant_id,
    coalesce(nullif(trim(items.item->>'supplierId'), ''), nullif(trim(items.item->>'supplier'), '')) as saved_supplier,
    catalog_variants.catalog_supplier
  from public.marketplace_orders orders
  join public.marketplace_order_items items on items.order_id = orders.id
  left join catalog_variants
    on catalog_variants.product_id = items.item->>'productId'
   and catalog_variants.variant_id = items.item->>'variantId'
  where orders.created_at >= now() - interval '1 year'
)
select
  lines.order_id,
  lines.reference,
  lines.created_at,
  lines.line_number,
  lines.product_id,
  lines.variant_id,
  lines.saved_supplier,
  lines.catalog_supplier,
  access.supplier_user_id,
  access.supplier_name as matching_supplier_account,
  (lower(trim(coalesce(lines.saved_supplier, ''))) = lower(trim(access.supplier_name))) as saved_seller_matches,
  (lower(trim(coalesce(lines.catalog_supplier, ''))) = lower(trim(access.supplier_name))) as catalog_variant_matches
from lines
left join public.marketplace_supplier_access access
  on lower(trim(access.supplier_name)) = lower(trim(coalesce(lines.saved_supplier, lines.catalog_supplier, '')))
  or lower(trim(access.supplier_name)) = lower(trim(coalesce(lines.catalog_supplier, '')))
order by lines.created_at desc, lines.line_number
limit 300;
