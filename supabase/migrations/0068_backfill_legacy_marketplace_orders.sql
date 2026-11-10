-- Move Marketplace orders written to app_data before direct dedicated-table
-- checkout sync into the order tables used by Supplier Portal.
insert into public.marketplace_orders (
  id, user_id, reference, status, payment_status, total, outlet, details, created_at
)
select
  entry.item->>'id',
  source.owner_id,
  coalesce(nullif(entry.item->>'reference', ''), entry.item->>'id', 'Marketplace order'),
  coalesce(nullif(entry.item->>'status', ''), 'New'),
  coalesce(nullif(entry.item->>'paymentStatus', ''), 'Pending'),
  coalesce(nullif(entry.item->>'total', '')::numeric, 0),
  coalesce(nullif(entry.item->>'outlet', ''), nullif(entry.item->>'fulfillmentOutlet', ''), ''),
  entry.item - 'items',
  coalesce(nullif(entry.item->>'createdAt', '')::timestamptz, source.updated_at)
from public.app_data source
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(source.payload) = 'array' then source.payload else '[]'::jsonb end
) as entry(item)
where source.scope = 'operation'
  and source.storage_key = 'furgo-demo-marketplace-orders'
  and source.owner_id is not null
  and nullif(entry.item->>'id', '') is not null
on conflict (id) do nothing;

insert into public.marketplace_order_items (order_id, line_number, item)
select
  entry.order_record->>'id',
  item.ordinality::integer,
  item.value
from public.app_data source
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(source.payload) = 'array' then source.payload else '[]'::jsonb end
) as entry(order_record)
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(entry.order_record->'items') = 'array' then entry.order_record->'items' else '[]'::jsonb end
) with ordinality as item(value, ordinality)
join public.marketplace_orders orders on orders.id = entry.order_record->>'id'
where source.scope = 'operation'
  and source.storage_key = 'furgo-demo-marketplace-orders'
  and source.owner_id is not null
  and nullif(entry.order_record->>'id', '') is not null
on conflict (order_id, line_number) do nothing;
