-- Expose read-only stock batches and movement history only for products
-- mapped to the authenticated seller. Sellers never receive customer data.
create or replace function public.seller_portal_inventory_stock_details()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  seller_scope uuid := public.seller_portal_require_scope();
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'seller_product_id', seller_product.id,
        'warehouse_product_id', seller_product.warehouse_product_id,
        'batches', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', lot.id,
            'variant', coalesce(nullif(lot.variant, ''), 'Standard'),
            'batch_number', lot.batch_number,
            'quantity', lot.quantity,
            'received_on', lot.received_on,
            'expires_on', lot.expires_on,
            'location', lot.location,
            'notes', lot.notes,
            'pick_order', lot.pick_order
          ) order by lot.pick_order, lot.expires_on asc nulls last, lot.received_on, lot.created_at)
          from public.warehouse_inventory_lots lot
          where lot.warehouse_product_id = seller_product.warehouse_product_id
        ), '[]'::jsonb),
        'history', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', movement.id,
            'lot_id', movement.lot_id,
            'variant', coalesce(nullif(movement.variant, ''), 'Standard'),
            'batch_number', movement.batch_number,
            'quantity_delta', movement.quantity_delta,
            'quantity_before', movement.quantity_before,
            'quantity_after', movement.quantity_after,
            'reason', movement.reason,
            'order_number', movement.order_number,
            'notes', movement.notes,
            'created_at', movement.created_at
          ) order by movement.created_at desc)
          from public.warehouse_inventory_stock_history movement
          where movement.warehouse_product_id = seller_product.warehouse_product_id
        ), '[]'::jsonb)
      ) order by warehouse_product.name
    )
    from public.marketplace_seller_products seller_product
    join public.warehouse_products warehouse_product
      on warehouse_product.id = seller_product.warehouse_product_id
    where seller_product.seller_id = seller_scope
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.seller_portal_inventory_stock_details() from public, anon;
grant execute on function public.seller_portal_inventory_stock_details() to authenticated;
