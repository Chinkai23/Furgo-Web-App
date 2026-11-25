begin;

alter table public.marketplace_orders
  add column payment_channel text check (payment_channel in ('bank_transfer', 'demo_online', 'demo_credit'));

create table public.marketplace_checkout_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload_hash bytea not null,
  order_id text not null unique references public.marketplace_orders(id) on delete cascade,
  primary key (user_id, request_id)
);
alter table public.marketplace_checkout_requests enable row level security;
revoke all on public.marketplace_checkout_requests from public, anon, authenticated;

-- Usage survives request, order and account removal. The order-table ALTER
-- above locks old writes until this baseline and the permission cutover commit.
create table public.marketplace_voucher_uses (
  order_id text primary key,
  user_id uuid not null,
  voucher_code text,
  voucher_id text,
  used_at timestamptz not null,
  check (voucher_code is not null or voucher_id is not null)
);
create index marketplace_voucher_uses_code_idx on public.marketplace_voucher_uses(voucher_code, user_id);
create index marketplace_voucher_uses_id_idx on public.marketplace_voucher_uses(voucher_id, user_id) where voucher_id is not null;
alter table public.marketplace_voucher_uses enable row level security;
revoke all on public.marketplace_voucher_uses from public, anon, authenticated;

-- Count persisted orders once, including cancelled orders that used a code.
-- Browser copies and legacy mirrors are not independent redemption evidence.
insert into public.marketplace_voucher_uses(order_id, user_id, voucher_code, voucher_id, used_at)
select id, user_id, nullif(upper(btrim(details->>'coupon')), ''),
  nullif(btrim(details->>'furgoVoucherId'), ''), created_at
from public.marketplace_orders
where nullif(btrim(details->>'coupon'), '') is not null
  or nullif(btrim(details->>'furgoVoucherId'), '') is not null;

-- Browser-only history is private evidence until an operator verifies
-- ownership against an independent record.
create table public.marketplace_legacy_history_intake (
  id uuid primary key default gen_random_uuid(),
  snapshot_hash bytea not null unique,
  snapshot text not null,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now()
);
alter table public.marketplace_legacy_history_intake enable row level security;
revoke all on public.marketplace_legacy_history_intake from public, anon, authenticated;

create table public.marketplace_legacy_verified_history (
  order_id text primary key,
  owner_id uuid references auth.users(id) on delete set null,
  intake_id uuid not null references public.marketplace_legacy_history_intake(id) on delete restrict,
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  verified_at timestamptz not null default now(),
  verification_reference text not null check (length(btrim(verification_reference)) > 0)
);
create index marketplace_legacy_verified_history_owner_idx on public.marketplace_legacy_verified_history(owner_id);
alter table public.marketplace_legacy_verified_history enable row level security;
revoke all on public.marketplace_legacy_verified_history from public, anon, authenticated;

-- Pin the identities of the records a definer function treats as shared authority.
-- Validate new writes without modifying any preexisting generic app_data rows.
alter table public.app_data add constraint marketplace_shared_record_identity check (
  record_id not in ('shared:furgo-demo-marketplace-products:shared', 'shared:furgo-demo-marketplace-offers:shared')
  or (scope = 'shared' and owner_id is null and record_id = 'shared:' || storage_key || ':shared')
) not valid;

create function public.marketplace_checkout_cents(p_amount text)
returns bigint language plpgsql immutable strict set search_path = '' as $$
begin
  if p_amount !~ '^\d{1,10}(\.\d{1,40})?$' then
    raise exception 'A Marketplace amount is invalid. Refresh and try again.' using errcode = 'PT422';
  end if;
  return round(p_amount::numeric * 100)::bigint;
end;
$$;

create function public.marketplace_checkout_catalog()
returns jsonb language sql stable set search_path = '' as $$
  select payload from public.app_data
  where record_id = 'shared:furgo-demo-marketplace-products:shared'
    and scope = 'shared' and storage_key = 'furgo-demo-marketplace-products' and owner_id is null;
$$;

create function public.marketplace_checkout_stock_source(p_product jsonb, p_variant jsonb)
returns table(warehouse_id uuid, variant_label text)
language sql stable set search_path = '' as $$
  select warehouse.id, coalesce(
    (select entry->>'label' from jsonb_array_elements(
      case when jsonb_typeof(warehouse.product_data->'variants') = 'array'
        then warehouse.product_data->'variants' else '[]'::jsonb end
    ) as entry where entry->>'id' = p_variant->>'warehouseVariantId' limit 1),
    nullif(p_variant->>'label', ''), 'Standard'
  )
  from public.warehouse_products warehouse
  cross join lateral (
    select coalesce(p_variant->>'warehouseProductId', p_product->>'warehouseProductId') as linked_id
  ) as link
  where case when link.linked_id ~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
    then warehouse.id = link.linked_id::uuid else warehouse.marketplace_product_id = p_product->>'id' end
  order by warehouse.id limit 1;
$$;

