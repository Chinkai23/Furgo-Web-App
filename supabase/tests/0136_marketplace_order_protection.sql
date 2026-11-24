-- Run against a disposable or staging database after migration 0136.
-- All test fixtures and mutations are rolled back.
begin;

do $$
declare
  customer_id uuid := gen_random_uuid();
  director_id uuid := gen_random_uuid();
  manager_id uuid := gen_random_uuid();
  executive_id uuid := gen_random_uuid();
  driver_id uuid := gen_random_uuid();
  store_id uuid := gen_random_uuid();
  store_name text := 'Test store ' || store_id;
  outlet_a uuid := gen_random_uuid();
  outlet_b uuid := gen_random_uuid();
  outlet_a_name text := 'Test outlet ' || outlet_a;
  outlet_b_name text := 'Test outlet ' || outlet_b;
  order_a text := 'order-test-a-' || gen_random_uuid();
  order_b text := 'order-test-b-' || gen_random_uuid();
  bank_order text := 'order-test-bank-' || gen_random_uuid();
  failed_bank_order text := 'order-test-failed-bank-' || gen_random_uuid();
  checkout_order text := 'order-test-checkout-' || gen_random_uuid();
  store_order text := 'order-test-store-' || gen_random_uuid();
  product_id text := 'product-test-' || gen_random_uuid();
  warehouse_id uuid := gen_random_uuid();
  lot_id uuid := gen_random_uuid();
  existing_item jsonb := '{"name":"Existing line","quantity":1,"warehouseStockAllocations":[{"quantity":1}]}';
  existing_details jsonb := '{"transferSlip":{"name":"proof.pdf"},"warehouseInventoryReservedAt":"existing","supplierShipments":{"store":{"status":"Shipped"}}}';
  existing_receipt jsonb := '{"name":"receipt.pdf","document":{"receiptNo":"TEST-1"}}';
  order_b_before jsonb;
  returns_before jsonb;
  saved jsonb;
  bank_allocation jsonb;
