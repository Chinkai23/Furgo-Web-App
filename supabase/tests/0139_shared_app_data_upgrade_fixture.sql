-- Disposable upgrade database only. Run before 0139.
begin;
insert into public.app_data (record_id, scope, storage_key, payload, updated_at)
values
  ('shared:furgo-demo-help-center-details:shared', 'shared', 'furgo-demo-help-center-details',
   '{"aboutUs":"Legacy synthetic text","extra":{"retained":true}}', '2026-01-02T03:04:05Z'),
  ('shared:furgo-demo-home-service-shortcuts:shared', 'shared', 'furgo-demo-home-service-shortcuts',
   '["hotel","grooming"]', '2026-01-02T03:04:05Z'),
  ('phase4-disposable-unrelated', 'shared', 'phase4-disposable-unrelated',
   '{"untouched":true}', '2026-01-02T03:04:05Z');

create table public.phase4_test_upgrade_fingerprints as
select record_id, to_jsonb(a) as previous
from public.app_data a
where record_id in (
  'shared:furgo-demo-help-center-details:shared',
  'shared:furgo-demo-home-service-shortcuts:shared',
  'phase4-disposable-unrelated'
);
commit;
