-- Run with psql against a disposable database migrated through 0136.
-- This applies 0137 locally between the pre-cutover fixtures and assertions.
\set ON_ERROR_STOP on

insert into auth.users(id, email) values
  ('00000000-0137-4000-9000-000000000001','voucher-upgrade-one@example.test'),
  ('00000000-0137-4000-9000-000000000002','voucher-upgrade-two@example.test');
insert into public.warehouse_products(id, name, marketplace_product_id, product_data)
values ('00000000-0137-4000-9000-000000000003','Upgrade sample','upgrade-sample','{"variants":[{"id":"standard","label":"Standard","price":10}]}');
insert into public.warehouse_inventory_lots(warehouse_product_id, product_name, variant, quantity)
values ('00000000-0137-4000-9000-000000000003','Upgrade sample','Standard',10);
insert into public.app_data(record_id, scope, storage_key, payload)
values
  ('shared:furgo-demo-marketplace-products:shared','shared','furgo-demo-marketplace-products',
    '[{"id":"upgrade-sample","name":"Upgrade sample","warehouseProductId":"00000000-0137-4000-9000-000000000003","variants":[{"id":"standard","label":"Standard","price":10}]}]'),
  ('shared:furgo-demo-marketplace-offers:shared','shared','furgo-demo-marketplace-offers',
    '{"freeShippingMinimum":0,"deliveryFee":8,"furgoVouchers":[{"id":"upgrade-voucher","code":"CURRENT100","enabled":true,"discountType":"fixed","discountValue":1,"maxUses":100}]}')
on conflict (record_id) do update set payload = excluded.payload;

insert into public.marketplace_orders(id,user_id,reference,status,payment_status,total,details)
select 'upgrade-use-'||n,'00000000-0137-4000-9000-000000000001','UP-'||n,
  case when n=30 then 'Cancelled' else 'New Order' end,'Paid',9,
  case when n=1 then '{"coupon":"  Current100  "}'::jsonb
    when n=2 then '{"furgoVoucherId":"upgrade-voucher"}'::jsonb
    else '{"coupon":"OLDER100","furgoVoucherId":"upgrade-voucher"}'::jsonb end
from generate_series(1,30) n;
insert into public.furgo_coin_exchange_items(id,name,coin_cost,max_redemptions)
values ('00000000-0137-4000-9000-000000000004','Upgrade coin voucher',1,1);
insert into public.furgo_coin_exchange_redemptions(item_id,reward_name,user_id,coin_cost,voucher_code,
  voucher_category,voucher_discount_type,voucher_discount_value)
values ('00000000-0137-4000-9000-000000000004','Upgrade coin voucher','00000000-0137-4000-9000-000000000001',
  1,'FCV-UPGRADE','marketplace','fixed',1);
insert into public.marketplace_orders(id,user_id,reference,status,payment_status,total,details)
values ('upgrade-used-coin','00000000-0137-4000-9000-000000000001','UP-COIN','New Order','Paid',9,'{"coupon":"fcv-upgrade"}');
insert into public.app_data(record_id,scope,storage_key,owner_id,payload)
values ('operation:furgo-demo-marketplace-orders:00000000-0137-4000-9000-000000000002','operation',
  'furgo-demo-marketplace-orders','00000000-0137-4000-9000-000000000002','[{"id":"unverified-mirror-use","coupon":"CURRENT100"}]');

\ir ../migrations/0137_marketplace_checkout_security.sql

do $$
declare
  owner uuid := '00000000-0137-4000-9000-000000000001';
  intent jsonb := '{"payment":"gateway","voucherCode":"CURRENT100","items":[{"productId":"upgrade-sample","variantId":"standard","quantity":1}],"address":{"name":"Test Buyer","phone":"0123456789","street":"Test","postcode":"50000","city":"KL","state":"KL"}}';
  req uuid := gen_random_uuid();
  committed jsonb;
begin
  if (select count(*) from public.marketplace_voucher_uses where voucher_code='CURRENT100' or voucher_id='upgrade-voucher') <> 30 then
    raise exception 'Migration failed to preserve thirty previous uses exactly once.';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',owner::text,true);
  begin
    perform public.quote_marketplace_order(intent->'items','FCV-UPGRADE');
    raise exception 'An unmarked issued voucher recorded on an order became redeemable again.';
  exception when sqlstate 'PT422' then null;
  end;
  committed := public.create_marketplace_order(req,intent,900);
  if committed->'order'->>'id' is null or public.create_marketplace_order(req,intent,900) <> committed then
    raise exception 'An idempotent checkout could not consume exactly one use.';
  end if;
  for counter in 2..70 loop
    if public.create_marketplace_order(gen_random_uuid(),intent,900)->'order'->>'id' is null then
      raise exception 'Fewer than seventy uses remained after cutover.';
    end if;
  end loop;
  begin
    perform public.create_marketplace_order(gen_random_uuid(),intent,900);
    raise exception 'The seventy-first post-cutover attempt succeeded.';
  exception when sqlstate 'PT422' then null;
  end;
  reset role;
  if (select count(*) from public.marketplace_voucher_uses where voucher_code='CURRENT100' or voucher_id='upgrade-voucher') <> 100
    or (select payload->'furgoVouchers'->0->>'maxUses' from public.app_data where record_id='shared:furgo-demo-marketplace-offers:shared') <> '100' then
    raise exception 'Configured limits or recorded uses changed unexpectedly.';
  end if;
end;
$$;