-- Return the configured voucher terms and, for an issued voucher, lock its
-- redemption row on submission. Shared voucher limits use a per-code lock.
create function public.marketplace_checkout_voucher(p_user_id uuid, p_code text, p_lock boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
  offer_settings jsonb;
  voucher_list jsonb;
  voucher jsonb;
  issued public.furgo_coin_exchange_redemptions;
  reward_expiry timestamptz;
  total_uses bigint;
  customer_uses bigint;
  max_uses bigint;
  customer_limit bigint;
  voucher_id_value text;
begin
  if p_code = '' then return null; end if;
  if p_code !~ '^[A-Z0-9_-]{1,64}$' then
    raise exception 'That voucher code is invalid.' using errcode = 'PT422';
  end if;

  if p_code like 'FCV-%' then
    if p_lock then
      select * into issued from public.furgo_coin_exchange_redemptions
      where voucher_code = p_code and user_id = p_user_id for update;
    else
      select * into issued from public.furgo_coin_exchange_redemptions
      where voucher_code = p_code and user_id = p_user_id;
    end if;
    if issued.id is null or issued.voucher_category is distinct from 'marketplace'
      or issued.used_at is not null or issued.used_order_id is not null
      or exists (select from public.marketplace_voucher_uses used where used.user_id = p_user_id
        and (used.voucher_code = p_code or used.voucher_id = issued.id::text)) then
      raise exception 'That voucher is unavailable for this Marketplace checkout.' using errcode = 'PT422';
    end if;
    select expires_at into reward_expiry from public.furgo_coin_exchange_items where id = issued.item_id;
    if reward_expiry <= now() then
      raise exception 'That voucher has expired.' using errcode = 'PT422';
    end if;
    return jsonb_build_object('id', issued.id, 'redemptionId', issued.id,
      'discountType', issued.voucher_discount_type, 'discountValue', issued.voucher_discount_value,
      'minimumSpend', issued.voucher_minimum_spend);
  end if;

  if p_lock then
    perform pg_advisory_xact_lock(hashtextextended('furgo marketplace voucher:' || p_code, 0));
  end if;
  select payload into offer_settings from public.app_data
  where record_id = 'shared:furgo-demo-marketplace-offers:shared'
    and scope = 'shared' and storage_key = 'furgo-demo-marketplace-offers' and owner_id is null;
  voucher := '{"id":"furgo-voucher-default","code":"FURGO10","discountType":"percent","discountValue":10,"minimumSpend":50,"enabled":true}';
  if jsonb_typeof(offer_settings->'furgoVouchers') = 'array' then
    voucher_list := offer_settings->'furgoVouchers';
  elsif jsonb_typeof(offer_settings->'voucher') = 'object' then
    voucher_list := jsonb_build_array(voucher || '{"id":"furgo-voucher-legacy"}'::jsonb || (offer_settings->'voucher'));
  else
    voucher_list := jsonb_build_array(voucher);
  end if;
  select value into voucher from jsonb_array_elements(voucher_list)
  where upper(btrim(value->>'code')) = p_code limit 1;
  if voucher is null or voucher->'enabled' is distinct from 'true'::jsonb
    or (nullif(voucher->>'startsAt', '')::timestamptz > now())
    or (nullif(voucher->>'expiresAt', '')::timestamptz <= now()) then
    raise exception 'That voucher is unavailable for this Marketplace checkout.' using errcode = 'PT422';
  end if;
  voucher_id_value := nullif(btrim(voucher->>'id'), '');
  if p_lock and voucher_id_value is not null then
    perform pg_advisory_xact_lock(hashtextextended('furgo marketplace voucher ID:' || voucher_id_value, 0));
  end if;
  max_uses := nullif(voucher->>'maxUses', '')::bigint;
  customer_limit := nullif(voucher->>'perCustomerLimit', '')::bigint;
  if max_uses is not null or customer_limit is not null then
    select count(*), count(*) filter (where user_id = p_user_id)
    into total_uses, customer_uses
    from public.marketplace_voucher_uses where voucher_code = p_code or voucher_id = voucher_id_value;
    if total_uses >= max_uses or customer_uses >= customer_limit then
      raise exception 'That voucher has reached its usage limit.' using errcode = 'PT422';
    end if;
  end if;
  return voucher;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception 'That voucher has invalid settings.' using errcode = 'PT422';
end;
$$;

-- Allocate like the existing checkout. Give the final line the remainder,
-- with overflow redistributed when a near-full discount exceeds that line.
create function public.marketplace_allocate_cents(p_amount bigint, p_weights bigint[], p_capped boolean)
returns bigint[] language plpgsql immutable set search_path = '' as $$
declare
  share bigint;
  shares bigint[] := '{}';
  weight_total bigint := (select sum(weight) from unnest(p_weights) as weight);
  remaining bigint := p_amount;
  last_line integer := cardinality(p_weights);
  line_number integer;
begin
  for line_number in 1..last_line loop
    share := case when line_number = last_line then remaining
      when weight_total = 0 then p_amount / last_line
      else div(p_amount::numeric * p_weights[line_number], weight_total)::bigint end;
    if p_capped then share := least(share, p_weights[line_number]); end if;
    shares := array_append(shares, share);
    remaining := remaining - share;
  end loop;
  if p_capped and remaining > 0 then
    for line_number in reverse last_line..1 loop
      share := least(remaining, p_weights[line_number] - shares[line_number]);
      shares[line_number] := shares[line_number] + share;
      remaining := remaining - share;
      exit when remaining = 0;
    end loop;
  end if;
  return shares;
end;
$$;

create function public.marketplace_checkout_price(p_user_id uuid, p_items jsonb, p_code text, p_lock_voucher boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
  catalog jsonb := public.marketplace_checkout_catalog();
  offer_settings jsonb;
  requested record;
  stock_check record;
  product jsonb;
  variant jsonb;
  source record;
  line jsonb;
  voucher jsonb;
  lines jsonb := '[]';
  priced_lines jsonb := '[]';
  line_weights bigint[] := '{}';
  discounts bigint[];
  shipping_shares bigint[];
  unit_cents bigint;
  line_cents bigint;
  subtotal bigint := 0;
  shipping bigint := 0;
  shipping_discount bigint := 0;
  discount bigint := 0;
  discount_value bigint;
  quantity integer;
  line_number integer := 0;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Select between 1 and 100 Marketplace products.' using errcode = 'PT422';
  end if;
  if jsonb_typeof(catalog) is distinct from 'array' then
    raise exception 'The Marketplace catalog is unavailable.' using errcode = 'PT422';
  end if;
  for requested in select value, ordinality from jsonb_array_elements(p_items) with ordinality loop
    if jsonb_typeof(requested.value) is distinct from 'object'
      or requested.value - array['productId', 'variantId', 'quantity'] <> '{}'::jsonb
      or jsonb_typeof(requested.value->'productId') is distinct from 'string'
      or jsonb_typeof(requested.value->'variantId') is distinct from 'string'
      or length(requested.value->>'productId') not between 1 and 200
      or length(requested.value->>'variantId') not between 1 and 200
      or jsonb_typeof(requested.value->'quantity') is distinct from 'number'
      or coalesce(requested.value->>'quantity', '') !~ '^[1-9][0-9]{0,8}$' then
      raise exception 'Choose a valid product option and whole quantity.' using errcode = 'PT422';
    end if;
    if exists (select from jsonb_array_elements(lines) as prior
      where prior->>'productId' = requested.value->>'productId' and prior->>'variantId' = requested.value->>'variantId') then
      raise exception 'Combine quantities for the same product option.' using errcode = 'PT422';
    end if;
    quantity := (requested.value->>'quantity')::integer;
    select value into product from jsonb_array_elements(catalog)
    where value->>'id' = requested.value->>'productId' limit 1;
    select value into variant from jsonb_array_elements(
      case when jsonb_typeof(product->'variants') = 'array' then product->'variants' else '[]'::jsonb end)
    where value->>'id' = requested.value->>'variantId' limit 1;
    if product is null or variant is null or product->>'hidden' = 'true'
      or product->>'frozenByAdmin' = 'true' or variant->>'frozen' = 'true' then
      raise exception 'A selected Marketplace product option is no longer available.' using errcode = 'PT422';
    end if;
    select * into source from public.marketplace_checkout_stock_source(product, variant);
    if source.warehouse_id is null then
      raise exception 'A selected Marketplace product is unavailable for fulfillment.' using errcode = 'PT422';
    end if;
    unit_cents := public.marketplace_checkout_cents(variant->>'price');
    if unit_cents is null or unit_cents::numeric * quantity > 999999999999 then
      raise exception 'The price or quantity of a selected product is invalid.' using errcode = 'PT422';
    end if;
    line_cents := unit_cents * quantity;
    subtotal := subtotal + line_cents;
    line_weights := array_append(line_weights, line_cents);
    lines := lines || jsonb_build_array(jsonb_build_object(
      'inputIndex', requested.ordinality, 'lineNumber', requested.ordinality, 'productId', product->>'id', 'variantId', variant->>'id',
      'name', product->>'name', 'variantLabel', variant->>'label', 'category', coalesce(product->>'category', 'Uncategorised'),
      'imageUrl', coalesce(nullif(variant->>'imageUrl', ''), product->'images'->>0, ''),
      'nutrition', coalesce(product->>'nutrition', ''), 'ingredients', coalesce(product->>'ingredients', ''),
      'supplierId', coalesce(nullif(variant->>'supplierId', ''), variant->>'supplier', ''),
      'cost', coalesce(public.marketplace_checkout_cents(nullif(variant->>'cost', '')), 0) * 0.01,
      'quantity', quantity, 'unitPriceCents', unit_cents, 'lineTotalCents', line_cents,
      'unitPrice', unit_cents * 0.01, 'total', line_cents * 0.01,
      'warehouseId', source.warehouse_id, 'warehouseVariant', source.variant_label));
  end loop;
  for stock_check in
    select value->>'warehouseId' as warehouse_id, value->>'warehouseVariant' as variant_label,
      sum((value->>'quantity')::bigint) as required, min(value->>'name') as product_name
    from jsonb_array_elements(lines) group by 1, 2
  loop
    if stock_check.required > (select coalesce(sum(lot.quantity), 0)
      from public.warehouse_inventory_lots lot where lot.warehouse_product_id = stock_check.warehouse_id::uuid
      and coalesce(lot.variant, 'Standard') = stock_check.variant_label) then
      raise exception 'Not enough stock for % (%).', stock_check.product_name, stock_check.variant_label using errcode = 'PT422';
    end if;
  end loop;

  select payload into offer_settings from public.app_data
  where record_id = 'shared:furgo-demo-marketplace-offers:shared'
    and scope = 'shared' and storage_key = 'furgo-demo-marketplace-offers' and owner_id is null;
  if subtotal < coalesce(public.marketplace_checkout_cents(offer_settings->>'freeShippingMinimum'), 8000) then
    shipping := coalesce(public.marketplace_checkout_cents(offer_settings->>'deliveryFee'), 800);
  end if;
  voucher := public.marketplace_checkout_voucher(p_user_id, p_code, p_lock_voucher);
  if voucher is not null then
    if subtotal < coalesce(public.marketplace_checkout_cents(voucher->>'minimumSpend'), 0) then
      raise exception 'The order subtotal is below this voucher’s minimum spend.' using errcode = 'PT422';
    end if;
    case voucher->>'discountType'
      when 'free_shipping' then shipping_discount := shipping;
      when 'fixed', 'percent' then
        discount_value := public.marketplace_checkout_cents(voucher->>'discountValue');
        if discount_value is null or discount_value <= 0
          or (voucher->>'discountType' = 'percent' and (voucher->>'discountValue')::numeric > 100) then
          raise exception 'That voucher has an invalid discount.' using errcode = 'PT422';
        end if;
        discount := least(subtotal, case when voucher->>'discountType' = 'percent'
          then div(subtotal::numeric * discount_value + 5000, 10000)::bigint else discount_value end);
      else raise exception 'That voucher has an invalid discount type.' using errcode = 'PT422';
    end case;
  end if;
  if subtotal + shipping - discount - shipping_discount > 999999999999 then
    raise exception 'The Marketplace order total is too large.' using errcode = 'PT422';
  end if;
  discounts := public.marketplace_allocate_cents(discount, line_weights, true);
  shipping_shares := public.marketplace_allocate_cents(shipping - shipping_discount, line_weights, false);
  for line in select value from jsonb_array_elements(lines) loop
    line_number := line_number + 1;
    line_cents := (line->>'lineTotalCents')::bigint - discounts[line_number];
    priced_lines := priced_lines || jsonb_build_array(line || jsonb_build_object(
      'allocatedDiscount', discounts[line_number] * 0.01, 'shippingFeeAllocated', shipping_shares[line_number] * 0.01,
      'paidAmount', line_cents * 0.01, 'refundableAmount', (line_cents + shipping_shares[line_number]) * 0.01));
  end loop;
  return jsonb_build_object('items', priced_lines, 'voucher', voucher, 'subtotalCents', subtotal,
    'shippingCents', shipping, 'shippingDiscountCents', shipping_discount, 'discountCents', discount,
    'totalCents', subtotal + shipping - discount - shipping_discount);
end;
$$;

create function public.marketplace_public_checkout_quote(p_quote jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select (p_quote - 'voucher' - 'items') || jsonb_build_object('items',
    (select jsonb_agg(jsonb_build_object('inputIndex', entry->'inputIndex', 'quantity', entry->'quantity',
      'unitPriceCents', entry->'unitPriceCents', 'lineTotalCents', entry->'lineTotalCents') order by position)
    from jsonb_array_elements(p_quote->'items') with ordinality as item(entry, position)));
$$;

create function public.marketplace_checkout_actor()
returns uuid language plpgsql stable set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in to continue Marketplace checkout.' using errcode = '42501'; end if;
  if exists (select from public.account_controls where user_id = actor and status = 'blacklisted') then
    raise exception 'This account is unavailable for Marketplace checkout.' using errcode = 'PT403';
  end if;
  return actor;
end;
$$;

-- Acknowledgment carries no ownership or retrieval capability.
create function public.preserve_marketplace_legacy_snapshot(p_snapshot text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.marketplace_checkout_actor();
begin
  if p_snapshot is null or octet_length(p_snapshot) not between 1 and 12000000 then
    raise exception 'This legacy history copy needs assisted recovery.' using errcode = 'PT422';
  end if;
  insert into public.marketplace_legacy_history_intake(snapshot_hash, snapshot, submitted_by)
  values (sha256(convert_to(p_snapshot, 'UTF8')), p_snapshot, actor) on conflict (snapshot_hash) do nothing;
  return true;
end;
$$;

create function public.get_marketplace_legacy_history()
returns setof jsonb language sql stable security definer set search_path = '' as $$
  with actor as (select public.marketplace_checkout_actor() as id),
  history as (
    select entry.value as record, 1 as priority
    from actor
    join public.app_data data on data.owner_id = actor.id and data.scope = 'operation'
      and data.storage_key = 'furgo-demo-marketplace-orders'
      and data.record_id = 'operation:furgo-demo-marketplace-orders:' || actor.id
    cross join lateral jsonb_array_elements(case when jsonb_typeof(data.payload) = 'array'
      then data.payload else '[]'::jsonb end) entry
    union all
    select verified.record || jsonb_build_object('id', verified.order_id), 2
    from actor join public.marketplace_legacy_verified_history verified on verified.owner_id = actor.id
  ), visible as (
    select distinct on (history.record->>'id') history.record, actor.id as owner
    from history cross join actor
    where jsonb_typeof(history.record) = 'object' and nullif(history.record->>'id', '') is not null
      and not exists (select from public.marketplace_orders orders where orders.id = history.record->>'id')
    order by history.record->>'id', priority desc, history.record::text
  )
  select (visible.record - array['_cloudOwnerId','_orderVersion']) ||
    jsonb_build_object('userId', visible.owner, '_legacyArchive', true)
  from visible;
$$;

create function public.quote_marketplace_order(p_items jsonb, p_voucher_code text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.marketplace_public_checkout_quote(public.marketplace_checkout_price(
    public.marketplace_checkout_actor(), p_items, upper(btrim(coalesce(p_voucher_code, ''))), false));
end;
$$;

create function public.marketplace_validate_transfer_slip(p_slip jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  filename text := btrim(p_slip->>'name');
  data_url text := p_slip->>'data';
  mime text;
  file_bytes bytea;
begin
  if jsonb_typeof(p_slip) is distinct from 'object'
    or p_slip - array['name', 'data'] <> '{}'::jsonb
    or jsonb_typeof(p_slip->'name') is distinct from 'string'
    or jsonb_typeof(p_slip->'data') is distinct from 'string'
    or length(filename) not between 1 and 255
    or length(data_url) > 2097200 then
    raise exception 'Choose a transfer slip image or PDF up to 1.5 MB.' using errcode = 'PT422';
  end if;
  mime := substring(data_url from '^data:(image/(?:png|jpeg|webp)|application/pdf);base64,[a-zA-Z0-9+/]+={0,2}$');
  if mime is null then
    raise exception 'Choose a PNG, JPEG, WebP or PDF transfer slip.' using errcode = 'PT422';
  end if;
  file_bytes := decode(split_part(data_url, ',', 2), 'base64');
  if length(file_bytes) > 1572864
    or (case mime
      when 'application/pdf' then substring(file_bytes for 4) <> decode('25504446', 'hex')
      when 'image/png' then substring(file_bytes for 8) <> decode('89504e470d0a1a0a', 'hex')
      when 'image/jpeg' then substring(file_bytes for 3) <> decode('ffd8ff', 'hex')
      when 'image/webp' then substring(file_bytes for 4) <> decode('52494646', 'hex')
        or substring(file_bytes from 9 for 4) <> decode('57454250', 'hex')
    end) then
    raise exception 'Choose a valid transfer slip image or PDF up to 1.5 MB.' using errcode = 'PT422';
  end if;
  return jsonb_build_object('name', filename, 'data', data_url);
exception when invalid_parameter_value or invalid_text_representation then
  raise exception 'The transfer slip could not be read.' using errcode = 'PT422';
end;
$$;

-- Furgo Credit remains the existing demo balance. The checkout debit and its
-- history entry commit with the order, and never attest to a real payment.
create function public.marketplace_debit_demo_credit(p_owner uuid, p_cents bigint, p_order_id text, p_reference text)
returns void language plpgsql set search_path = '' as $$
declare
  balance_key constant text := 'furgo-demo-credit-balance';
  history_key constant text := 'furgo-demo-credit-transactions';
  balance_id text := 'customer:' || balance_key || ':' || p_owner;
  history_id text := 'customer:' || history_key || ':' || p_owner;
  balance_payload jsonb;
  history_payload jsonb;
  balance_cents bigint;
begin
  insert into public.app_data(record_id, scope, storage_key, owner_id, payload)
  values (balance_id, 'customer', balance_key, p_owner, '0'),
    (history_id, 'customer', history_key, p_owner, '[]')
  on conflict (record_id) do nothing;
  select payload into balance_payload from public.app_data
  where record_id = balance_id and scope = 'customer' and storage_key = balance_key and owner_id = p_owner for update;
  select payload into history_payload from public.app_data
  where record_id = history_id and scope = 'customer' and storage_key = history_key and owner_id = p_owner for update;
  balance_cents := public.marketplace_checkout_cents(balance_payload #>> '{}');
  if balance_cents is null or jsonb_typeof(history_payload) is distinct from 'array' or balance_cents < p_cents then
    raise exception 'Your demo Furgo Credit balance is too low or unavailable. Add credit or choose another payment method.' using errcode = 'PT402';
  end if;
  update public.app_data set payload = to_jsonb((balance_cents - p_cents) * 0.01), updated_at = now()
  where record_id = balance_id;
  update public.app_data set payload = jsonb_build_array(jsonb_build_object('id', p_order_id,
    'label', 'Marketplace order ' || p_reference, 'amount', -p_cents * 0.01,
    'date', to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD'))) || history_payload, updated_at = now()
  where record_id = history_id;
end;
$$;

create function public.marketplace_checkout_snapshot(p_owner uuid, p_request_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('requestId', p_request_id, 'order', to_jsonb(orders), 'items', (
    select coalesce(jsonb_agg(lines.item || jsonb_build_object('lineNumber', lines.line_number, 'returnRequest',
      case when returns.id is not null then jsonb_build_object(
        'id', returns.id, 'status', returns.status, 'reason', returns.reason, 'photoPath', returns.photo_path,
        'paidAmount', returns.paid_amount, 'shippingRefund', returns.shipping_refund, 'refundAmount', returns.refund_amount,
        'supplierResponse', returns.supplier_response, 'decisionReason', returns.decision_reason,
        'requestedAt', returns.requested_at, 'refundedAt', returns.refunded_at
      ) end) order by lines.line_number), '[]'::jsonb)
    from public.marketplace_order_items lines
    left join public.marketplace_item_returns returns
      on returns.order_id = lines.order_id and returns.line_number = lines.line_number
    where lines.order_id = orders.id))
  from public.marketplace_checkout_requests request
  join public.marketplace_orders orders on orders.id = request.order_id and orders.user_id = request.user_id
  where request.user_id = p_owner and request.request_id = p_request_id;
$$;

create function public.marketplace_lock_checkout_request(p_owner uuid, p_id uuid)
returns void language sql set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('furgo marketplace checkout:' || p_owner || ':' || p_id, 0));
$$;

create function public.get_marketplace_checkout(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := public.marketplace_checkout_actor();
begin
  if p_request_id is null then return null; end if;
  perform public.marketplace_lock_checkout_request(owner, p_request_id);
  return public.marketplace_checkout_snapshot(owner, p_request_id);
end;
$$;

create function public.create_marketplace_order(p_request_id uuid, p_checkout jsonb, p_expected_total_cents bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := public.marketplace_checkout_actor();
  new_order_id text := 'order-' || gen_random_uuid();
  offer_quote jsonb;
  voucher jsonb;
  voucher_code text := upper(btrim(coalesce(p_checkout->>'voucherCode', '')));
  total_cents bigint;
  checkout_hash bytea;
  original_hash bytea;
  payment text := p_checkout->>'payment';
  channel text;
  status_value text;
  payment_status_value text;
  payment_method text;
  address_input jsonb := p_checkout->'address';
  address_data jsonb;
  slip jsonb;
  customer public.profiles;
  field text;
  order_ref text;
  order_details jsonb;
  order_time timestamptz := now();
begin
  if p_request_id is null or jsonb_typeof(p_checkout) is distinct from 'object'
    or pg_column_size(p_checkout) > 2200000 or p_expected_total_cents is null then
    raise exception 'This Marketplace checkout request is invalid.' using errcode = 'PT400';
  end if;

  checkout_hash := sha256(convert_to(jsonb_build_array(p_checkout, p_expected_total_cents)::text, 'UTF8'));
  perform public.marketplace_lock_checkout_request(owner, p_request_id);
  select payload_hash into original_hash from public.marketplace_checkout_requests
  where user_id = owner and request_id = p_request_id;
  if found then
    if original_hash is distinct from checkout_hash then
      raise exception 'This checkout ID belongs to a different checkout request.' using errcode = 'PT409';
    end if;
    return public.marketplace_checkout_snapshot(owner, p_request_id);
  end if;
  if p_checkout - array['items', 'address', 'voucherCode', 'payment', 'transferSlip'] <> '{}'::jsonb
    or payment is null or payment not in ('gateway', 'wallet', 'bank-transfer')
    or (p_checkout ? 'voucherCode' and jsonb_typeof(p_checkout->'voucherCode') is distinct from 'string')
    or p_expected_total_cents not between 0 and 999999999999 then
    raise exception 'This checkout contains unsupported fields or an invalid payment method.' using errcode = 'PT400';
  end if;
  if jsonb_typeof(address_input) is distinct from 'object'
    or address_input - array['name', 'phone', 'street', 'postcode', 'city', 'state'] <> '{}'::jsonb then
    raise exception 'Provide valid delivery details.' using errcode = 'PT422';
  end if;
  address_data := '{}'::jsonb;
  foreach field in array array['name', 'phone', 'street', 'postcode', 'city', 'state'] loop
    if jsonb_typeof(address_input->field) is distinct from 'string'
      or length(btrim(address_input->>field)) not between 1 and 500 then
      raise exception 'Complete all delivery address fields.' using errcode = 'PT422';
    end if;
    address_data := address_data || jsonb_build_object(field, btrim(address_input->>field));
  end loop;

  case payment
    when 'bank-transfer' then
      slip := public.marketplace_validate_transfer_slip(p_checkout->'transferSlip');
      channel := 'bank_transfer';
      status_value := 'Pending Payment Verification';
      payment_status_value := status_value;
      payment_method := 'Manual bank transfer';
    when 'wallet' then
      channel := 'demo_credit';
      status_value := 'Paid / Processing';
      payment_status_value := 'Paid';
      payment_method := 'Furgo Credit';
    else
      channel := 'demo_online';
      status_value := 'Pending Payment';
      payment_status_value := status_value;
      payment_method := 'Online Payment';
  end case;
  if channel <> 'bank_transfer' and coalesce(p_checkout->'transferSlip', 'null'::jsonb) <> 'null'::jsonb then
    raise exception 'Transfer slips can only be used for bank transfers.' using errcode = 'PT400';
  end if;

  offer_quote := public.marketplace_checkout_price(owner, p_checkout->'items', voucher_code, true);
  total_cents := (offer_quote->>'totalCents')::bigint;
  if p_expected_total_cents <> total_cents then
    return jsonb_build_object('outcome', 'quote_changed', 'quote', public.marketplace_public_checkout_quote(offer_quote));
  end if;

  voucher := offer_quote->'voucher';
  select * into customer from public.profiles where id = owner;
  order_ref := 'FG-' || to_char(order_time at time zone 'Asia/Kuala_Lumpur', 'YYMMDD')
    || '-' || upper(substr(replace(substr(new_order_id, 7), '-', ''), 1, 12));
  order_details := jsonb_build_object(
    'date', to_char(order_time at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD'),
    'customerEmail', coalesce(customer.email, ''), 'customerName', coalesce(nullif(customer.display_name, ''), address_data->>'name'),
    'customerPhone', coalesce(nullif(customer.phone_e164, ''), address_data->>'phone'),
    'deliveryPhone', address_data->>'phone', 'address', address_data,
    'subtotal', (offer_quote->>'subtotalCents')::bigint * 0.01,
    'shipping', (offer_quote->>'shippingCents')::bigint * 0.01,
    'shippingDiscount', (offer_quote->>'shippingDiscountCents')::bigint * 0.01,
    'furgoShippingDiscount', (offer_quote->>'shippingDiscountCents')::bigint * 0.01,
    'discount', (offer_quote->>'discountCents')::bigint * 0.01,
    'furgoVoucherDiscount', (offer_quote->>'discountCents')::bigint * 0.01,
    'furgoVoucherId', coalesce(voucher->>'id', ''), 'coupon', voucher_code,
    'paymentMethod', payment_method, 'paymentStatus', payment_status_value, 'transferSlip', slip,
    'paymentDeadlineAt', case when channel = 'demo_online' then order_time + interval '1 hour' end
  );
  if channel = 'demo_credit' then
    perform public.marketplace_debit_demo_credit(owner, total_cents, new_order_id, order_ref);
  end if;
  insert into public.marketplace_orders(id, user_id, reference, status, payment_status, payment_channel, total, details)
  values (new_order_id, owner, order_ref, status_value, payment_status_value, channel, total_cents * 0.01, order_details);

  insert into public.marketplace_order_items(order_id, line_number, item)
  select new_order_id, entry.ordinality::integer,
    entry.value - array['inputIndex', 'unitPriceCents', 'lineTotalCents', 'warehouseId', 'warehouseVariant']
  from jsonb_array_elements(offer_quote->'items') with ordinality as entry(value, ordinality);

  if channel <> 'demo_online' then
    begin
      perform public.reserve_marketplace_order_inventory(new_order_id);
    exception when raise_exception then
      if sqlerrm like 'Not enough stock for %' or sqlerrm like 'Stock changed while %' then
        raise exception '%', sqlerrm using errcode = 'PT422';
      end if;
      raise;
    end;
    -- The allocator uses the live catalog. Roll back if fulfillment changed
    -- between pricing and allocation, including a remap to another store.
    if exists (
      select from jsonb_array_elements(offer_quote->'items') priced
      join public.marketplace_order_items lines
        on lines.order_id = new_order_id and lines.line_number = (priced->>'lineNumber')::integer
      cross join lateral jsonb_array_elements(lines.item->'warehouseStockAllocations') allocation
      where allocation->>'warehouse_product_id' is distinct from priced->>'warehouseId'
        or coalesce(allocation->>'variant', 'Standard') is distinct from priced->>'warehouseVariant'
    ) then
      raise exception 'The fulfillment stock changed. Review the products and try again.' using errcode = 'PT422';
    end if;
  end if;
  if voucher->>'redemptionId' is not null then
    update public.furgo_coin_exchange_redemptions
    set used_at = now(), used_order_id = new_order_id
    where id = (voucher->>'redemptionId')::uuid and user_id = owner and used_at is null and used_order_id is null;
    if not found then raise exception 'That voucher is already used.' using errcode = 'PT422'; end if;
  end if;
  if voucher_code <> '' then
    insert into public.marketplace_voucher_uses(order_id, user_id, voucher_code, voucher_id, used_at)
    values (new_order_id, owner, voucher_code, nullif(btrim(voucher->>'id'), ''), now());
  end if;
  insert into public.marketplace_checkout_requests(user_id, request_id, payload_hash, order_id)
  values (owner, p_request_id, checkout_hash, new_order_id);
  return public.marketplace_checkout_snapshot(owner, p_request_id);
end;
$$;

-- Reservation and release keep the P0 lot, allocation, and history functions.
-- Serialize Marketplace allocations before they acquire any lot locks, since
-- lot updates also touch the shared stock catalog through a trigger.
alter function public.reserve_marketplace_order_inventory(text) rename to allocate_marketplace_order_inventory;
alter function public.release_marketplace_order_inventory(text) rename to restore_marketplace_order_inventory;

create function public.reserve_marketplace_order_inventory(p_order_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  order_row public.marketplace_orders;
  catalog jsonb;
begin
  select * into order_row from public.marketplace_orders where id = p_order_id for update;
  if not found then raise exception 'Marketplace order % was not found.', p_order_id; end if;
  perform pg_advisory_xact_lock(hashtextextended('furgo marketplace warehouse allocations', 0));
  if order_row.payment_channel is not null
    and not (order_row.details ? 'warehouseInventoryReservedAt' and not order_row.details ? 'warehouseInventoryReleasedAt') then
    catalog := public.marketplace_checkout_catalog();
    if jsonb_typeof(catalog) is distinct from 'array' or exists (
      select from public.marketplace_order_items as lines where lines.order_id = p_order_id and not exists (
        select from jsonb_array_elements(catalog) as product
        cross join lateral jsonb_array_elements(case when jsonb_typeof(product->'variants') = 'array'
          then product->'variants' else '[]'::jsonb end) as variant
        where product->>'id' = lines.item->>'productId' and variant->>'id' = lines.item->>'variantId'
          and product->>'hidden' is distinct from 'true' and product->>'frozenByAdmin' is distinct from 'true'
          and variant->>'frozen' is distinct from 'true'
      )
    ) then
      raise exception 'A product option in this order is no longer available.' using errcode = 'PT422';
    end if;
  end if;
  perform public.allocate_marketplace_order_inventory(p_order_id);
end;
$$;

create function public.release_marketplace_order_inventory(p_order_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  order_details jsonb;
begin
  select details into order_details from public.marketplace_orders where id = p_order_id for update;
  if not found or not (order_details ? 'warehouseInventoryReservedAt')
    or order_details ? 'warehouseInventoryReleasedAt' then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('furgo marketplace warehouse allocations', 0));
  perform public.restore_marketplace_order_inventory(p_order_id);
end;
$$;

-- Operational Paid keeps the existing order and Store lifecycle. The channel
-- is written by checkout and determines whether a payment is simulated.
create function public.marketplace_order_payment_channel(p_order public.marketplace_orders)
returns text language sql stable set search_path = '' as $$
  select coalesce(p_order.payment_channel, case
    when lower(btrim(coalesce(p_order.details->>'paymentMethod', ''))) in ('online payment', 'gateway', 'demo online payment') then 'demo_online'
    when lower(btrim(coalesce(p_order.details->>'paymentMethod', ''))) in ('furgo credit', 'wallet', 'demo furgo credit')
      or lower(p_order.payment_status) = 'paid with furgo credit' then 'demo_credit'
    when lower(coalesce(p_order.details->>'paymentMethod', '')) like '%transfer%' then 'bank_transfer'
    else 'legacy' end);
$$;

create or replace function public.complete_marketplace_demo_payment(p_order_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.marketplace_orders;
  deadline timestamptz;
  actor uuid := public.marketplace_checkout_actor();
begin
  select * into order_row from public.marketplace_orders
  where id = p_order_id and user_id = actor for update;
  if not found then raise exception 'This order is not available in your account.'; end if;
  if public.marketplace_order_payment_channel(order_row) is distinct from 'demo_online' then
    raise exception 'This order is not awaiting a demo online payment.';
  end if;
  if order_row.payment_status = 'Paid' then return 'already_paid'; end if;
  if order_row.status <> 'Pending Payment' or order_row.payment_status <> 'Pending Payment' then
    raise exception 'This order is not awaiting online payment.';
  end if;
  deadline := nullif(order_row.details->>'paymentDeadlineAt', '')::timestamptz;
  if deadline is null or deadline <= now() then
    update public.marketplace_orders set status = 'Cancelled', payment_status = 'Failed Payment',
      details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'cancelledAt', now(), 'cancellationReason', 'Payment window expired', 'refundAmount', 0, 'refundStatus', 'Not Required'
      ), updated_at = now()
    where id = p_order_id;
    return 'expired';
  end if;
  update public.marketplace_orders set status = 'New Order', payment_status = 'Paid',
    details = coalesce(details, '{}'::jsonb) || jsonb_build_object('paidAt', now(), 'paymentStatus', 'Paid'), updated_at = now()
  where id = p_order_id;
  return 'paid';
end;
$$;
create or replace function public.resubmit_marketplace_payment(p_order_id text, p_transfer_slip jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.marketplace_orders;
  actor uuid := public.marketplace_checkout_actor();
begin
  select * into order_row from public.marketplace_orders
  where id = p_order_id and user_id = actor for update;
  if not found then raise exception 'This order is not available in your account.'; end if;
  if lower(coalesce(order_row.payment_status, '')) not in ('payment rejected', 'failed payment') then
    raise exception 'This order does not need a payment retry.';
  end if;
  if public.marketplace_order_payment_channel(order_row) is distinct from 'bank_transfer' then
    raise exception 'A transfer slip can only be resubmitted for a bank-transfer order.';
  end if;
  if lower(coalesce(order_row.status, '')) like '%cancel%' then raise exception 'Cancelled orders cannot be paid again.'; end if;
  update public.marketplace_orders set
    status = 'Pending Payment Verification',
    payment_status = 'Pending Payment Verification',
    details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
      'transferSlip', public.marketplace_validate_transfer_slip(p_transfer_slip),
      'paymentRetryAt', now(),
      'paymentRetryCount', coalesce(nullif(details->>'paymentRetryCount', '')::integer, 0) + 1
    ) - 'paymentRejectionReason',
    updated_at = now()
  where id = p_order_id;
end;
$$;
create or replace function public.admin_marketplace_seller_calculate_payout(
  p_seller_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare totals jsonb;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;
  if not exists (select 1 from public.marketplace_seller_profiles where id = p_seller_id and deleted_at is null) then
    raise exception 'Seller was not found.';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Choose a valid payout date range.';
  end if;

  select jsonb_build_object(
    'units', coalesce(sum(sale.quantity), 0),
    'gross_sales', coalesce(round(sum(sale.gross_sales), 2), 0),
    'marketplace_fee', coalesce(round(sum(sale.commission_amount), 2), 0),
    'service_fee', coalesce(round(sum(sale.service_fee_amount), 2), 0),
    'payout_amount', coalesce(round(sum(sale.seller_net_earnings), 2), 0)
  ) into totals
  from public.marketplace_seller_sale_lines sale
  join public.marketplace_orders orders on orders.id = sale.internal_order_id
  where public.marketplace_order_payment_channel(orders) not in ('demo_online', 'demo_credit')
    and sale.seller_id = p_seller_id
    and sale.sale_date between p_period_start and p_period_end
    and sale.product_sale_status not in ('Cancelled','Returned','Refunded');

  return coalesce(totals, jsonb_build_object(
    'units', 0, 'gross_sales', 0, 'marketplace_fee', 0,
    'service_fee', 0, 'payout_amount', 0
  ));
end;
$$;
create or replace function public.get_marketplace_item_return_review_queue()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'returnId', item_return.id,
    'status', item_return.status,
    'reason', item_return.reason,
    'photoPath', item_return.photo_path,
    'paidAmount', item_return.paid_amount,
    'shippingRefund', item_return.shipping_refund,
    'refundAmount', item_return.refund_amount,
    'supplierName', item_return.supplier_name,
    'supplierResponse', item_return.supplier_response,
    'decisionReason', item_return.decision_reason,
    'orderId', order_row.id,
    'demoPayment', public.marketplace_order_payment_channel(order_row) in ('demo_online', 'demo_credit'),
    'orderReference', order_row.reference,
    'customerName', coalesce(order_row.details->>'customerName', order_row.details->'address'->>'name', ''),
    'customerPhone', coalesce(order_row.details->>'deliveryPhone', order_row.details->'address'->>'phone', order_row.details->>'customerPhone', ''),
    'productName', lines.item->>'name',
    'variantLabel', lines.item->>'variantLabel',
    'quantity', lines.item->>'quantity'
  )
  from public.marketplace_item_returns item_return
  join public.marketplace_orders order_row on order_row.id = item_return.order_id
  join public.marketplace_order_items lines on lines.order_id = item_return.order_id and lines.line_number = item_return.line_number
  where public.current_portal_level(auth.uid()) >= 2
    and item_return.status in ('Admin Review', 'Refund Processing')
  order by item_return.requested_at asc;
$$;

-- Retain demo sale history and Store fulfillment, but identify its settlement
-- status in the Seller response and exclude it from the payout calculation.
alter function public.seller_portal_snapshot() rename to seller_portal_sales_snapshot;
revoke all on function public.seller_portal_sales_snapshot() from public, anon, authenticated;

create function public.seller_portal_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  seller_id_value uuid := public.seller_portal_require_scope();
  snapshot jsonb := public.seller_portal_sales_snapshot();
  sale_details jsonb;
begin
  select coalesce(jsonb_agg(entry || jsonb_build_object('demo_payment',
    public.marketplace_order_payment_channel(orders) in ('demo_online', 'demo_credit')) order by position), '[]'::jsonb)
  into sale_details
  from jsonb_array_elements(snapshot->'sales') with ordinality as result(entry, position)
  join public.marketplace_seller_sale_lines sale
    on sale.sale_reference = entry->>'sale_reference' and sale.seller_id = seller_id_value
  join public.marketplace_orders orders on orders.id = sale.internal_order_id;
  return snapshot || jsonb_build_object('sales', sale_details);
end;
$$;

create function public.complete_marketplace_item_refund(p_return_id uuid, p_demo boolean)
returns public.marketplace_item_returns language plpgsql security definer set search_path = '' as $$
declare
  item_return public.marketplace_item_returns;
  order_row public.marketplace_orders;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 2 then
    raise exception 'Manager or Director access is required to record a refund.';
  end if;
  select * into item_return from public.marketplace_item_returns where id = p_return_id for update;
  if not found or item_return.status <> 'Refund Processing' then
    raise exception 'This return is not ready to be marked refunded.';
  end if;
  select * into order_row from public.marketplace_orders where id = item_return.order_id;
  if p_demo is distinct from (public.marketplace_order_payment_channel(order_row) in ('demo_online', 'demo_credit')) then
    raise exception 'Use the refund action that matches the order payment channel.';
  end if;
  update public.marketplace_item_returns set status = 'Refunded', refunded_at = now(), updated_at = now(),
    status_history = status_history || jsonb_build_array(jsonb_build_object(
      'status', 'Refunded', 'at', now(), 'by', auth.uid(), 'refundMode', case when p_demo then 'demo' else 'manual' end))
  where id = p_return_id returning * into item_return;
  return item_return;
end;
$$;

create or replace function public.complete_marketplace_item_refund(p_return_id uuid)
returns public.marketplace_item_returns language sql security definer set search_path = '' as $$
  select public.complete_marketplace_item_refund(p_return_id, false);
$$;

create function public.complete_marketplace_order_cancellation_refund(p_order_id text, p_demo boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  order_row public.marketplace_orders;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 2 then
    raise exception 'Manager or Director access is required to record a refund.';
  end if;
  select * into order_row from public.marketplace_orders where id = p_order_id for update;
  if not found or order_row.status <> 'Cancelled' or order_row.details->>'refundStatus' is distinct from 'Refund Processing' then
    raise exception 'This cancelled order is not awaiting a refund.';
  end if;
  if p_demo is distinct from (public.marketplace_order_payment_channel(order_row) in ('demo_online', 'demo_credit')) then
    raise exception 'Use the refund action that matches the order payment channel.';
  end if;
  update public.marketplace_orders set payment_status = 'Refunded',
    details = details || jsonb_build_object('refundStatus', 'Refunded', 'refundedAt', now(),
      'refundMode', case when p_demo then 'demo' else 'manual' end), updated_at = now()
  where id = p_order_id;
end;
$$;

create or replace function public.complete_marketplace_order_cancellation_refund(p_order_id text)
returns void language sql security definer set search_path = '' as $$
  select public.complete_marketplace_order_cancellation_refund(p_order_id, false);
$$;

revoke all on function public.marketplace_checkout_cents(text), public.marketplace_checkout_catalog(),
  public.marketplace_checkout_stock_source(jsonb, jsonb), public.marketplace_checkout_voucher(uuid, text, boolean),
  public.marketplace_allocate_cents(bigint, bigint[], boolean), public.marketplace_checkout_price(uuid, jsonb, text, boolean),
  public.marketplace_public_checkout_quote(jsonb), public.marketplace_checkout_actor(), public.marketplace_validate_transfer_slip(jsonb),
  public.marketplace_debit_demo_credit(uuid, bigint, text, text), public.marketplace_checkout_snapshot(uuid, uuid),
  public.marketplace_lock_checkout_request(uuid, uuid), public.reserve_marketplace_order_inventory(text),
  public.release_marketplace_order_inventory(text), public.marketplace_order_payment_channel(public.marketplace_orders)
  from public, anon, authenticated;

revoke all on function public.preserve_marketplace_legacy_snapshot(text), public.get_marketplace_legacy_history(),
  public.quote_marketplace_order(jsonb, text), public.get_marketplace_checkout(uuid),
  public.create_marketplace_order(uuid, jsonb, bigint), public.seller_portal_snapshot(),
  public.complete_marketplace_item_refund(uuid, boolean), public.complete_marketplace_order_cancellation_refund(text, boolean)
  from public, anon;
grant execute on function public.preserve_marketplace_legacy_snapshot(text), public.get_marketplace_legacy_history(),
  public.quote_marketplace_order(jsonb, text), public.get_marketplace_checkout(uuid),
  public.create_marketplace_order(uuid, jsonb, bigint), public.seller_portal_snapshot(),
  public.complete_marketplace_item_refund(uuid, boolean), public.complete_marketplace_order_cancellation_refund(text, boolean)
  to authenticated;

-- The browser first-login recovery path is read-only. Keep old history rows
-- readable while retiring the unchecked order RPC and both direct inserts.
revoke execute on function public.create_marketplace_order(jsonb) from public, anon, authenticated;
revoke insert on public.marketplace_orders, public.marketplace_order_items from public, anon, authenticated;
create policy "Marketplace legacy history reads use the owner RPC" on public.app_data
  as restrictive for select to authenticated, anon
  using (storage_key <> 'furgo-demo-marketplace-orders');
create policy "Marketplace legacy history is read only on insert" on public.app_data
  as restrictive for insert to authenticated
  with check (storage_key <> 'furgo-demo-marketplace-orders');
create policy "Marketplace legacy history is read only on update" on public.app_data
  as restrictive for update to authenticated
  using (storage_key <> 'furgo-demo-marketplace-orders')
  with check (storage_key <> 'furgo-demo-marketplace-orders');
create policy "Marketplace legacy history is read only on delete" on public.app_data
  as restrictive for delete to authenticated
  using (storage_key <> 'furgo-demo-marketplace-orders');

commit;
