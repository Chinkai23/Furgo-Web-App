-- Supplier portal product listings and supplier-scoped marketplace fulfillment.

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
      lines.item || jsonb_build_object('images', coalesce(
        case when jsonb_typeof(lines.item->'images') = 'array' then lines.item->'images' end,
        product_catalog.images,
        '[]'::jsonb
      )) order by lines.line_number
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
      and lower(coalesce(nullif(trim(lines.item->>'supplierId'), ''), nullif(trim(lines.item->>'supplier'), ''), '')) = lower(access.supplier_name)
  ) supplier_lines
  where jsonb_array_length(supplier_lines.lines) > 0
  order by order_row.created_at desc;
$$;
revoke all on function public.get_marketplace_supplier_orders() from public, anon;
grant execute on function public.get_marketplace_supplier_orders() to authenticated;

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
  fully_assigned boolean;
  all_shipped boolean;
  all_delivered boolean;
  next_status text;
begin
  select access.supplier_name into supplier_name
  from public.marketplace_supplier_access access
  where access.supplier_user_id = auth.uid();
  if supplier_name is null then raise exception 'Supplier Portal access is required.'; end if;
  if coalesce(p_action, '') not in ('ship', 'delivered') then raise exception 'Choose a valid shipment action.'; end if;

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
  ) then raise exception 'This order does not contain products assigned to your supplier account.'; end if;
  if p_action = 'ship' then
    if lower(coalesce(order_row.payment_status, '')) <> 'paid' then raise exception 'Payment must be verified before shipping.'; end if;
    if coalesce(trim(p_courier), '') = '' or coalesce(trim(p_tracking_number), '') = '' then raise exception 'Courier and tracking number are required.'; end if;
    if coalesce(trim(p_tracking_url), '') <> '' and trim(p_tracking_url) !~* '^https?://' then raise exception 'Enter a valid HTTPS or HTTP tracking link.'; end if;
  end if;

  supplier_key := lower(trim(supplier_name));
  shipments := coalesce(order_row.details->'supplierShipments', '{}'::jsonb);
  supplier_shipment := coalesce(shipments->supplier_key, '{}'::jsonb);
  if p_action = 'delivered' and coalesce(supplier_shipment->>'status', '') <> 'Shipped' then
    raise exception 'Mark this supplier shipment as shipped before marking it delivered.';
  end if;
  if p_action = 'ship' and coalesce(supplier_shipment->>'status', '') = 'Delivered' then
    raise exception 'This supplier shipment is already delivered.';
  end if;

  if p_action = 'ship' then
    supplier_shipment := supplier_shipment || jsonb_build_object(
      'supplierName', supplier_name,
      'courier', trim(p_courier),
      'trackingNumber', trim(p_tracking_number),
      'trackingUrl', trim(coalesce(p_tracking_url, '')),
      'status', 'Shipped',
      'shippedAt', now()
    );
  else
    supplier_shipment := supplier_shipment || jsonb_build_object('supplierName', supplier_name, 'status', 'Delivered', 'deliveredAt', now());
  end if;
  shipments := jsonb_set(shipments, array[supplier_key], supplier_shipment, true);

  select
    not exists (
      select 1 from public.marketplace_order_items lines
      where lines.order_id = order_row.id
        and lower(coalesce(nullif(trim(lines.item->>'supplierId'), ''), nullif(trim(lines.item->>'supplier'), ''), 'unassigned')) = 'unassigned'
    ),
    exists (
      select 1 from public.marketplace_order_items lines
      where lines.order_id = order_row.id
        and lower(coalesce(nullif(trim(lines.item->>'supplierId'), ''), nullif(trim(lines.item->>'supplier'), ''), '')) <> ''
        and lower(coalesce(nullif(trim(lines.item->>'supplierId'), ''), nullif(trim(lines.item->>'supplier'), ''), '')) <> 'unassigned'
    ) and not exists (
      select 1 from (
        select distinct lower(coalesce(nullif(trim(lines.item->>'supplierId'), ''), nullif(trim(lines.item->>'supplier'), ''), '')) as name
        from public.marketplace_order_items lines where lines.order_id = order_row.id
      ) suppliers
      where coalesce(shipments->suppliers.name->>'status', '') not in ('Shipped', 'Delivered')
    ),
    exists (
      select 1 from public.marketplace_order_items lines
      where lines.order_id = order_row.id
        and lower(coalesce(nullif(trim(lines.item->>'supplierId'), ''), nullif(trim(lines.item->>'supplier'), ''), '')) <> ''
        and lower(coalesce(nullif(trim(lines.item->>'supplierId'), ''), nullif(trim(lines.item->>'supplier'), ''), '')) <> 'unassigned'
    ) and not exists (
      select 1 from (
        select distinct lower(coalesce(nullif(trim(lines.item->>'supplierId'), ''), nullif(trim(lines.item->>'supplier'), ''), '')) as name
        from public.marketplace_order_items lines where lines.order_id = order_row.id
      ) suppliers
      where coalesce(shipments->suppliers.name->>'status', '') <> 'Delivered'
    )
  into fully_assigned, all_shipped, all_delivered;

  next_status := order_row.status;
  if fully_assigned and all_delivered then
    next_status := 'Delivered';
  elsif fully_assigned and all_shipped then
    next_status := 'Shipped';
  end if;
  update public.marketplace_orders
  set details = jsonb_set(coalesce(details, '{}'::jsonb), '{supplierShipments}', shipments, true),
      status = next_status,
      updated_at = now()
  where id = order_row.id;

  return jsonb_build_object('ok', true, 'orderId', order_row.id, 'supplierShipment', supplier_shipment, 'status', next_status);
end;
$$;
revoke all on function public.update_marketplace_supplier_shipment(text, text, text, text, text) from public, anon;
grant execute on function public.update_marketplace_supplier_shipment(text, text, text, text, text) to authenticated;
