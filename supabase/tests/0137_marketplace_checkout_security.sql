-- Run after 0137 on a disposable database. All fixtures roll back.
begin;

do $$
declare
  buyer uuid := gen_random_uuid();
  other_buyer uuid := gen_random_uuid();
  director uuid := gen_random_uuid();
  seller_user uuid := gen_random_uuid();
  seller uuid := gen_random_uuid();
  warehouse_a uuid := gen_random_uuid();
  warehouse_b uuid := gen_random_uuid();
  lot_a uuid := gen_random_uuid();
  lot_b uuid := gen_random_uuid();
  product_a text := 'checkout-a-' || gen_random_uuid();
  product_b text := 'checkout-b-' || gen_random_uuid();
  reward uuid := gen_random_uuid();
  expired_reward uuid := gen_random_uuid();
  mine text := 'FCV-MINE-' || upper(substr(gen_random_uuid()::text, 1, 8));
  theirs text := 'FCV-THEIRS-' || upper(substr(gen_random_uuid()::text, 1, 8));
  expired text := 'FCV-EXPIRED-' || upper(substr(gen_random_uuid()::text, 1, 8));
  other_category text := 'FCV-GROOMING-' || upper(substr(gen_random_uuid()::text, 1, 8));
  request_id uuid := gen_random_uuid();
  bank_request uuid := gen_random_uuid();
  wallet_request uuid := gen_random_uuid();
  limited_request uuid := gen_random_uuid();
  owned_request uuid := gen_random_uuid();
  address jsonb := '{"name":"Receiver", "phone":"0123456789", "street":"1 Example Road", "postcode":"50000", "city":"Kuala Lumpur", "state":"Kuala Lumpur"}';
  slip jsonb := '{"name":"payment.pdf", "data":"data:application/pdf;base64,JVBERg=="}';
  items jsonb;
  one_item jsonb;
  checkout_payload jsonb;
  bank_payload jsonb;
  demo_payload jsonb;
  before_bank_lot integer;
  new_order text;
  bank_order text;
  wallet_order text;
  result jsonb;
  replay jsonb;
  code text;
  bad_items jsonb;
  version_at_checkout bigint;
  return_id uuid := gen_random_uuid();
  incoming text := '[{"id":"browser-only","userId":"forged","items":[]}]';
