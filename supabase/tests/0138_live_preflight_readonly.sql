-- Furgo Dev Phase 3 preflight. Run manually in SQL Editor before migration 0138.
-- Read-only: one result set. Copy all rows back for review. No personal details are returned.
with
required_tables(name) as (values
  ('warehouse_products'), ('warehouse_inventory_lots'), ('warehouse_inventory_stock_history'),
  ('marketplace_orders'), ('marketplace_order_items'), ('marketplace_item_returns'),
  ('marketplace_product_submissions'), ('marketplace_seller_product_submissions'),
  ('marketplace_seller_products'), ('marketplace_seller_restocks'), ('marketplace_seller_users'),
  ('marketplace_store_account_history'), ('marketplace_supplier_access'),
  ('marketplace_store_product_settings'), ('marketplace_seller_fee_rules'),
  ('marketplace_warehouse_fee_rules'), ('marketplace_pack_ship_fee_settings'),
  ('marketplace_pack_ship_fee_rules'), ('marketplace_fee_settings'),
  ('portal_access'), ('admin_outlets'), ('app_data')
),
required_functions(signature) as (values
  ('create_marketplace_order(uuid,jsonb,bigint)'),
  ('get_marketplace_checkout(uuid)'),
  ('adjust_warehouse_inventory_lot(uuid,integer,text,text,text)'),
  ('seller_submit_product_request(uuid,jsonb,jsonb,uuid)'),
  ('seller_portal_request_restock(uuid,integer,text)'),
  ('reorder_warehouse_inventory_lots(uuid[])'),
  ('marketplace_store_can_access_owner(uuid)'),
  ('current_portal_level(uuid)'),
  ('admin_app_data_outlet_allowed(text,text,jsonb)')
),
warehouse_variants as (
  select p.id as product_id, v.value as variant
  from public.warehouse_products p
  cross join lateral jsonb_array_elements(case when jsonb_typeof(p.product_data->'variants') = 'array'
    then p.product_data->'variants' else '[]'::jsonb end) v
),
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
  select 1 as ord, 'schema_prerequisites' as check_name,
    jsonb_build_object(
      'missing_tables', (select coalesce(jsonb_agg(name order by name), '[]'::jsonb)
        from required_tables where to_regclass('public.' || name) is null),
      'missing_functions', (select coalesce(jsonb_agg(signature order by signature), '[]'::jsonb)
        from required_functions where to_regprocedure('public.' || signature) is null),
      '0138_already_present', to_regclass('public.warehouse_stock_requests') is not null
    ) as details
  union all
  select 2, 'permissions_baseline', jsonb_build_object(
    'authenticated_table_writes', (select coalesce(jsonb_object_agg(name,
      jsonb_build_object('insert', has_table_privilege('authenticated', 'public.' || name, 'INSERT'),
        'update', has_table_privilege('authenticated', 'public.' || name, 'UPDATE'),
        'delete', has_table_privilege('authenticated', 'public.' || name, 'DELETE'))), '{}'::jsonb)
      from (values ('warehouse_products'), ('warehouse_inventory_lots'), ('marketplace_product_submissions')) t(name)),
    'portal_levels', (select coalesce(jsonb_object_agg(level::text, n), '{}'::jsonb)
      from (select level, count(*) n from public.portal_access group by level) x),
    'legacy_roles', (select coalesce(jsonb_object_agg(role::text, n), '{}'::jsonb)
      from (select role, count(*) n from public.user_roles group by role) x),
    'rls_enabled', (select coalesce(jsonb_object_agg(c.relname, c.relrowsecurity), '{}'::jsonb)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('warehouse_products','warehouse_inventory_lots',
        'marketplace_product_submissions','marketplace_seller_product_submissions',
        'marketplace_supplier_access','portal_access','admin_outlets','app_data')),
    'policy_counts', (select coalesce(jsonb_object_agg(tablename, n), '{}'::jsonb)
      from (select tablename, count(*) n from pg_policies where schemaname = 'public'
        and tablename in ('warehouse_products','warehouse_inventory_lots','marketplace_product_submissions',
          'marketplace_seller_product_submissions','marketplace_supplier_access','portal_access',
          'admin_outlets','app_data') group by tablename) x),
    'legacy_stock_rpc_authenticated', has_function_privilege('authenticated',
      'public.adjust_warehouse_inventory_lot(uuid,integer,text,text,text)','EXECUTE'),
    'portal_accounts_without_outlet', (select count(*) from public.portal_access
      where level in ('executive','manager') and outlet_id is null),
    'active_outlets', (select count(*) from public.admin_outlets where active),
    'active_store_memberships', (select count(*) from public.marketplace_store_account_history where removed_at is null),
    'seller_user_assignments', (select count(*) from public.marketplace_seller_users),
    'warehouse_products_without_active_store_owner', (select count(*) from public.warehouse_products p
      where p.created_by is null or not exists (select 1 from public.marketplace_store_account_history h
        where h.user_id = p.created_by and h.removed_at is null))
  )
  union all
  select 3, 'pending_seller_requests', jsonb_build_object(
    'pending_edits_requiring_resubmission', (select count(*) from public.marketplace_seller_product_submissions
      where request_type = 'Product Edit' and status in ('Pending Review','In Waiting List')),
    'pending_new_products', (select count(*) from public.marketplace_seller_product_submissions
      where request_type = 'New Product' and status in ('Pending Review','In Waiting List')),
    'pending_edit_product_ids', (select coalesce(jsonb_agg(warehouse_product_id order by warehouse_product_id), '[]'::jsonb)
      from public.marketplace_seller_product_submissions where request_type = 'Product Edit'
      and status in ('Pending Review','In Waiting List'))
  )
  union all
  select 4, 'legacy_variant_identity', jsonb_build_object(
    'warehouse_missing_id', (select count(*) from warehouse_variants where nullif(variant->>'id','') is null),
    'warehouse_duplicate_keys', (select count(*) from (select product_id,
      case when nullif(variant->>'id','') is not null then 'id:' || (variant->>'id')
        else 'label:' || coalesce(nullif(variant->>'label',''),'Standard') end as variant_key
      from warehouse_variants group by product_id, variant_key having count(*) > 1) d),
    'warehouse_duplicate_labels', (select count(*) from (select product_id, lower(btrim(coalesce(variant->>'label','Standard'))) label
      from warehouse_variants group by product_id, label having count(*) > 1) d),
    'warehouse_missing_id_product_ids', (select coalesce(jsonb_agg(product_id), '[]'::jsonb)
      from (select distinct product_id from warehouse_variants where nullif(variant->>'id','') is null limit 30) x),
    'catalog_missing_id', (select count(*) from catalog_variants where nullif(variant->>'id','') is null),
    'catalog_duplicate_keys', (select count(*) from (select product_id,
      case when nullif(variant->>'id','') is not null then 'id:' || (variant->>'id')
        else 'label:' || coalesce(nullif(variant->>'label',''),'Standard') end as variant_key
      from catalog_variants group by product_id, variant_key having count(*) > 1) d)
  )
  union all
  select 5, 'inventory_baseline', jsonb_build_object(
    'product_count', (select count(*) from public.warehouse_products),
    'lot_count', (select count(*) from public.warehouse_inventory_lots),
    'stock_units', (select coalesce(sum(quantity),0) from public.warehouse_inventory_lots),
    'negative_lots', (select count(*) from public.warehouse_inventory_lots where quantity < 0),
    'orphan_lots', (select count(*) from public.warehouse_inventory_lots l where l.warehouse_product_id is not null
      and not exists (select 1 from public.warehouse_products p where p.id = l.warehouse_product_id)),
    'history_rows', (select count(*) from public.warehouse_inventory_stock_history),
    'history_net_units', (select coalesce(sum(quantity_delta),0) from public.warehouse_inventory_stock_history),
    'allocated_lot_references', (select count(*) from allocations),
    'missing_allocation_lots', (select count(*) from allocations a where nullif(a.allocation->>'lot_id','') is not null
      and not exists (select 1 from public.warehouse_inventory_lots l where l.id::text = a.allocation->>'lot_id'))
  )
  union all
  select 6, 'catalog_price_baseline', jsonb_build_object(
    'listing_count', (select count(*) from public.app_data d
      cross join lateral jsonb_array_elements(case when jsonb_typeof(d.payload) = 'array'
        then d.payload else '[]'::jsonb end) p
      where d.record_id = 'shared:furgo-demo-marketplace-products:shared'),
    'variant_count', (select count(*) from catalog_variants),
    'price_fingerprint', (select md5(coalesce(string_agg(coalesce(product_id,'') || '|' ||
      coalesce(variant->>'id',variant->>'label','') || '|' || coalesce(variant->>'price',''),
      E'\n' order by product_id, coalesce(variant->>'id',variant->>'label','')), '')) from catalog_variants)
  )
  union all
  select 7, 'commercial_baseline', jsonb_build_object(
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
