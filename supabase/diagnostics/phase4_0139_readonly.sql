-- Read-only preflight/postflight. Output contains counts and metadata only.
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
  select keys.storage_key, count(a.record_id) as matched_rows,
    count(*) filter (where a.record_id is not null and
      (a.scope <> 'shared' or a.owner_id is not null or a.storage_key <> keys.storage_key
       or a.record_id <> 'shared:' || keys.storage_key || ':shared')) as noncanonical_rows,
    count(*) filter (where a.record_id is not null and jsonb_typeof(a.payload) <> keys.payload_type) as unexpected_payload_types,
    count(*) filter (where to_jsonb(a)->>'sync_version' is not null) as versioned_rows
  from keys
  left join public.app_data a on a.storage_key = keys.storage_key
    or a.record_id = 'shared:' || keys.storage_key || ':shared'
  group by keys.storage_key
), rpc as (
  select to_regprocedure('public.save_versioned_shared_app_data(uuid,text,uuid,jsonb)') as oid
)
select jsonb_build_object(
  'settings', (select jsonb_agg(to_jsonb(s) order by storage_key) from settings s),
  'settings_rpc_installed', rpc.oid is not null,
  'authenticated_can_execute', has_function_privilege('authenticated', rpc.oid, 'EXECUTE'),
  'anon_can_execute', has_function_privilege('anon', rpc.oid, 'EXECUTE'),
  'direct_write_guards', (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'app_data' and policyname like 'Versioned app data %'
      and permissive = 'RESTRICTIVE'),
  'version_trigger_enabled', exists (select 1 from pg_trigger
    where tgrelid = 'public.app_data'::regclass and tgname = 'stamp_shared_app_data_version'
      and tgenabled = 'O'),
  'catalog_and_order_guards', (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'app_data'
      and (policyname like 'Marketplace catalog %' or policyname like 'Marketplace legacy history %')),
  'app_data_realtime_published', exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_data'),
  'directors_missing_admin_grant', (select count(*) from public.portal_access p
    where p.level = 'director' and not public.has_role(p.user_id, 'admin')),
  'lower_portal_roles_with_admin_grant', (select count(*) from public.portal_access p
    where p.level <> 'director' and public.has_role(p.user_id, 'admin'))
) as phase4_shared_settings
from rpc;

rollback;
