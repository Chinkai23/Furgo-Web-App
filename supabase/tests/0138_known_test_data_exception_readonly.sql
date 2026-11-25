-- Run manually in Furgo Dev SQL Editor. Read-only; return every row for review.
with broken as (
  select o.id order_id, o.reference, o.status, o.payment_status, o.payment_channel,
    o.details, i.line_number, a.ordinality allocation_number, a.value allocation,
    nullif(a.value->>'warehouse_product_id','') source_product_id
  from public.marketplace_order_items i
  join public.marketplace_orders o on o.id = i.order_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(i.item->'warehouseStockAllocations') = 'array'
    then i.item->'warehouseStockAllocations' else '[]'::jsonb end) with ordinality a(value, ordinality)
  where nullif(a.value->>'lot_id','') is not null
    and not exists (select 1 from public.warehouse_inventory_lots l where l.id::text = a.value->>'lot_id')
    and nullif(a.value->>'warehouse_product_id','') is not null
    and not exists (select 1 from public.warehouse_products p where p.id::text = a.value->>'warehouse_product_id')
), listing_refs as (
  select b.source_product_id, count(*) as purchasable_options
  from (select distinct source_product_id from broken) b
  join public.app_data d on d.record_id = 'shared:furgo-demo-marketplace-products:shared'
  cross join lateral jsonb_array_elements(case when jsonb_typeof(d.payload) = 'array' then d.payload else '[]'::jsonb end) p
  cross join lateral jsonb_array_elements(case when jsonb_typeof(p.value->'variants') = 'array'
    then p.value->'variants' else '[]'::jsonb end) v
  where coalesce(nullif(v.value->>'warehouseProductId',''),nullif(p.value->>'warehouseProductId','')) = b.source_product_id
    and p.value->>'hidden' is distinct from 'true' and p.value->>'frozenByAdmin' is distinct from 'true'
    and v.value->>'frozen' is distinct from 'true'
  group by b.source_product_id
)
select b.order_id, b.reference, b.line_number, b.allocation_number,
  b.allocation->>'lot_id' missing_lot_id, b.source_product_id missing_product_id,
  b.allocation->>'quantity' allocated_units, b.status order_status,
  b.payment_status, b.payment_channel, b.details->>'refundStatus' refund_status,
  b.details->>'warehouseInventoryReservedAt' reserved_at,
  b.details->>'warehouseInventoryReleasedAt' released_at,
  (b.details ? 'warehouseInventoryReservedAt' and not b.details ? 'warehouseInventoryReleasedAt') restoration_possible,
  (select coalesce(jsonb_agg(jsonb_build_object('status',r.status,'line_number',r.line_number)), '[]'::jsonb)
    from public.marketplace_item_returns r where r.order_id = b.order_id and r.line_number = b.line_number) return_statuses,
  coalesce(l.purchasable_options,0) purchasable_options_using_missing_product,
  'Confirm test ownership, real-world fulfillment, payment/refund obligations, and whether this order will ever be processed; database fields alone cannot prove these.' manual_confirmation
from broken b left join listing_refs l on l.source_product_id = b.source_product_id
order by b.order_id, b.line_number, b.allocation_number;
