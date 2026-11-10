-- Resolve PL/pgSQL ambiguity between the supplier_name variable and the
-- marketplace_supplier_access.supplier_name column in the order-item trigger.
create or replace function public.notify_suppliers_of_marketplace_order_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_reference text;
  v_supplier_name text := coalesce(nullif(trim(new.item->>'supplierId'), ''), nullif(trim(new.item->>'supplier'), ''));
  product_name text := coalesce(nullif(trim(new.item->>'name'), ''), 'a product');
begin
  if v_supplier_name is null then return new; end if;

  select orders.reference into order_reference
  from public.marketplace_orders orders
  where orders.id = new.order_id;
  if order_reference is null then order_reference := new.order_id; end if;

  insert into public.portal_notifications (recipient_user_id, event_type, title, message, entity_id)
  select access.supplier_user_id,
         'marketplace_order',
         'New marketplace order',
         'Order ' || order_reference || ' includes ' || product_name || '.',
         new.order_id || ':' || access.supplier_user_id::text
  from public.marketplace_supplier_access access
  where lower(trim(access.supplier_name)) = lower(trim(v_supplier_name))
  on conflict (recipient_user_id, event_type, entity_id) do nothing;
  return new;
end;
$$;
