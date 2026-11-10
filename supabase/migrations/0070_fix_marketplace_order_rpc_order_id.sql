-- Fix PL/pgSQL ambiguity between the Marketplace order id variable and the
-- marketplace_order_items.order_id column in create_marketplace_order.

create or replace function public.create_marketplace_order(p_order jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  v_order_id text := nullif(p_order->>'id', '');
  existing_owner uuid;
begin
  if actor_id is null then
    raise exception 'Sign in before placing a Marketplace order.';
  end if;
  if v_order_id is null then
    raise exception 'Marketplace order id is required.';
  end if;
  if jsonb_typeof(p_order->'items') is distinct from 'array' then
    raise exception 'Marketplace order must contain a product list.';
  end if;
  if jsonb_array_length(p_order->'items') = 0 then
    raise exception 'Marketplace order must contain at least one product.';
  end if;

  insert into public.marketplace_orders (
    id, user_id, reference, status, payment_status, total, outlet, details, created_at, updated_at
  ) values (
    v_order_id,
    actor_id,
    coalesce(nullif(p_order->>'reference', ''), v_order_id),
    coalesce(nullif(p_order->>'status', ''), 'New Order'),
    coalesce(nullif(p_order->>'paymentStatus', ''), 'Pending'),
    coalesce(nullif(p_order->>'total', '')::numeric, 0),
    coalesce(nullif(p_order->>'outlet', ''), nullif(p_order->>'fulfillmentOutlet', ''), ''),
    p_order - 'items' - 'userId' - '_cloudOwnerId',
    coalesce(nullif(p_order->>'createdAt', '')::timestamptz, now()),
    now()
  ) on conflict (id) do nothing;

  select orders.user_id into existing_owner
  from public.marketplace_orders orders
  where orders.id = v_order_id
  for update;

  if existing_owner is distinct from actor_id then
    raise exception 'This Marketplace order belongs to another account.';
  end if;

  insert into public.marketplace_order_items (order_id, line_number, item)
  select v_order_id, product.ordinality::integer, product.value
  from jsonb_array_elements(p_order->'items') with ordinality as product(value, ordinality)
  on conflict (order_id, line_number) do nothing;
end;
$$;

revoke all on function public.create_marketplace_order(jsonb) from public, anon;
grant execute on function public.create_marketplace_order(jsonb) to authenticated;
