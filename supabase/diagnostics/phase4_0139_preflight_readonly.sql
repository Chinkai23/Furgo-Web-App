-- Run before applying 0139, while settings edits are paused.
-- Save the result with the release notes. Compare its fingerprints in postflight.
-- A missing settings row can be intentional. Review absent keys before cutover.
begin read only;

with keys(storage_key, payload_type) as (
  values
    ('furgo-demo-hotel-settings', 'object'),
    ('furgo-demo-daycare-settings', 'object'),
    ('furgo-demo-pet-taxi-settings', 'object'),
    ('furgo-demo-service-banners', 'object'),
    ('furgo-demo-marketplace-offers', 'object'),
    ('furgo-demo-promotions', 'array'),
    ('furgo-demo-help-center-details', 'object'),
    ('furgo-demo-home-service-shortcuts', 'array')
), settings as (
  select k.storage_key,
    count(a.record_id) as matched_rows,
    count(*) filter (where a.record_id is not null and (
      a.scope <> 'shared' or a.owner_id is not null or a.storage_key <> k.storage_key
      or a.record_id <> 'shared:' || k.storage_key || ':shared')) as noncanonical_rows,
    count(*) filter (where a.record_id is not null and jsonb_typeof(a.payload) is distinct from k.payload_type)
      as unexpected_payload_types,
    count(*) filter (where to_jsonb(a)->>'sync_version' is not null) as versioned_rows,
    max(md5(a.payload::text)) filter (where a.scope = 'shared' and a.owner_id is null
      and a.record_id = 'shared:' || k.storage_key || ':shared' and a.storage_key = k.storage_key)
      as canonical_payload_fingerprint
  from keys k
  left join public.app_data a on a.storage_key = k.storage_key
    or a.record_id = 'shared:' || k.storage_key || ':shared'
  group by k.storage_key
), metadata as (
  select
    pg_catalog.to_regprocedure('public.save_versioned_shared_app_data(uuid,text,uuid,jsonb)') as rpc,
    exists (select 1 from pg_attribute where attrelid = 'public.app_data'::regclass
      and attname = 'sync_version' and not attisdropped) as version_column_present,
    exists (select 1 from pg_attribute where attrelid = 'public.app_data'::regclass
      and attname = 'sync_version' and atttypid = 'uuid'::regtype and not attisdropped) as version_column_uuid,
    (select relrowsecurity from pg_class where oid = 'public.app_data'::regclass) as app_data_rls,
    exists (select 1 from pg_trigger where tgrelid = 'public.app_data'::regclass
      and tgname = 'stamp_shared_app_data_version' and tgenabled = 'O') as version_trigger_enabled,
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'app_data'
      and policyname like 'Versioned app data %') as version_guard_count,
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'app_data'
      and permissive = 'RESTRICTIVE' and 'authenticated' = any(roles)
      and (policyname, cmd) in (
        ('Versioned app data insert uses the settings RPC', 'INSERT'),
        ('Versioned app data update uses the settings RPC', 'UPDATE'),
        ('Versioned app data cannot be removed by clients', 'DELETE')
      )) as matching_version_guard_count,
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'app_data'
      and (policyname like 'Marketplace catalog %' or policyname like 'Marketplace legacy history %'))
      as catalog_and_legacy_order_guard_count,
    pg_catalog.to_regprocedure('public.receive_warehouse_inventory_lot(uuid,jsonb)') is not null
      and pg_catalog.to_regprocedure('public.create_marketplace_order(uuid,jsonb,bigint)') is not null
      as warehouse_and_checkout_rpcs_present,
    not (has_table_privilege('authenticated', 'public.marketplace_orders', 'INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated', 'public.marketplace_order_items', 'INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated', 'public.marketplace_checkout_requests', 'INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated', 'public.warehouse_products', 'INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated', 'public.warehouse_inventory_lots', 'INSERT,UPDATE,DELETE'))
      as phase_1_to_3_direct_writes_blocked,
    (select count(*) from public.portal_access p
      where p.level = 'director' and not public.has_role(p.user_id, 'admin')) as directors_missing_admin_grant,
    (select count(*) from public.portal_access p
      where p.level <> 'director' and public.has_role(p.user_id, 'admin')) as lower_roles_with_admin_grant,
    (select count(*) from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename in (
        'app_data', 'marketplace_orders', 'marketplace_order_items', 'marketplace_item_returns',
        'pet_hotel_bookings', 'pet_daycare_bookings', 'grooming_bookings',
        'marketplace_supplier_contacts', 'portal_notifications'
      )) as expected_realtime_table_count
)
select jsonb_pretty(jsonb_build_object(
  'stage', 'preflight',
  'metadata_checks', case when m.rpc is null and not m.version_column_present
    and not m.version_trigger_enabled and m.version_guard_count = 0
    and not exists (select 1 from settings where noncanonical_rows <> 0
      or unexpected_payload_types <> 0 or matched_rows > 1)
    and m.app_data_rls
    and m.catalog_and_legacy_order_guard_count = 7
    and m.phase_1_to_3_direct_writes_blocked
    and m.warehouse_and_checkout_rpcs_present
    and m.expected_realtime_table_count = 9
    and m.directors_missing_admin_grant = 0
    and m.lower_roles_with_admin_grant = 0
    then 'PASS' else 'HOLD' end,
  'database', current_database(),
  'settings', (select jsonb_agg(to_jsonb(s) order by storage_key) from settings s),
  'metadata', to_jsonb(m) || jsonb_build_object(
    'authenticated_can_execute', has_function_privilege('authenticated', m.rpc, 'EXECUTE'),
    'anon_can_execute', has_function_privilege('anon', m.rpc, 'EXECUTE')
  )
)) as phase4_preflight
from metadata m;

rollback;
