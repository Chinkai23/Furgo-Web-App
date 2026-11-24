-- Allow Store users to delete their own Warehouse product only when stock is zero.
-- If it is listed in Marketplace, remove that Store-owned listing atomically too.
-- Marketplace order snapshots and product submission audit rows are preserved.

create or replace function public.delete_store_warehouse_product(p_warehouse_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  warehouse_product public.warehouse_products;
  total_stock bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in before deleting a Warehouse product.';
  end if;

  if not exists (
    select 1 from public.marketplace_supplier_access access
    where access.supplier_user_id = auth.uid()
  ) then
    raise exception 'This account is not linked to a Store.';
  end if;

  select product.* into warehouse_product
  from public.warehouse_products product
  where product.id = p_warehouse_product_id
    and product.created_by = auth.uid()
  for update;

  if not found then
    raise exception 'This Warehouse product does not belong to your Store account.';
  end if;

  select coalesce(sum(lot.quantity), 0)::bigint into total_stock
  from public.warehouse_inventory_lots lot
  where lot.warehouse_product_id = warehouse_product.id;

  if total_stock > 0 then
    raise exception 'This product still has % units in stock. Reduce every stock batch to zero before deleting it.', total_stock;
  end if;

  if nullif(trim(warehouse_product.marketplace_product_id), '') is not null
     and exists (
       select 1
       from public.app_data catalog
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(catalog.payload) = 'array' then catalog.payload else '[]'::jsonb end
       ) as entry(value)
       where catalog.record_id = 'shared:furgo-demo-marketplace-products:shared'
         and entry.value->>'id' = warehouse_product.marketplace_product_id
     ) then
    -- This existing RPC verifies the Store owns the listing before removing it.
    perform public.manage_marketplace_supplier_product('delete', warehouse_product.marketplace_product_id);
  end if;

  -- Zero-quantity lots are safe to remove along with the product.
  delete from public.warehouse_inventory_lots lot
  where lot.warehouse_product_id = warehouse_product.id;

  delete from public.warehouse_products product
  where product.id = warehouse_product.id
    and product.created_by = auth.uid();

  return jsonb_build_object(
    'deleted', true,
    'warehouse_product_id', warehouse_product.id,
    'marketplace_product_id', warehouse_product.marketplace_product_id,
    'stock', total_stock
  );
end;
$$;

revoke all on function public.delete_store_warehouse_product(uuid) from public, anon;
grant execute on function public.delete_store_warehouse_product(uuid) to authenticated;
