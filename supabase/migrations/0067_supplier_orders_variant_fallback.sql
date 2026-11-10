-- Resolve historical marketplace order lines against their saved product variant
-- when the line's supplier snapshot is missing or stale.
create or replace function public.get_marketplace_supplier_orders()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', order_row.id,
    'reference', order_row.reference,
    'status', order_row.status,
    'paymentStatus', order_row.payment_status,
    'paymentMethod', order_row.details->>'paymentMethod',
    'total', order_row.total,
    'createdAt', order_row.created_at,
    'recipientName', coalesce(order_row.details->>'customerName', order_row.details->'address'->>'name', ''),
    'recipientPhone', coalesce(order_row.details->>'deliveryPhone', order_row.details->'address'->>'phone', order_row.details->>'customerPhone', ''),
    'recipientAddress', concat_ws(', ', nullif(order_row.details->'address'->>'street', ''), nullif(order_row.details->'address'->>'postcode', ''), nullif(order_row.details->'address'->>'city', ''), nullif(order_row.details->'address'->>'state', '')),
    'supplierShipment', coalesce(order_row.details->'supplierShipments'->lower(trim(access.supplier_name)), '{}'::jsonb),
    'products', supplier_lines.lines
  )
  from public.marketplace_orders order_row
  join public.marketplace_supplier_access access on access.supplier_user_id = auth.uid()
  cross join lateral (
    select coalesce(jsonb_agg(
      lines.item || jsonb_build_object(
        'lineNumber', lines.line_number,
        'images', coalesce(
          case when jsonb_typeof(lines.item->'images') = 'array' then lines.item->'images' end,
          product_catalog.images,
          '[]'::jsonb
        )
      ) order by lines.line_number
    ), '[]'::jsonb) as lines
    from public.marketplace_order_items lines
    left join lateral (
      select product.value->'images' as images
      from public.app_data catalog
      cross join lateral jsonb_array_elements(case when jsonb_typeof(catalog.payload) = 'array' then catalog.payload else '[]'::jsonb end) product(value)
      where catalog.record_id = 'shared:furgo-demo-marketplace-products:shared'
        and product.value->>'id' = lines.item->>'productId'
      limit 1
    ) product_catalog on true
    where lines.order_id = order_row.id
      and (
        lower(coalesce(nullif(trim(lines.item->>'supplierId'), ''), nullif(trim(lines.item->>'supplier'), ''), '')) = lower(trim(access.supplier_name))
        or exists (
          select 1
          from public.app_data catalog
          cross join lateral jsonb_array_elements(case when jsonb_typeof(catalog.payload) = 'array' then catalog.payload else '[]'::jsonb end) product(value)
          cross join lateral jsonb_array_elements(case when jsonb_typeof(product.value->'variants') = 'array' then product.value->'variants' else '[]'::jsonb end) variant(value)
          where catalog.record_id = 'shared:furgo-demo-marketplace-products:shared'
            and product.value->>'id' = lines.item->>'productId'
            and variant.value->>'id' = lines.item->>'variantId'
            and lower(coalesce(nullif(trim(variant.value->>'supplierId'), ''), nullif(trim(variant.value->>'supplier'), ''), '')) = lower(trim(access.supplier_name))
        )
      )
  ) supplier_lines
  where jsonb_array_length(supplier_lines.lines) > 0
  order by order_row.created_at desc;
$$;

revoke all on function public.get_marketplace_supplier_orders() from public, anon;
grant execute on function public.get_marketplace_supplier_orders() to authenticated;
