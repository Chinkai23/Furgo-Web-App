-- Clear the current Marketplace catalog and supplier portal links for a clean test setup.
-- Supplier auth users and their profiles remain intact; only Marketplace access links are removed.

begin;

delete from public.marketplace_product_submissions;
delete from public.marketplace_supplier_access;

insert into public.app_data (record_id, scope, storage_key, owner_id, payload, updated_at)
values (
  'shared:furgo-demo-marketplace-products:shared',
  'shared',
  'furgo-demo-marketplace-products',
  null,
  '[]'::jsonb,
  now()
)
on conflict (record_id) do update
set payload = excluded.payload,
    updated_at = excluded.updated_at;

commit;
