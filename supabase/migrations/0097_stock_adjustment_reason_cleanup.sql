-- Keep manual stock deductions separate from sales and customer returns.
-- Marketplace sales/refunds already create their own movements with order references.
create or replace function public.adjust_warehouse_inventory_lot(
  p_lot_id uuid,
  p_quantity integer,
  p_reason text,
  p_order_number text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  stock_lot public.warehouse_inventory_lots;
begin
  if auth.uid() is null then raise exception 'Sign in to adjust stock.'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Enter a quantity of at least one.'; end if;
  if p_reason not in ('Return to supplier', 'Clear expired stock', 'Damaged / lost stock', 'Stock correction', 'Other') then
    raise exception 'Choose a valid reason for the stock deduction.';
  end if;

  select * into stock_lot from public.warehouse_inventory_lots where id = p_lot_id for update;
  if not found then raise exception 'The stock batch could not be found.'; end if;
  if stock_lot.created_by <> auth.uid() then raise exception 'You can only adjust stock owned by your Store account.'; end if;
  if not exists (select 1 from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid()) then
    raise exception 'Your account does not have Store inventory access.';
  end if;
  if p_quantity > stock_lot.quantity then raise exception 'The deduction cannot exceed the batch stock currently on hand.'; end if;

  perform set_config('furgo.stock.reason', p_reason, true);
  perform set_config('furgo.stock.order_id', '', true);
  perform set_config('furgo.stock.order_number', '', true);
  perform set_config('furgo.stock.notes', coalesce(nullif(left(trim(coalesce(p_notes, '')), 500), ''), ''), true);
  update public.warehouse_inventory_lots
  set quantity = quantity - p_quantity,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_lot_id;
  perform set_config('furgo.stock.reason', '', true);
  perform set_config('furgo.stock.order_id', '', true);
  perform set_config('furgo.stock.order_number', '', true);
  perform set_config('furgo.stock.notes', '', true);
end;
$$;

revoke all on function public.adjust_warehouse_inventory_lot(uuid, integer, text, text, text) from public, anon;
grant execute on function public.adjust_warehouse_inventory_lot(uuid, integer, text, text, text) to authenticated;
