-- Let a Store Portal user reopen a packed marketplace parcel before shipment.
-- This removes only the packing marker; the order, payment, and inventory stay unchanged.
create or replace function public.reopen_marketplace_supplier_order_packing(p_order_id text)
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
  if lower(coalesce(order_row.payment_status, '')) <> 'paid' then
    raise exception 'Payment must be verified before editing this parcel.';
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

  if lower(coalesce(order_row.status, '')) like '%cancel%' then
    raise exception 'Cancelled orders cannot be reopened for packing.';
  end if;
  supplier_key := lower(trim(supplier_name));
  shipments := coalesce(order_row.details->'supplierShipments', '{}'::jsonb);
  supplier_shipment := coalesce(shipments->supplier_key, '{}'::jsonb);
  if lower(coalesce(supplier_shipment->>'status', '')) in ('shipped', 'delivered') then
    raise exception 'A shipped parcel cannot be reopened for packing.';
  end if;
  if coalesce(supplier_shipment->>'packedAt', '') = '' then
    raise exception 'This order is not currently marked as packed.';
  end if;

  supplier_shipment := (supplier_shipment - 'packedAt' - 'packedBy') || jsonb_build_object('editingParcel', true);
  shipments := jsonb_set(shipments, array[supplier_key], supplier_shipment, true);
  update public.marketplace_orders
  set details = jsonb_set(coalesce(details, '{}'::jsonb), '{supplierShipments}', shipments, true),
      updated_at = now()
  where id = order_row.id;

  return jsonb_build_object('ok', true, 'orderId', order_row.id, 'supplierShipment', supplier_shipment);
end;
$$;

revoke all on function public.reopen_marketplace_supplier_order_packing(text) from public, anon;
grant execute on function public.reopen_marketplace_supplier_order_packing(text) to authenticated;
