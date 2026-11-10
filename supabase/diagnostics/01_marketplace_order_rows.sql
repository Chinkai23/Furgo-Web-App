-- STEP 1 — Check whether Marketplace order headers and product rows exist.
-- Run this query first in Supabase SQL Editor. Read-only; it changes no data.

select
  orders.id as order_id,
  orders.reference,
  orders.created_at,
  orders.status,
  count(items.line_number) as item_row_count
from public.marketplace_orders orders
left join public.marketplace_order_items items on items.order_id = orders.id
where orders.created_at >= now() - interval '1 year'
group by orders.id, orders.reference, orders.created_at, orders.status
order by orders.created_at desc
limit 100;
