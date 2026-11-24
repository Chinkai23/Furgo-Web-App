-- Allow an authenticated Store Portal user to mark their own paid order as packed.
-- Packing is recorded in the store's shipment metadata and does not change order
-- status or stock; shipment handling remains in its existing workflow.
create or replace function public.mark_marketplace_supplier_order_packed(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplier_name text;
  supplier_key text;
  order_row public.marketplace_orders;
  shipments jsonb;
  supplier_shipment jsonb;
begin
  select access.supplier_name into supplier_name
  from public.marketplace_supplier_access access
  where access.supplier_user_id = auth.uid();
  if supplier_name is null then raise exception 'Store Portal access is required.'; end if;

  select * into order_row
  from public.marketplace_orders
  where id = p_order_id
  for update;
  if not found then raise exception 'Marketplace order not found.'; end if;
  if lower(coalesce(order_row.status, '')) like '%cancel%' then
    raise exception 'Cancelled orders cannot be marked as packed.';
  end if;
  if lower(coalesce(order_row.payment_status, '')) <> 'paid' then
    raise exception 'Payment must be verified before packing this order.';
  end if;
  if not exists (
    select 1 from public.marketplace_order_items lines
    where lines.order_id = order_row.id
      and (
        lower(coalesce(nullif(trim(lines.item->>'supplierId'), ''), nullif(trim(lines.item->>'supplier'), ''), '')) = lower(trim(supplier_name))
        or exists (
          select 1
          from public.app_data catalog
          cross join lateral jsonb_array_elements(case when jsonb_typeof(catalog.payload) = 'array' then catalog.payload else '[]'::jsonb end) product(value)
          cross join lateral jsonb_array_elements(case when jsonb_typeof(product.value->'variants') = 'array' then product.value->'variants' else '[]'::jsonb end) variant(value)
          where catalog.record_id = 'shared:furgo-demo-marketplace-products:shared'
            and product.value->>'id' = lines.item->>'productId'
            and variant.value->>'id' = lines.item->>'variantId'
            and lower(coalesce(nullif(trim(variant.value->>'supplierId'), ''), nullif(trim(variant.value->>'supplier'), ''), '')) = lower(trim(supplier_name))
        )
      )
  ) then
    raise exception 'This order does not contain products assigned to your store account.';
  end if;

  supplier_key := lower(trim(supplier_name));
  shipments := coalesce(order_row.details->'supplierShipments', '{}'::jsonb);
  supplier_shipment := coalesce(shipments->supplier_key, '{}'::jsonb);
  if coalesce(supplier_shipment->>'status', '') in ('Shipped', 'Delivered') then
    raise exception 'This order has already been shipped.';
  end if;
  if coalesce(supplier_shipment->>'packedAt', '') <> '' then
    raise exception 'This order has already been marked as packed.';
  end if;

  supplier_shipment := supplier_shipment || jsonb_build_object(
    'supplierName', supplier_name,
    'packedAt', now(),
    'packedBy', auth.uid()
  );
  shipments := jsonb_set(shipments, array[supplier_key], supplier_shipment, true);

  update public.marketplace_orders
  set details = jsonb_set(coalesce(details, '{}'::jsonb), '{supplierShipments}', shipments, true),
      updated_at = now()
  where id = order_row.id;

  return jsonb_build_object('ok', true, 'orderId', order_row.id, 'supplierShipment', supplier_shipment);
end;
$$;

revoke all on function public.mark_marketplace_supplier_order_packed(text) from public, anon;
grant execute on function public.mark_marketplace_supplier_order_packed(text) to authenticated;