begin
  if has_function_privilege('authenticated', 'public.create_marketplace_order(jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.quote_marketplace_order(jsonb,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.create_marketplace_order(uuid,jsonb,bigint)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_marketplace_checkout(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.marketplace_checkout_snapshot(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.allocate_marketplace_order_inventory(text)', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.marketplace_checkout_requests', 'SELECT, INSERT, UPDATE, DELETE')
    or has_table_privilege('authenticated', 'public.marketplace_voucher_uses', 'SELECT, INSERT, UPDATE, DELETE')
    or has_table_privilege('authenticated', 'public.marketplace_legacy_history_intake', 'SELECT, INSERT, UPDATE, DELETE')
    or has_table_privilege('authenticated', 'public.marketplace_legacy_verified_history', 'SELECT, INSERT, UPDATE, DELETE')
    or has_function_privilege('anon', 'public.get_marketplace_legacy_history()', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.marketplace_orders', 'INSERT, UPDATE, DELETE')
    or has_table_privilege('authenticated', 'public.marketplace_order_items', 'INSERT, UPDATE, DELETE') then
    raise exception 'A legacy or private checkout path remains accessible.';
  end if;

  insert into auth.users(id, email)
  select id, id || '@example.test' from unnest(array[buyer, other_buyer, director, seller_user]) id;
  insert into public.user_roles(user_id, role) values(director, 'admin');
  insert into public.portal_access(user_id, level) values(director, 'director');
  insert into public.marketplace_seller_profiles(id, business_name) values(seller, 'QA checkout seller');
  insert into public.marketplace_seller_users(seller_id, user_id) values(seller, seller_user);

  insert into public.warehouse_products(id, name, product_data, marketplace_product_id, created_by) values
    (warehouse_a, 'Product A', '{"variants":[{"id":"a","label":"Standard"}]}', product_a, director),
    (warehouse_b, 'Product B', '{"variants":[{"id":"a","label":"Standard"}]}', product_b, director);
  insert into public.warehouse_inventory_lots(id, warehouse_product_id, product_name, variant, quantity, created_by)
  values(lot_a, warehouse_a, 'Product A', 'Standard', 4, director),
    (lot_b, warehouse_b, 'Product B', 'Standard', 4, director);
  insert into public.marketplace_seller_products(seller_id, warehouse_product_id, marketplace_product_id)
    values(seller, warehouse_a, product_a), (seller, warehouse_b, product_b);
  insert into public.marketplace_seller_fee_rules(seller_id, commission_percent, service_fee_per_unit)
    values(seller, 7.5, .25);

  insert into public.app_data(record_id, scope, storage_key, payload)
  values ('shared:furgo-demo-marketplace-products:shared', 'shared', 'furgo-demo-marketplace-products', '[]')
  on conflict (record_id) do nothing;
  update public.app_data set payload = payload || jsonb_build_array(
    jsonb_build_object('id', product_a, 'name', 'Product A', 'warehouseProductId', warehouse_a,
      'variants', '[{"id":"a","label":"Standard","price":19.99,"cost":2,"supplierId":"QA Store"},{"id":"alias","label":"Standard","price":19.99},{"id":"frozen","label":"Standard","price":1,"frozen":true}]'::jsonb),
    jsonb_build_object('id', product_b, 'name', 'Product B', 'warehouseProductId', warehouse_b,
      'variants', '[{"id":"a","label":"Standard","price":12.34,"cost":2,"supplierId":"QA Store"},{"id":"free","label":"Standard","price":0}]'::jsonb))
  where record_id = 'shared:furgo-demo-marketplace-products:shared';
  insert into public.app_data(record_id, scope, storage_key, payload)
  values('shared:furgo-demo-marketplace-offers:shared', 'shared', 'furgo-demo-marketplace-offers',
    jsonb_build_object('deliveryFee', 8, 'freeShippingMinimum', 80, 'furgoVouchers', jsonb_build_array(
      '{"id":"percent","code":"PERCENT","enabled":true,"discountType":"percent","discountValue":10,"minimumSpend":50}'::jsonb,
      '{"code":"FIXED","enabled":true,"discountType":"fixed","discountValue":75}'::jsonb,
      '{"code":"SHIP","enabled":true,"discountType":"free_shipping"}'::jsonb,
      '{"code":"BAD","enabled":true,"discountType":"percent","discountValue":100.01}'::jsonb,
      '{"code":"NEGATIVE","enabled":true,"discountType":"fixed","discountValue":-1}'::jsonb,
      '{"code":"DISABLED","enabled":false,"discountType":"fixed","discountValue":1}'::jsonb,
      '{"code":"LIMITED","enabled":true,"discountType":"fixed","discountValue":1,"maxUses":1}'::jsonb,
      '{"code":"PERBUYER","enabled":true,"discountType":"fixed","discountValue":1,"perCustomerLimit":1}'::jsonb,
      jsonb_build_object('code','EXPIRED','enabled',true,'discountType','fixed','discountValue',1,'expiresAt',now() - interval '1 hour'),
      jsonb_build_object('code','FUTURE','enabled',true,'discountType','fixed','discountValue',1,'startsAt',now() + interval '1 hour'))))
  on conflict (record_id) do update set payload = excluded.payload;
  insert into public.app_data(record_id, scope, storage_key, owner_id, payload)
  values ('customer:furgo-demo-credit-balance:' || buyer, 'customer', 'furgo-demo-credit-balance', buyer, '"50.00"'),
    ('operation:furgo-demo-marketplace-orders:' || buyer, 'operation', 'furgo-demo-marketplace-orders', buyer, '[{"id":"historic"}]');
  insert into public.furgo_coin_exchange_items(id, name, coin_cost, max_redemptions, starts_at, expires_at)
  values (reward, 'Checkout test voucher', 1, 5, now() - interval '1 day', now() + interval '1 day'),
    (expired_reward, 'Expired checkout voucher', 1, 1, now() - interval '1 day', now() - interval '1 hour');
  insert into public.furgo_coin_exchange_redemptions(item_id, reward_name, user_id, coin_cost, voucher_code,
    voucher_category, voucher_discount_type, voucher_discount_value, voucher_minimum_spend)
  values (reward, 'Owner voucher', buyer, 1, mine, 'marketplace', 'fixed', 2.95, 10),
    (reward, 'Other voucher', other_buyer, 1, theirs, 'marketplace', 'fixed', 2.95, 10),
    (expired_reward, 'Expired voucher', buyer, 1, expired, 'marketplace', 'fixed', 2.95, 10),
    (reward, 'Grooming voucher', buyer, 1, other_category, 'grooming', 'fixed', 2.95, 10);

  items := jsonb_build_array(jsonb_build_object('productId', product_a, 'variantId', 'a', 'quantity', 2),
    jsonb_build_object('productId', product_b, 'variantId', 'a', 'quantity', 1));
  one_item := jsonb_build_array(jsonb_build_object('productId', product_a, 'variantId', 'a', 'quantity', 1));
  checkout_payload := jsonb_build_object('items', items, 'address', address, 'payment', 'gateway', 'voucherCode', 'percent');
  bank_payload := jsonb_build_object('items', one_item, 'address', address, 'payment', 'bank-transfer', 'transferSlip', slip);
  demo_payload := jsonb_build_object('items', one_item, 'address', address, 'payment', 'wallet');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  if exists (select from public.app_data where record_id = 'operation:furgo-demo-marketplace-orders:' || buyer)
    or not exists (select from public.get_marketplace_legacy_history() entry where entry->>'id'='historic' and entry->>'userId'=buyer::text) then
    raise exception 'Legacy history bypassed the owner RPC or disappeared.';
  end if;
  perform public.preserve_marketplace_legacy_snapshot(incoming);
  perform public.preserve_marketplace_legacy_snapshot(incoming);
  if exists (select from public.get_marketplace_legacy_history() entry where entry->>'id'='browser-only') then
    raise exception 'The browser self-assigned an unverified snapshot.';
  end if;
  reset role;
  if (select count(*) from public.marketplace_legacy_history_intake intake where intake.snapshot=incoming) <> 1 then
    raise exception 'Repeated acknowledgments did not preserve the original exactly once.';
  end if;
  insert into public.marketplace_legacy_verified_history(order_id,owner_id,intake_id,record,verification_reference)
  select 'browser-only', buyer, intake.id, '{"reference":"Verified history","items":[]}', 'Test independent ownership evidence'
  from public.marketplace_legacy_history_intake intake where intake.snapshot=incoming;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',other_buyer::text,true);
  perform public.preserve_marketplace_legacy_snapshot(incoming);
  if exists (select from public.get_marketplace_legacy_history()) then
    raise exception 'Another account accessed mirrored or verified history.';
  end if;
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  if not exists (select from public.get_marketplace_legacy_history() entry where entry->>'id'='browser-only' and entry->>'userId'=buyer::text) then
    raise exception 'Verified history was not released to its rightful owner.';
  end if;
  update public.app_data set payload = '[]' where record_id = 'operation:furgo-demo-marketplace-orders:' || buyer;
  if found then raise exception 'Browser can edit historical order mirrors.'; end if;
  begin
    insert into public.app_data(record_id, scope, storage_key, owner_id, payload)
    values('shared:furgo-demo-marketplace-offers:shared', 'customer', 'test-checkout-forgery', buyer, '{}');
    raise exception 'The generic state table accepted a forged shared authority record.';
  exception when check_violation or insufficient_privilege or unique_violation then null;
  end;
  begin
    insert into public.marketplace_orders(id, user_id, reference) values('browser-test', buyer, 'browser-test');
    raise exception 'A browser inserted a Marketplace order directly.';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.marketplace_order_items(order_id, line_number) values('browser-test', 1);
    raise exception 'A browser inserted a Marketplace order line directly.';
  exception when insufficient_privilege then null;
  end;

  result := public.quote_marketplace_order(items, ' percent ');
  if result->>'totalCents' <> '5509' or result->>'discountCents' <> '523' or result->>'shippingCents' <> '800'
    or result->'items'->0 ? 'cost' then raise exception 'Server quote broke amount calculation or exposed seller cost: %', result; end if;
  if (public.quote_marketplace_order(items, 'FIXED')->>'totalCents') <> '800'
    or (public.quote_marketplace_order(items, 'SHIP')->>'totalCents') <> '5232'
    or (public.quote_marketplace_order(jsonb_set(items, '{0,quantity}', '4'), '')->>'shippingCents') <> '0' then
    raise exception 'Fixed, free shipping, or free shipping threshold changed.';
  end if;
  foreach code in array array['BAD','NEGATIVE','DISABLED','EXPIRED','FUTURE','MISSING',theirs,expired,other_category] loop
    begin
      perform public.quote_marketplace_order(items, code);
      raise exception 'Invalid voucher % was accepted.', code;
    exception when sqlstate 'PT422' then null;
    end;
  end loop;
  begin
    perform public.quote_marketplace_order(one_item, 'PERCENT');
    raise exception 'A voucher was accepted below minimum spend.';
  exception when sqlstate 'PT422' then null;
  end;

  foreach bad_items in array array[
    jsonb_set(items,'{0,quantity}','0'), jsonb_set(items,'{0,quantity}','1.25'),
    jsonb_set(items,'{0,quantity}','5'), jsonb_set(items,'{0,variantId}','"frozen"'),
    jsonb_set(items,'{0,variantId}','"missing"'), one_item || one_item,
    jsonb_set(one_item,'{0,quantity}','4') || jsonb_set(one_item,'{0,variantId}','"alias"'),
    jsonb_set(items,'{0,unitPrice}','0'), jsonb_set(items,'{0,allocatedDiscount}','1000')
  ] loop
    begin
      perform public.create_marketplace_order(gen_random_uuid(), checkout_payload || jsonb_build_object('items', bad_items), 5509);
      raise exception 'Invalid quantity, option, stock, or monetary field was accepted.';
    exception when sqlstate 'PT422' then null;
    end;
  end loop;
  begin
    perform public.create_marketplace_order(request_id, checkout_payload || '{"paymentStatus":"Paid","total":0.01,"warehouseInventoryReservedAt":"forged"}', 1);
    raise exception 'Client payment state or total was accepted.';
  exception when sqlstate 'PT400' then null;
  end;
  begin
    perform public.create_marketplace_order(bank_request,
      bank_payload || '{"transferSlip":{"name":"fake.pdf","data":"data:application/pdf;base64,AAAA"}}', 2799);
    raise exception 'A fake slip was accepted at checkout.';
  exception when sqlstate 'PT422' then null;
  end;

  result := public.create_marketplace_order(request_id, checkout_payload, 1);
  if result->>'outcome' <> 'quote_changed' or result->'quote'->>'totalCents' <> '5509'
    or public.get_marketplace_checkout(request_id) is not null then
    raise exception 'Stale payable amount did not return an uncommitted refreshed quote.';
  end if;
  result := public.create_marketplace_order(request_id, checkout_payload, 5509);
  new_order := result->'order'->>'id';
  if new_order is null or result->'order'->>'user_id' <> buyer::text
    or (result->'order'->>'total')::numeric <> 55.09
    or result->'order'->>'payment_channel' <> 'demo_online'
    or result->'order'->>'payment_status' <> 'Pending Payment'
    or result->'order'->'details' ? 'warehouseInventoryReservedAt'
    or (result->'items'->0->>'refundableAmount')::numeric <> 42.10
    or (result->'items'->1->>'refundableAmount')::numeric <> 12.99 then
    raise exception 'Committed snapshots, refund amounts or deferred reservation are invalid: %', result;
  end if;
  if public.create_marketplace_order(request_id, checkout_payload, 5509) <> result or public.get_marketplace_checkout(request_id) <> result then
    raise exception 'Same-request replay differs from the committed order.';
  end if;
  begin
    perform public.create_marketplace_order(request_id, checkout_payload || '{"payment":"wallet"}', 5509);
    raise exception 'A request ID was reused with a different checkout payload.';
  exception when sqlstate 'PT409' then null;
  end;
  perform set_config('request.jwt.claim.sub', other_buyer::text, true);
  if public.get_marketplace_checkout(request_id) is not null
    or exists (select from public.marketplace_orders where id = new_order) then
    raise exception 'Another customer could read this order or checkout.';
  end if;
  if public.create_marketplace_order(request_id, checkout_payload, 5509)->'order'->>'id' = new_order then
    raise exception 'Request IDs are global instead of customer scoped.';
  end if;

  perform set_config('request.jwt.claim.sub', buyer::text, true);
  result := public.create_marketplace_order(bank_request, bank_payload, 2799);
  bank_order := result->'order'->>'id';
  version_at_checkout := (result->'order'->>'order_version')::bigint;
  if result->'order'->>'payment_status' <> 'Pending Payment Verification'
    or not (result->'items'->0 ? 'warehouseStockAllocations') then
    raise exception 'Bank checkout did not commit pending verification and its stock allocation.';
  end if;
  begin
    perform public.complete_marketplace_demo_payment(bank_order);
    raise exception 'A bank order went through demo payment.';
  exception when raise_exception then
    if sqlerrm <> 'This order is not awaiting a demo online payment.' then raise; end if;
  end;
  reset role;
  select quantity into before_bank_lot from public.warehouse_inventory_lots where id = lot_a;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', director::text, true);
  result := public.update_admin_marketplace_order(bank_order, version_at_checkout, 'reject_payment', '{"reason":"Unreadable"}');
  if result->>'payment_status' <> 'Payment Rejected' then raise exception 'Bank rejection failed.'; end if;
  reset role;
  if (select quantity from public.warehouse_inventory_lots where id = lot_a) <> before_bank_lot + 1 then
    raise exception 'Bank rejection did not release its allocation.';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  perform public.resubmit_marketplace_payment(bank_order, slip);
  version_at_checkout := (public.get_marketplace_checkout(bank_request)->'order'->>'order_version')::bigint;
  perform set_config('request.jwt.claim.sub', director::text, true);
  result := public.update_admin_marketplace_order(bank_order, version_at_checkout, 'approve_payment');
  if result->>'payment_status' <> 'Paid'
    or result->>'payment_channel' <> 'bank_transfer'
    or result->'details'->>'paymentRetryCount' <> '1' then raise exception 'Bank approval or resubmission changed.'; end if;

  perform set_config('request.jwt.claim.sub', buyer::text, true);
  if public.complete_marketplace_demo_payment(new_order) <> 'paid'
    or public.get_marketplace_checkout(request_id)->'order'->>'payment_channel' <> 'demo_online' then
    raise exception 'Demo online payment lost its channel or stopped completing.';
  end if;
  result := public.create_marketplace_order(wallet_request, demo_payload, 2799);
  wallet_order := result->'order'->>'id';
  if result->'order'->>'payment_channel' <> 'demo_credit'
    or public.create_marketplace_order(wallet_request, demo_payload, 2799)->'order'->>'id' <> wallet_order then
    raise exception 'Demo credit failed to commit or replay.';
  end if;
  begin
    perform public.create_marketplace_order(gen_random_uuid(), demo_payload, 2799);
    raise exception 'Unavailable stock or demo credit was bypassed.';
  exception when sqlstate 'PT422' then null;
  end;
  reset role;
  if (select (payload #>> '{}')::numeric from public.app_data where record_id = 'customer:furgo-demo-credit-balance:' || buyer) <> 22.01
    or (select jsonb_array_length(payload) from public.app_data where record_id = 'customer:furgo-demo-credit-transactions:' || buyer) <> 1
    or (select quantity from public.warehouse_inventory_lots where id = lot_a) <> 0 then
    raise exception 'Demo credit, order replay, or stock reservation made a partial or duplicate mutation.';
  end if;

  -- Seller fees remain exact for verified bank transfers and simulated sales
  -- remain visible to the seller without becoming payout-eligible.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', seller_user::text, true);
  result := public.seller_portal_snapshot();
  if (select count(*) from jsonb_array_elements(result->'sales') entry where entry->'demo_payment' = 'true') <> 3
    or result::text like '%' || buyer::text || '%' then raise exception 'Seller demo classification or seller data isolation failed.'; end if;
  begin
    perform public.admin_marketplace_seller_calculate_payout(seller, current_date - 1, current_date + 1);
    raise exception 'Seller accessed the Director payout calculator.';
  exception when raise_exception then
    if sqlerrm <> 'Director access is required.' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', director::text, true);
  result := public.admin_marketplace_seller_calculate_payout(seller, current_date - 1, current_date + 1);
  if (result->>'gross_sales')::numeric <> 19.99 or (result->>'marketplace_fee')::numeric <> 1.50
    or (result->>'service_fee')::numeric <> .25 or (result->>'payout_amount')::numeric <> 18.24 then
    raise exception 'Demo sales affected real payouts or verified seller fees changed: %', result;
  end if;
  reset role;
  insert into public.marketplace_item_returns(id, order_id, line_number, customer_id, supplier_name, reason, photo_path,
    paid_amount, shipping_refund, refund_amount, status)
  values(return_id, new_order, 1, buyer, 'QA Store', 'QA refund', 'qa/test.png', 35.99, 6.11, 42.10, 'Refund Processing');
  set local role authenticated;
  begin
    perform public.complete_marketplace_item_refund(return_id);
    raise exception 'The real refund action accepted a demo return.';
  exception when raise_exception then
    if sqlerrm <> 'Use the refund action that matches the order payment channel.' then raise; end if;
  end;
  if (public.complete_marketplace_item_refund(return_id, true)).status <> 'Refunded' then
    raise exception 'Demo return stopped completing.';
  end if;
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  perform public.cancel_marketplace_order(wallet_order, 'QA demo cancellation');
  perform set_config('request.jwt.claim.sub', director::text, true);
  begin
    perform public.complete_marketplace_order_cancellation_refund(wallet_order);
    raise exception 'The real refund action accepted a demo cancellation.';
  exception when raise_exception then
    if sqlerrm <> 'Use the refund action that matches the order payment channel.' then raise; end if;
  end;
  perform public.complete_marketplace_order_cancellation_refund(wallet_order, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  if public.get_marketplace_checkout(wallet_request)->'order'->'details'->>'refundMode' <> 'demo'
    or public.get_marketplace_checkout(request_id)->'items'->0->'returnRequest'->>'status' <> 'Refunded' then
    raise exception 'Recovered checkout lost refund mode or the P0 return case.';
  end if;

  checkout_payload := jsonb_build_object('items', one_item, 'address', address, 'payment', 'gateway');
  result := public.create_marketplace_order(owned_request, checkout_payload || jsonb_build_object('voucherCode', mine), 2504);
  if result->'order'->>'id' is null
    or public.create_marketplace_order(owned_request, checkout_payload || jsonb_build_object('voucherCode', mine), 2504) <> result then
    raise exception 'Owned voucher could not be applied or recovered.';
  end if;
  begin
    perform public.create_marketplace_order(gen_random_uuid(), checkout_payload || jsonb_build_object('voucherCode', mine), 2504);
    raise exception 'An issued voucher was redeemed twice.';
  exception when sqlstate 'PT422' then null;
  end;
  result := public.create_marketplace_order(limited_request, checkout_payload || '{"voucherCode":"LIMITED"}', 2699);
  if result->'order'->>'id' is null then raise exception 'Globally limited voucher could not be applied.'; end if;
  perform public.create_marketplace_order(gen_random_uuid(), checkout_payload || '{"voucherCode":"PERBUYER"}', 2699);
  begin
    perform public.create_marketplace_order(gen_random_uuid(), checkout_payload || '{"voucherCode":"PERBUYER"}', 2699);
    raise exception 'Per-customer voucher usage limit failed.';
  exception when sqlstate 'PT422' then null;
  end;
  perform set_config('request.jwt.claim.sub', other_buyer::text, true);
  begin
    perform public.quote_marketplace_order(one_item, 'LIMITED');
    raise exception 'Global voucher usage limit failed.';
  exception when sqlstate 'PT422' then null;
  end;
  if public.quote_marketplace_order(one_item, 'PERBUYER')->>'totalCents' <> '2699' then
    raise exception 'A per-customer voucher usage limit blocked a different customer.';
  end if;
  bad_items := jsonb_build_array(jsonb_build_object('productId',product_b,'variantId','free','quantity',1));
  if public.quote_marketplace_order(bad_items)->>'totalCents' <> '800'
    or public.quote_marketplace_order(bad_items,'SHIP')->>'totalCents' <> '0' then
    raise exception 'Zero-priced products bypassed shipping or failed with free shipping.';
  end if;
  checkout_payload := jsonb_build_object('items',bad_items,'address',address,'payment','gateway','voucherCode','SHIP');
  result := public.create_marketplace_order(gen_random_uuid(),checkout_payload,0);
  if (result->'order'->>'total')::numeric is distinct from 0::numeric
    or result->'order'->>'payment_status' is distinct from 'Pending Payment'
    or (result->'items'->0->>'refundableAmount')::numeric is distinct from 0::numeric then
    raise exception 'Zero-valued order created a payment or a non-zero refund.';
  end if;
  begin
    perform public.create_marketplace_order(gen_random_uuid(),checkout_payload || '{"payment":"bank-transfer"}',0);
    raise exception 'A zero-valued bank order bypassed proof validation.';
  exception when sqlstate 'PT422' then null;
  end;
  reset role;
  update public.account_controls set status = 'blacklisted' where user_id = other_buyer;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', other_buyer::text, true);
  begin
    perform public.create_marketplace_order(gen_random_uuid(), checkout_payload, 2799);
    raise exception 'A blacklisted account placed a checkout with a still-valid session.';
  exception when sqlstate 'PT403' then null;
  end;
  reset role;
  if public.marketplace_allocate_cents(2, array[1,1,1]::bigint[], true) <> array[0,1,1]::bigint[] then
    raise exception 'Rounding over-allocated a discount to the last line.';
  end if;
end;
$$;

rollback;
