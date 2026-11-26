-- Disposable databases only. All fixtures roll back.
begin;

do $$
declare
  director uuid := gen_random_uuid();
  manager uuid := gen_random_uuid();
  store_user uuid := gen_random_uuid();
  buyer uuid := gen_random_uuid();
  outlet_a uuid := gen_random_uuid();
  outlet_b uuid := gen_random_uuid();
  key text := 'furgo-demo-pet-taxi-settings';
  row_id text := 'shared:furgo-demo-pet-taxi-settings:shared';
  version uuid;
  next_version uuid;
  actor uuid;
  other_key text;
  other_version uuid;
  other_payload jsonb;
  unrelated_order text := 'phase4-unrelated-' || gen_random_uuid();
  unrelated_before jsonb;
  catalog_before jsonb;
  unrelated_setting jsonb;
begin
  if has_function_privilege('anon', 'public.save_versioned_shared_app_data(uuid,text,uuid,jsonb)', 'EXECUTE') then
    raise exception 'Anonymous access to the settings RPC.';
  end if;
  insert into auth.users(id, email)
  select id, id || '@example.test' from unnest(array[director, manager, store_user, buyer]) id;
  insert into public.user_roles(user_id, role) values (director, 'admin'), (manager, 'staff');
  insert into public.admin_outlets(id, name, shortform) values
    (outlet_a, 'Phase 4 North', 'P4N'), (outlet_b, 'Phase 4 South', 'P4S');
  insert into public.portal_access(user_id, level, outlet_id)
  values (director, 'director', null), (manager, 'manager', outlet_a);
  insert into public.marketplace_supplier_access(supplier_user_id, supplier_name)
  values (store_user, 'Phase 4 Store');
  insert into public.marketplace_orders(id, user_id, reference, status, payment_status, outlet, total)
  values (unrelated_order, buyer, unrelated_order, 'Shipped', 'Paid', 'Phase 4 South', 15);
  insert into public.marketplace_order_items(order_id, line_number, item)
  values (unrelated_order, 1, '{"name":"Synthetic unrelated item","quantity":1}');
  select jsonb_build_array(to_jsonb(o), to_jsonb(i)) into unrelated_before
  from public.marketplace_orders o join public.marketplace_order_items i on i.order_id = o.id
  where o.id = unrelated_order;
  select to_jsonb(a) into catalog_before from public.app_data a
  where record_id = 'shared:furgo-demo-marketplace-products:shared';
  insert into public.app_data(record_id, scope, storage_key, payload)
  values ('phase4-unrelated-setting', 'shared', 'phase4-unrelated-setting', '{"marker":1}');
  select to_jsonb(a) into unrelated_setting from public.app_data a
  where record_id = 'phase4-unrelated-setting';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', director::text, true);
  version := public.save_versioned_shared_app_data(director, key, null, '{"routes":[]}');
  next_version := public.save_versioned_shared_app_data(director, key, version, '{"routes":[{"outlet":"Phase 4 South"}]}');
  if next_version is null or next_version = version then raise exception 'Version did not advance.'; end if;

  begin
    perform public.save_versioned_shared_app_data(director, key, version, '{"routes":[{"outlet":"stale"}]}');
    raise exception 'Stale write succeeded.';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.save_versioned_shared_app_data(director, key, version, '{"routes":[{"outlet":"Phase 4 South"}]}');
    raise exception 'Replaying the original baseline after a lost response applied the write again.';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.save_versioned_shared_app_data(director, key, null, '{"routes":[]}');
    raise exception 'An expected-absent write replaced an existing row.';
  exception when sqlstate 'PT409' then null;
  end;
  if not exists (select 1 from public.app_data where record_id = row_id
    and sync_version = next_version and payload = '{"routes":[{"outlet":"Phase 4 South"}]}') then
    raise exception 'A rejected write changed the winning document.';
  end if;
  foreach actor in array array[manager, store_user, buyer] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    begin
      perform public.save_versioned_shared_app_data(actor, key, next_version, '{"routes":[{"outlet":"Phase 4 South","fare":1}]}');
      raise exception 'An outlet Manager, Store or customer changed global settings.';
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.save_versioned_shared_app_data(director, key, next_version, '{"routes":[]}');
      raise exception 'A browser supplied another account as the actor.';
    exception when insufficient_privilege then null;
    end;
  end loop;
  perform set_config('request.jwt.claim.sub', director::text, true);
  update public.app_data set payload = '{}', sync_version = gen_random_uuid() where record_id = row_id;
  if found then raise exception 'Legacy direct update was allowed.'; end if;
  delete from public.app_data where record_id = row_id;
  if found then raise exception 'Legacy direct delete was allowed.'; end if;
  begin
    insert into public.app_data(record_id, scope, storage_key, payload) values(row_id, 'shared', key, '{}')
    on conflict(record_id) do update set payload = excluded.payload;
    raise exception 'Legacy upsert was allowed.';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.app_data(record_id, scope, storage_key, payload)
    values('shared:furgo-demo-service-banners:shared', 'shared', 'furgo-demo-service-banners', '{}');
    raise exception 'Legacy direct insert was allowed.';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.app_data(record_id, scope, storage_key, owner_id, payload)
    values('spoofed-identity', 'customer', key, director, '{}');
    raise exception 'A versioned key could be written under a different scope.';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.app_data set storage_key = key where record_id = 'phase4-unrelated-setting';
    raise exception 'An unrelated row could be relabeled to use a versioned key.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_versioned_shared_app_data(director, 'furgo-demo-marketplace-products', null, '[]');
    raise exception 'The settings RPC accepted the protected catalog.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_versioned_shared_app_data(director, 'furgo-demo-marketplace-orders', null, '[]');
    raise exception 'The settings RPC accepted protected marketplace orders.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_versioned_shared_app_data(director, 'furgo-demo-credit-balance', null, '{}');
    raise exception 'The settings RPC accepted customer wallet data.';
  exception when invalid_parameter_value then null;
  end;
  update public.app_data set payload = '[]' where record_id = 'shared:furgo-demo-marketplace-products:shared';
  if found then raise exception 'Generic catalog update bypassed 0138.'; end if;
  begin
    insert into public.app_data(record_id, scope, storage_key, owner_id, payload)
    values('operation:furgo-demo-marketplace-orders:' || buyer, 'operation', 'furgo-demo-marketplace-orders', buyer, '[]');
    raise exception 'Generic Marketplace order insert bypassed 0137.';
  exception when insufficient_privilege then null;
  end;
  foreach other_key in array array[
    'furgo-demo-hotel-settings', 'furgo-demo-daycare-settings', 'furgo-demo-service-banners',
    'furgo-demo-marketplace-offers', 'furgo-demo-promotions',
    'furgo-demo-help-center-details', 'furgo-demo-home-service-shortcuts'
  ] loop
    select sync_version into other_version from public.app_data
    where record_id = 'shared:' || other_key || ':shared';
    other_payload := case when other_key in ('furgo-demo-promotions', 'furgo-demo-home-service-shortcuts')
      then '[]'::jsonb else '{}'::jsonb end;
    next_version := public.save_versioned_shared_app_data(director, other_key, other_version, other_payload);
    if not exists (select 1 from public.app_data where record_id = 'shared:' || other_key || ':shared'
      and sync_version = next_version and payload = other_payload) then
      raise exception 'Authorized write did not persist for %.', other_key;
    end if;
  end loop;
  if has_table_privilege('authenticated','public.warehouse_inventory_lots','INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.marketplace_checkout_requests','INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.marketplace_orders','INSERT,UPDATE,DELETE') then
    raise exception 'A protected Phase 1–3 table permits direct writes.';
  end if;
  reset role;

  if unrelated_before is distinct from (select jsonb_build_array(to_jsonb(o), to_jsonb(i))
    from public.marketplace_orders o join public.marketplace_order_items i on i.order_id = o.id where o.id = unrelated_order)
    or catalog_before is distinct from (select to_jsonb(a) from public.app_data a where record_id = 'shared:furgo-demo-marketplace-products:shared')
    or unrelated_setting is distinct from (select to_jsonb(a) from public.app_data a where record_id = 'phase4-unrelated-setting') then
    raise exception 'A settings write changed an unrelated order, line item, catalog or app_data row.';
  end if;
end;
$$;
rollback;
