-- Admin-only warehouse totals for the Manage Store directory.
-- The function is security-definer so admins can see counts without opening warehouse rows.
create or replace function public.get_marketplace_store_warehouse_summaries()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  summaries jsonb;
begin
  if public.current_portal_level(auth.uid()) < 3 then
    raise exception 'Only Directors can view Store warehouse summaries.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'store_key', stores.store_key,
      'store_name', stores.store_name,
      'product_types', coalesce(products.product_types, 0),
      'total_stock', coalesce(stock.total_stock, 0)
    ) order by stores.store_name
  ), '[]'::jsonb)
  into summaries
  from (
    select lower(btrim(access.supplier_name)) as store_key,
      min(btrim(access.supplier_name)) as store_name,
      array_agg(access.supplier_user_id) as member_ids
    from public.marketplace_supplier_access access
    group by lower(btrim(access.supplier_name))
  ) stores
  left join lateral (
    select count(*)::integer as product_types
    from public.warehouse_products product
    where product.created_by = any(stores.member_ids)
  ) products on true
  left join lateral (
    select coalesce(sum(lot.quantity), 0)::bigint as total_stock
    from public.warehouse_inventory_lots lot
    where lot.created_by = any(stores.member_ids)
      or lot.warehouse_product_id in (
        select product.id from public.warehouse_products product
        where product.created_by = any(stores.member_ids)
      )
  ) stock on true;

  return summaries;
end;
$$;
revoke all on function public.get_marketplace_store_warehouse_summaries() from public, anon;
grant execute on function public.get_marketplace_store_warehouse_summaries() to authenticated;

