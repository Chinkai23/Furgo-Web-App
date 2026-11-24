-- Allow a store to correct an accidental handover confirmation or record a
-- parcel that has been returned by the courier. Tracking details are retained.
create or replace function public.update_marketplace_supplier_shipment(
  p_order_id text,
  p_action text,
  p_courier text default '',
  p_tracking_number text default '',
  p_tracking_url text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplier_name text;
  order_row public.marketplace_orders;
  supplier_key text;
  shipments jsonb;
  supplier_shipment jsonb;
  next_order_status text;
begin
  select access.supplier_name into supplier_name
  from public.marketplace_supplier_access access
  where access.supplier_user_id = auth.uid();
  if supplier_name is null then raise exception 'Store Portal access is required.'; end if;
  if coalesce(p_action, '') not in ('save_tracking', 'ship', 'delivered', 'edit_tracking', 'undo_delivered', 'return_to_ship', 'return_to_pickup') then
    raise exception 'Choose a valid shipment action.';
  end if;

  select * into order_row
  from public.marketplace_orders
  where id = p_order_id
  for update;
  if not found then raise exception 'Marketplace order not found.'; end if;
  if lower(coalesce(order_row.status, '')) like '%cancel%' then raise exception 'Cancelled orders cannot be shipped.'; end if;
  if not exists (
    select 1 from public.marketplace_order_items lines
    where lines.order_id = order_row.id
      and lower(coalesce(nullif(trim(lines.item->>'supplierId'), ''), nullif(trim(lines.item->>'supplier'), ''), '')) = lower(supplier_name)
  ) then raise exception 'This order does not contain products assigned to your store account.'; end if;
  if p_action in ('save_tracking', 'ship', 'edit_tracking') then
    if lower(coalesce(order_row.payment_status, '')) <> 'paid' then raise exception 'Payment must be verified before changing shipment details.'; end if;
    if coalesce(trim(p_courier), '') = '' or coalesce(trim(p_tracking_number), '') = '' then raise exception 'Courier and tracking number are required.'; end if;
    if coalesce(trim(p_tracking_url), '') <> '' and trim(p_tracking_url) !~* '^https?://' then raise exception 'Enter a valid HTTPS or HTTP tracking link.'; end if;
  end if;

  supplier_key := lower(trim(supplier_name));
  shipments := coalesce(order_row.details->'supplierShipments', '{}'::jsonb);
  supplier_shipment := coalesce(shipments->supplier_key, '{}'::jsonb);
  if p_action = 'save_tracking' and coalesce(supplier_shipment->>'packedAt', '') = '' then
    raise exception 'Pack and confirm the order before saving tracking details.';
  end if;
  if p_action = 'ship' and coalesce(supplier_shipment->>'status', '') <> 'Awaiting Pickup' then
    raise exception 'Save tracking details first. Confirm shipment only after the courier has collected or accepted the parcel.';
  end if;
  if p_action = 'return_to_ship' and coalesce(supplier_shipment->>'status', '') <> 'Awaiting Pickup' then
    raise exception 'Only a parcel awaiting pickup can be returned to Ready to Ship.';
  end if;
  if p_action = 'delivered' and coalesce(supplier_shipment->>'status', '') <> 'Shipped' then
    raise exception 'Mark this store shipment as shipped before marking it delivered.';
  end if;
  if p_action = 'edit_tracking' and coalesce(supplier_shipment->>'status', '') not in ('Ready to Ship', 'Shipped', 'Delivered') then
    raise exception 'Return this parcel to Ready to Ship before editing tracking details.';
  end if;
  if p_action = 'undo_delivered' and coalesce(supplier_shipment->>'status', '') <> 'Delivered' then
    raise exception 'Only a delivered shipment can be changed back to shipped.';
  end if;
  if p_action = 'return_to_pickup' and coalesce(supplier_shipment->>'status', '') not in ('Shipped', 'Delivered') then
    raise exception 'Only a shipped or delivered parcel can be returned to Awaiting Pickup.';
  end if;

  if p_action = 'save_tracking' then
    supplier_shipment := supplier_shipment || jsonb_build_object(
      'supplierName', supplier_name,
      'courier', trim(p_courier),
      'trackingNumber', trim(p_tracking_number),
      'trackingUrl', trim(coalesce(p_tracking_url, '')),
      'status', 'Awaiting Pickup',
      'trackingSavedAt', now()
    );
  elsif p_action = 'ship' then
    supplier_shipment := supplier_shipment || jsonb_build_object(
      'supplierName', supplier_name,
      'courier', trim(p_courier),
      'trackingNumber', trim(p_tracking_number),
      'trackingUrl', trim(coalesce(p_tracking_url, '')),
      'status', 'Shipped',
      'shippedAt', now()
    );
  elsif p_action = 'edit_tracking' then
    supplier_shipment := supplier_shipment || jsonb_build_object(
      'supplierName', supplier_name,
      'courier', trim(p_courier),
      'trackingNumber', trim(p_tracking_number),
      'trackingUrl', trim(coalesce(p_tracking_url, ''))
    );
    if supplier_shipment->>'status' = 'Ready to Ship' then
      supplier_shipment := supplier_shipment || jsonb_build_object('status', 'Awaiting Pickup', 'trackingSavedAt', now());
    end if;
  elsif p_action = 'return_to_ship' then
    supplier_shipment := supplier_shipment || jsonb_build_object('supplierName', supplier_name, 'status', 'Ready to Ship');
  elsif p_action = 'return_to_pickup' then
    supplier_shipment := (supplier_shipment - 'shippedAt' - 'deliveredAt') || jsonb_build_object(
      'supplierName', supplier_name,
      'status', 'Awaiting Pickup',
      'returnedToPickupAt', now()
    );
  elsif p_action = 'delivered' then
    supplier_shipment := supplier_shipment || jsonb_build_object(
      'supplierName', supplier_name,
      'status', 'Delivered',
      'deliveredAt', now()
    );
  else
    supplier_shipment := (supplier_shipment - 'deliveredAt') || jsonb_build_object(
      'supplierName', supplier_name,
      'status', 'Shipped'
    );
  end if;

  shipments := jsonb_set(shipments, array[supplier_key], supplier_shipment, true);
  next_order_status := order_row.status;
  if p_action = 'ship' and lower(coalesce(order_row.status, '')) not in ('completed', 'cancelled', 'canceled') then
    next_order_status := 'Shipped';
  elsif p_action = 'return_to_pickup' and lower(coalesce(order_row.status, '')) not in ('completed', 'cancelled', 'canceled') then
    if exists (
      select 1
      from jsonb_each(shipments) as shipment_entry(key, value)
      where shipment_entry.key <> supplier_key
        and lower(coalesce(shipment_entry.value->>'status', '')) in ('shipped', 'delivered')
    ) then
      next_order_status := 'Shipped';
    else
      next_order_status := 'Received Order';
    end if;
  end if;

  update public.marketplace_orders
  set status = next_order_status,
      details = jsonb_set(coalesce(details, '{}'::jsonb), '{supplierShipments}', shipments, true),
      updated_at = now()
  where id = order_row.id;

  return jsonb_build_object('ok', true, 'orderId', order_row.id, 'supplierShipment', supplier_shipment, 'status', next_order_status);
end;
$$;

revoke all on function public.update_marketplace_supplier_shipment(text, text, text, text, text) from public, anon;
grant execute on function public.update_marketplace_supplier_shipment(text, text, text, text, text) to authenticated;
