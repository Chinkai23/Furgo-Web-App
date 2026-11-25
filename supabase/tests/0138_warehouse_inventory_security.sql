-- Run in a disposable database migrated through 0138. Synthetic fixtures roll back.
begin;

do $$
declare
  store_user uuid := gen_random_uuid();
  colleague uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  director uuid := gen_random_uuid();
  buyer uuid := gen_random_uuid();
  seller_user uuid := gen_random_uuid();
  seller_id uuid := gen_random_uuid();
  warehouse uuid;
  receive_request uuid := gen_random_uuid();
  adjust_request uuid := gen_random_uuid();
  received jsonb;
  adjusted jsonb;
  lot uuid;
  lot_payload jsonb;
  marketplace_id text;
  listing jsonb;
  base jsonb := '{"name":"Phase 3","description":"Original","images":[],"variants":[{"id":"a","label":"Small","price":12,"stock":0},{"id":"b","label":"Large","price":15,"stock":0}]}';
  edited jsonb;
  order_id text;
  quote_payload jsonb;
  reserved_lot uuid;
  seller_request uuid;
  legacy_request uuid;
begin
  if has_table_privilege('authenticated','public.warehouse_inventory_lots','INSERT, UPDATE, DELETE')
    or has_table_privilege('authenticated','public.warehouse_products','INSERT, UPDATE, DELETE')
    or has_table_privilege('authenticated','public.warehouse_stock_requests','SELECT, INSERT, UPDATE, DELETE')
    or has_function_privilege('authenticated','public.delete_store_warehouse_product_locked(uuid)','EXECUTE') then
    raise exception 'A direct write, request ledger or private workflow is accessible.';
  end if;
  insert into auth.users (id,email) select id, id || '@example.test'
  from unnest(array[store_user,colleague,outsider,director,buyer,seller_user]) id;
  insert into public.marketplace_supplier_access (supplier_user_id,supplier_name) values
    (store_user, 'Phase 3 Warehouse'), (colleague, 'Phase 3 Warehouse'), (outsider, 'Phase 3 Other Store');
  insert into public.user_roles(user_id,role) values (director,'admin');
  insert into public.portal_access(user_id,level) values (director,'director');
  insert into public.marketplace_seller_profiles(id,business_name) values (seller_id,'Phase 3 Seller');
  insert into public.marketplace_seller_users(seller_id,user_id) values (seller_id,seller_user);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', store_user::text, true);
  warehouse := (public.create_warehouse_product('Phase 3', base - 'name', store_user)).id;
  lot_payload := jsonb_build_object('warehouse_product_id',warehouse,'variant_id','a','quantity',5,
    'received_on','2026-11-25','created_by',store_user,'product_name','Client name');
  received := public.receive_warehouse_inventory_lot(receive_request, lot_payload);
  lot := (received->>'lot_id')::uuid;
  if public.receive_warehouse_inventory_lot(receive_request, lot_payload) <> received then
    raise exception 'Stock receipt replay returned a different result.';
  end if;
  begin
    perform public.receive_warehouse_inventory_lot(receive_request, lot_payload || '{"quantity":9}');
    raise exception 'A reused receipt ID accepted a changed request.';
  exception when sqlstate 'PT409' then null;
  end;
  perform set_config('request.jwt.claim.sub', colleague::text, true);
  adjusted := public.adjust_warehouse_inventory_lot(lot,2,'Stock correction',null,adjust_request);
  if public.adjust_warehouse_inventory_lot(lot,2,'Stock correction',null,adjust_request) <> adjusted then
    raise exception 'Adjustment replay returned a different result.';
  end if;
  begin
    perform public.adjust_warehouse_inventory_lot(lot,1,'Stock correction',null,adjust_request);
    raise exception 'A reused adjustment ID accepted changed input.';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.adjust_warehouse_inventory_lot(lot,4,'Stock correction',null,gen_random_uuid());
    raise exception 'An adjustment took stock below zero.';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.adjust_warehouse_inventory_lot(lot,1,'Stock correction');
    raise exception 'An adjustment without a request ID succeeded.';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.delete_warehouse_inventory_lot(lot);
    raise exception 'A batch was deleted while it still held stock.';
  exception when sqlstate 'PT409' then null;
  end;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  begin
    perform public.receive_warehouse_inventory_lot(gen_random_uuid(), lot_payload || jsonb_build_object('created_by', outsider));
    raise exception 'Another Store received stock against this warehouse.';
  exception when sqlstate 'PT403' then null;
  end;
  begin
    perform public.adjust_warehouse_inventory_lot(lot,1,'Other',null,gen_random_uuid());
    raise exception 'Another Store could adjust this lot.';
  exception when sqlstate 'PT403' then null;
  end;
  begin
    perform public.submit_marketplace_supplier_product('add', null, base || jsonb_build_object('warehouseProductId',warehouse));
    raise exception 'Another Store could link this warehouse product.';
  exception when sqlstate 'PT403' then null;
  end;

  perform set_config('request.jwt.claim.sub', store_user::text, true);
  marketplace_id := 'supplier-' || (public.submit_marketplace_supplier_product('add',null,
    base || jsonb_build_object('warehouseProductId',warehouse))).id;
  select value into listing from public.app_data data cross join lateral jsonb_array_elements(data.payload)
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared' and value->>'id' = marketplace_id;
  perform public.patch_marketplace_supplier_product(marketplace_id, listing, '{"ingredients":"Store edit"}');
  perform public.update_warehouse_product(warehouse,base,'{"description":"Warehouse edit"}');
  edited := (public.update_warehouse_product(warehouse,base,
    '{"variants":[{"id":"a","label":"Small","price":12,"lowStockThreshold":7},{"id":"b","label":"Large","price":15}]}')).product_data;
  if edited->>'description' <> 'Warehouse edit' or edited->'variants'->0->>'lowStockThreshold' <> '7' then
    raise exception 'An unrelated product edit was overwritten.';
  end if;
  begin
    perform public.update_warehouse_product(warehouse,base,'{"description":"Stale edit"}');
    raise exception 'A stale warehouse field was overwritten.';
  exception when sqlstate 'PT409' then null;
  end;

  perform set_config('request.jwt.claim.sub', director::text, true);
  perform public.admin_update_marketplace_product_fields(marketplace_id,'a',listing,
    '{"extraDescription":"Director edit"}','{"cost":2}');
  begin
    perform public.admin_update_marketplace_product_fields(marketplace_id,'a',listing,
      '{"description":"Stale Director edit"}','{}');
    raise exception 'A stale catalog field was overwritten.';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    update public.app_data set payload = '[]' where record_id = 'shared:furgo-demo-marketplace-products:shared';
    if found then raise exception 'Direct catalog writes remain available.'; end if;
  exception when insufficient_privilege then null;
  end;
  reset role;
  if (select quantity from public.warehouse_inventory_lots where id = lot) <> 3
    or (select product_name from public.warehouse_inventory_lots where id = lot) <> 'Phase 3'
    or (select count(*) from public.warehouse_inventory_stock_history where lot_id = lot) <> 2
    or (select sum(quantity_delta) from public.warehouse_inventory_stock_history where lot_id = lot) <> 3 then
    raise exception 'Receipt and adjustment did not commit exactly once with their stock history.';
  end if;
  insert into public.marketplace_seller_products (seller_id,warehouse_product_id) values (seller_id,warehouse);
  insert into public.marketplace_seller_product_submissions(seller_id,request_type,warehouse_product_id,product_data)
  values(seller_id,'Product Edit',warehouse,base) returning id into legacy_request;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', seller_user::text, true);
  edited := public.seller_portal_product_request_product(warehouse);
  edited := edited->'product_data' || jsonb_build_object('name',edited->>'name');
  seller_request := public.submit_seller_product_request_with_baseline(null,
    edited || '{"description":"Seller edit"}', '{"business_name":"Seller","contact_email":"seller@example.test"}', warehouse, edited);
  perform set_config('request.jwt.claim.sub', colleague::text, true);
  perform public.update_warehouse_product(warehouse,edited,'{"description":"Newer Store edit"}');
  perform set_config('request.jwt.claim.sub',director::text,true);
  begin
    perform public.admin_marketplace_seller_review_product_request(seller_request,'Approve');
    raise exception 'A pending Seller edit overwrote a newer warehouse edit.';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.admin_marketplace_seller_review_product_request(legacy_request,'Approve');
    raise exception 'A historical Seller edit was approved without a baseline.';
  exception when sqlstate 'PT409' then null;
  end;

  perform set_config('request.jwt.claim.sub',buyer::text,true);
  quote_payload := jsonb_build_object('items',jsonb_build_array(jsonb_build_object(
    'productId',marketplace_id,'variantId','a','quantity',3)),
    'address','{"name":"QA Receiver","phone":"0123456789","street":"1 Example Road","postcode":"50000","city":"Kuala Lumpur","state":"Kuala Lumpur"}'::jsonb,
    'payment','bank-transfer','transferSlip','{"name":"payment.pdf","data":"data:application/pdf;base64,JVBERg=="}'::jsonb);
  order_id := public.create_marketplace_order(gen_random_uuid(),quote_payload,4400)->'order'->>'id';
  perform set_config('request.jwt.claim.sub',store_user::text,true);
  begin
    perform public.delete_warehouse_inventory_lot(lot);
    raise exception 'A reserved lot was physically deleted.';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.delete_store_warehouse_product(warehouse);
    raise exception 'A reserved product was physically deleted.';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.update_warehouse_product(warehouse,base,'{"variants":[{"id":"b","label":"Large","price":15}]}');
    raise exception 'A reserved variant was removed.';
  exception when sqlstate 'PT409' then null;
  end;
  perform public.update_warehouse_product(warehouse,
    '{"variants":[{"id":"a","label":"Small"}]}', '{"variants":[{"id":"a","label":"Renamed"}]}');
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  perform public.cancel_marketplace_order(order_id,'Synthetic cancellation');
  reset role;
  select id into reserved_lot from public.warehouse_inventory_lots
  where warehouse_product_id = warehouse and variant = 'Renamed' and quantity = 3;
  if reserved_lot is distinct from lot
    or (select sum(quantity_delta) from public.warehouse_inventory_stock_history where lot_id = lot) <> 3
    or (select count(*) from public.warehouse_inventory_stock_history where lot_id = lot) <> 4 then
    raise exception 'Renamed batch was not restored with its original allocation and ledger.';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',store_user::text,true);
  perform public.adjust_warehouse_inventory_lot(lot,3,'Stock correction',null,gen_random_uuid());
  perform public.delete_warehouse_inventory_lot(lot);
  reset role;
  if exists (select from public.warehouse_inventory_lots where id = lot)
    or (select count(*) from public.warehouse_inventory_stock_history where original_lot_id = lot and lot_id is null) <> 5 then
    raise exception 'Eligible lot removal discarded its historical batch identity.';
  end if;
end;
$$;

rollback;