begin
  if has_function_privilege('anon', 'public.update_admin_marketplace_order(text,bigint,text,jsonb)', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.marketplace_orders', 'UPDATE, DELETE')
    or has_table_privilege('authenticated', 'public.marketplace_order_items', 'UPDATE, DELETE') then
    raise exception 'Old Marketplace writes or anonymous RPC calls are still allowed.';
  end if;

  insert into auth.users (id, email)
  select id, id || '@example.test' from unnest(array[customer_id,director_id,manager_id,executive_id,driver_id,store_id]) id;
  insert into public.user_roles (user_id, role) values (director_id, 'admin'), (manager_id, 'staff'), (executive_id, 'staff'), (driver_id, 'driver');
  insert into public.admin_outlets (id, name, shortform) values
    (outlet_a, outlet_a_name, upper(left(outlet_a::text, 8))),
    (outlet_b, outlet_b_name, upper(left(outlet_b::text, 8)));
  insert into public.portal_access (user_id, level, outlet_id) values
    (director_id, 'director', null), (manager_id, 'manager', outlet_a), (executive_id, 'executive', outlet_a);
  insert into public.marketplace_supplier_access (supplier_user_id, supplier_name) values (store_id, store_name);

  insert into public.marketplace_orders (id, user_id, reference, status, payment_status, outlet, total, details)
  values (order_a, customer_id, order_a, 'Shipped', 'Paid', outlet_a_name, 15, existing_details),
    (order_b, customer_id, order_b, 'Shipped', 'Paid', outlet_b_name, 15, existing_details),
    (bank_order, customer_id, bank_order, 'Pending Payment Verification', 'Pending Payment Verification', outlet_a_name, 15,
      '{"paymentMethod":"Manual bank transfer","transferSlip":{"name":"bank.pdf"}}'),
    (failed_bank_order, customer_id, failed_bank_order, 'Pending Payment Verification', 'Pending Payment Verification', outlet_a_name, 15, '{}'),
    (store_order, customer_id, store_order, 'Shipped', 'Paid', outlet_a_name, 15,
      jsonb_build_object('supplierShipments', jsonb_build_object(lower(store_name), '{"status":"Shipped"}'::jsonb)));
  insert into public.marketplace_order_items (order_id, line_number, item) values
    (order_a, 1, existing_item), (order_b, 1, existing_item),
    (bank_order, 1, jsonb_build_object('productId', product_id, 'variantId', 'standard', 'quantity', 1)),
    (failed_bank_order, 1, jsonb_build_object('productId', product_id, 'variantId', 'standard', 'quantity', 1)),
    (failed_bank_order, 2, jsonb_build_object('productId', product_id, 'variantId', 'standard', 'quantity', 2)),
    (store_order, 1, existing_item || jsonb_build_object('supplierId', store_name));
  insert into public.marketplace_item_returns (order_id, line_number, customer_id, supplier_name, reason, photo_path, paid_amount, shipping_refund, refund_amount)
  values (order_a, 1, customer_id, 'Test store', 'Test return A', 'test/a.png', 15, 0, 15),
    (order_b, 1, customer_id, 'Test store', 'Test return B', 'test/b.png', 15, 0, 15);
  select to_jsonb(orders) into order_b_before from public.marketplace_orders orders where id = order_b;
  select jsonb_agg(to_jsonb(returns) order by order_id) into returns_before from public.marketplace_item_returns returns where order_id in (order_a, order_b);

  insert into public.warehouse_products (id, name, product_data, marketplace_product_id, created_by)
  values (warehouse_id, 'Test stock', '{"variants":[{"id":"standard","label":"Standard"}]}', product_id, director_id);
  insert into public.warehouse_inventory_lots (id, warehouse_product_id, product_name, variant, quantity, created_by)
  values (lot_id, warehouse_id, 'Test stock', 'Standard', 2, director_id);
  insert into public.app_data (record_id, scope, storage_key, payload)
  values ('shared:furgo-demo-marketplace-products:shared', 'shared', 'furgo-demo-marketplace-products', '[]')
  on conflict (record_id) do nothing;
  update public.app_data set payload = payload || jsonb_build_array(jsonb_build_object('id', product_id,
    'name', 'Test stock', 'warehouseProductId', warehouse_id, 'variants', '[{"id":"standard","label":"Standard","stock":2}]'::jsonb))
  where record_id = 'shared:furgo-demo-marketplace-products:shared';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', director_id::text, true);
  select public.update_admin_marketplace_order(order_a, 0, 'save_receipt', existing_receipt) into saved;
  if saved->>'status' is distinct from 'Shipped' or saved->>'payment_status' is distinct from 'Paid'
    or saved->'details'->'receipt'->'document' is distinct from existing_receipt->'document'
    or saved->>'order_version' is distinct from '1' then
    raise exception 'Receipt save did not preserve the shipped order or return its new version.';
  end if;
  begin
    perform public.update_admin_marketplace_order(order_a, 0, 'status', '{"status":"Completed"}');
    raise exception 'A second client saved using the stale version.';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.update_admin_marketplace_order(order_a, 1, 'status', '{"status":"Cancelled"}');
    raise exception 'A shipped order was cancelled.';
  exception when raise_exception then
    if sqlerrm <> 'This Marketplace order cannot move to the selected status.' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', manager_id::text, true);
  begin
    perform public.update_admin_marketplace_order(order_b, 0, 'save_receipt', existing_receipt);
    raise exception 'A Manager modified an order from another outlet.';
  exception when insufficient_privilege then null;
  end;
  perform public.update_admin_marketplace_order(order_a, 1, 'status', '{"status":"Completed"}');
  perform set_config('request.jwt.claim.sub', executive_id::text, true);
  select public.update_admin_marketplace_order(order_a, 2, 'remove_receipt') into saved;
  if saved->>'status' is distinct from 'Completed' or saved->>'payment_status' is distinct from 'Paid'
    or (saved->'details') ? 'receipt' or saved->>'order_version' is distinct from '3' then
    raise exception 'Receipt removal changed the completed order or its payment.';
  end if;
  select public.update_admin_marketplace_order(order_a, 3, 'save_receipt',
    '{"name":"uploaded.pdf","data":"data:application/pdf;base64,JVBERg=="}') into saved;
  if saved->>'status' is distinct from 'Completed' or saved->'details'->'receipt'->>'source' is distinct from 'upload'
    or saved->'details'->'receipt'->>'data' is distinct from 'data:application/pdf;base64,JVBERg==' then
    raise exception 'Uploaded receipt was lost or moved a completed order backwards.';
  end if;

  perform set_config('request.jwt.claim.sub', customer_id::text, true);
  begin
    perform public.update_admin_marketplace_order(order_a, 3, 'save_receipt', existing_receipt);
    raise exception 'A customer edited their own Marketplace order through the admin RPC.';
  exception when insufficient_privilege then null;
  end;
  perform public.create_marketplace_order(jsonb_build_object('id', checkout_order, 'status', 'Pending Payment',
    'paymentStatus', 'Pending Payment', 'paymentMethod', 'Online Payment', 'items', jsonb_build_array(existing_item)));
  perform set_config('request.jwt.claim.sub', driver_id::text, true);
  begin
    perform public.update_admin_marketplace_order(order_a, 3, 'save_receipt', existing_receipt);
    raise exception 'A driver edited a Marketplace order.';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', store_id::text, true);
  begin
    perform public.update_admin_marketplace_order(store_order, 0, 'save_receipt', existing_receipt);
    raise exception 'A Store account used the admin RPC.';
  exception when insufficient_privilege then null;
  end;
  perform public.update_marketplace_supplier_shipment(store_order, 'edit_tracking', 'Test courier', 'TRACK-1');

  perform set_config('request.jwt.claim.sub', director_id::text, true);
  begin
    perform public.update_admin_marketplace_order(store_order, 0, 'save_receipt', existing_receipt);
    raise exception 'A Store shipment edit did not invalidate the previous admin version.';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.update_admin_marketplace_order(failed_bank_order, 0, 'approve_payment');
    raise exception 'Payment approval succeeded with insufficient stock.';
  exception when raise_exception then
    if sqlerrm not like 'Not enough stock for %' then raise; end if;
  end;
  reset role;
  if (select quantity from public.warehouse_inventory_lots where id = lot_id) is distinct from 2
    or (select payment_status from public.marketplace_orders where id = failed_bank_order) is distinct from 'Pending Payment Verification'
    or (select order_version from public.marketplace_orders where id = failed_bank_order) is distinct from 0::bigint
    or exists (select from public.marketplace_order_items where order_id = failed_bank_order and item ? 'warehouseStockAllocations') then
    raise exception 'A failed payment approval left a partial order or stock update.';
  end if;

  set local role authenticated;
  select public.update_admin_marketplace_order(failed_bank_order, 0, 'reject_payment', '{"reason":"Transfer could not be verified."}') into saved;
  if saved->>'payment_status' is distinct from 'Payment Rejected'
    or saved->'details'->>'paymentRejectionReason' is distinct from 'Transfer could not be verified.' then
    raise exception 'Payment rejection did not save the decision.';
  end if;
  select public.update_admin_marketplace_order(bank_order, 0, 'save_receipt', existing_receipt) into saved;
  select public.update_admin_marketplace_order(bank_order, (saved->>'order_version')::bigint, 'approve_payment') into saved;
  if saved->>'payment_status' is distinct from 'Paid' or (saved->>'order_version')::bigint <= 2
    or not ((saved->'details') ? 'warehouseInventoryReservedAt') then
    raise exception 'Payment approval did not run stock reservation and return the final revision.';
  end if;
  select public.update_admin_marketplace_order(bank_order, (saved->>'order_version')::bigint, 'remove_receipt') into saved;
  if saved->>'payment_status' is distinct from 'Paid' or saved->>'status' is distinct from 'New Order' then
    raise exception 'Receipt removal restored old payment information.';
  end if;

  reset role;
  select item->'warehouseStockAllocations' into bank_allocation from public.marketplace_order_items where order_id = bank_order;
  if coalesce(jsonb_array_length(bank_allocation), 0) <> 1
    or (select quantity from public.warehouse_inventory_lots where id = lot_id) is distinct from 1 then
    raise exception 'Payment edit did not preserve the expected stock allocation.';
  end if;
  set local role authenticated;
  select public.update_admin_marketplace_order(bank_order, (saved->>'order_version')::bigint, 'status', '{"status":"Cancelled"}') into saved;
  reset role;
  if (select quantity from public.warehouse_inventory_lots where id = lot_id) is distinct from 2
    or (select item->'warehouseStockAllocations' from public.marketplace_order_items where order_id = bank_order) is distinct from bank_allocation then
    raise exception 'Cancellation did not release stock while retaining its recorded allocation.';
  end if;

  if (select to_jsonb(orders) from public.marketplace_orders orders where id = order_b) is distinct from order_b_before
    or (select count(*) from public.marketplace_order_items where order_id in (order_a, order_b) and item = existing_item) <> 2
    or (select jsonb_agg(to_jsonb(returns) order by order_id) from public.marketplace_item_returns returns where order_id in (order_a, order_b)) is distinct from returns_before
    or (select details from public.marketplace_orders where id = order_a) @> existing_details is not true then
    raise exception 'An admin action modified another order, its lines, returns, payment proof, or allocations.';
  end if;
end;
$$;

rollback;
