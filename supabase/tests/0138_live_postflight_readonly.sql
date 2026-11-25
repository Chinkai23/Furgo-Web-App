-- Furgo Dev Phase 3 postflight. Run manually after migration 0138 and frontend cutover.
-- Read-only. Compare baseline rows with 0138_live_preflight_readonly.sql.
with
catalog_variants as (
  select p.value->>'id' as product_id, v.value as variant
  from public.app_data d
  cross join lateral jsonb_array_elements(case when jsonb_typeof(d.payload) = 'array'
    then d.payload else '[]'::jsonb end) p
  cross join lateral jsonb_array_elements(case when jsonb_typeof(p.value->'variants') = 'array'
    then p.value->'variants' else '[]'::jsonb end) v
  where d.record_id = 'shared:furgo-demo-marketplace-products:shared'
),
allocations as (
  select i.order_id, a.value as allocation
  from public.marketplace_order_items i
  cross join lateral jsonb_array_elements(case when jsonb_typeof(i.item->'warehouseStockAllocations') = 'array'
    then i.item->'warehouseStockAllocations' else '[]'::jsonb end) a
),
checks as (
  select 1 as ord, '0138_schema' as check_name, jsonb_build_object(
    'stock_request_table', to_regclass('public.warehouse_stock_requests') is not null,
    'receive_rpc', to_regprocedure('public.receive_warehouse_inventory_lot(uuid,jsonb)') is not null,
    'adjust_rpc', to_regprocedure('public.adjust_warehouse_inventory_lot(uuid,integer,text,text,uuid)') is not null,
    'catalog_patch_rpc', to_regprocedure('public.patch_marketplace_supplier_product(text,jsonb,jsonb)') is not null,
    'seller_baseline_rpc', to_regprocedure('public.submit_seller_product_request_with_baseline(uuid,jsonb,jsonb,uuid,jsonb)') is not null,
    'history_source_columns', (select count(*) = 2 from information_schema.columns
      where table_schema = 'public' and table_name = 'warehouse_inventory_stock_history'
        and column_name in ('original_lot_id','original_warehouse_product_id')),
    'seller_baseline_column', exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'marketplace_seller_product_submissions'
        and column_name = 'warehouse_edit_baseline')
  ) as details
  union all
  select 2, '0138_permissions', jsonb_build_object(
    'warehouse_products_direct_write',
      has_table_privilege('authenticated','public.warehouse_products','INSERT') or
      has_table_privilege('authenticated','public.warehouse_products','UPDATE') or
      has_table_privilege('authenticated','public.warehouse_products','DELETE'),
    'warehouse_lots_direct_write',
      has_table_privilege('authenticated','public.warehouse_inventory_lots','INSERT') or
      has_table_privilege('authenticated','public.warehouse_inventory_lots','UPDATE') or
      has_table_privilege('authenticated','public.warehouse_inventory_lots','DELETE'),
    'submissions_direct_write',
      has_table_privilege('authenticated','public.marketplace_product_submissions','INSERT') or
      has_table_privilege('authenticated','public.marketplace_product_submissions','UPDATE') or
      has_table_privilege('authenticated','public.marketplace_product_submissions','DELETE'),
    'stock_requests_direct_read', has_table_privilege('authenticated','public.warehouse_stock_requests','SELECT'),
    'receive_rpc_authenticated', has_function_privilege('authenticated',
      'public.receive_warehouse_inventory_lot(uuid,jsonb)','EXECUTE'),
    'receive_rpc_anon', has_function_privilege('anon',
      'public.receive_warehouse_inventory_lot(uuid,jsonb)','EXECUTE'),
    'catalog_write_policies', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'app_data'
      and policyname in ('Marketplace catalog changes use RPCs','Marketplace catalog creation uses RPCs',
        'Marketplace catalog removal uses RPCs'))
  )
  union all
  select 3, 'inventory_baseline', jsonb_build_object(
    'product_count', (select count(*) from public.warehouse_products),
    'lot_count', (select count(*) from public.warehouse_inventory_lots),
    'stock_units', (select coalesce(sum(quantity),0) from public.warehouse_inventory_lots),
    'negative_lots', (select count(*) from public.warehouse_inventory_lots where quantity < 0),
    'history_rows', (select count(*) from public.warehouse_inventory_stock_history),
    'history_net_units', (select coalesce(sum(quantity_delta),0) from public.warehouse_inventory_stock_history),
    'allocated_lot_references', (select count(*) from allocations),
    'missing_allocation_lots', (select count(*) from allocations a where nullif(a.allocation->>'lot_id','') is not null
      and not exists (select 1 from public.warehouse_inventory_lots l where l.id::text = a.allocation->>'lot_id'))
  )
  union all
  select 4, 'catalog_price_baseline', jsonb_build_object(
    'variant_count', (select count(*) from catalog_variants),
    'price_fingerprint', (select md5(coalesce(string_agg(coalesce(product_id,'') || '|' ||
      coalesce(variant->>'id',variant->>'label','') || '|' || coalesce(variant->>'price',''),
      E'\n' order by product_id, coalesce(variant->>'id',variant->>'label','')), '')) from catalog_variants)
  )
  union all
  select 5, 'commercial_baseline', jsonb_build_object(
    'store_approval_required', (select approval_required from public.marketplace_store_product_settings
      where setting_key = 'store_product_approval'),
    'marketplace_fee_percent', (select fee_percent from public.marketplace_fee_settings where singleton),
    'pack_ship_divisor', (select volumetric_divisor from public.marketplace_pack_ship_fee_settings where singleton),
    'warehouse_fee_rules', (select count(*) from public.marketplace_warehouse_fee_rules),
    'warehouse_fee_fingerprint', (select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]'))
      from public.marketplace_warehouse_fee_rules t),
    'pack_ship_fee_rules', (select count(*) from public.marketplace_pack_ship_fee_rules),
    'pack_ship_fee_fingerprint', (select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]'))
      from public.marketplace_pack_ship_fee_rules t),
    'seller_fee_rules', (select count(*) from public.marketplace_seller_fee_rules),
    'seller_fee_fingerprint', (select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]'))
      from public.marketplace_seller_fee_rules t)
  )
)
select check_name, details from checks order by ord;
