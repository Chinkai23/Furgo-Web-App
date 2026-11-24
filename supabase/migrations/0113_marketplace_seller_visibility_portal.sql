-- Seller visibility portal. This is deliberately separate from the internal
-- Store Portal and its buyer-facing fulfilment RPCs.

create table if not exists public.marketplace_seller_profiles (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (char_length(trim(business_name)) between 1 and 160),
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  payment_details jsonb not null default '{}'::jsonb,
  notification_preferences jsonb not null default '{"low_stock":true,"product_status":true,"payouts":true}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_seller_users (
  seller_id uuid not null references public.marketplace_seller_profiles(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (seller_id, user_id)
);

create table if not exists public.marketplace_seller_products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.marketplace_seller_profiles(id) on delete cascade,
  warehouse_product_id uuid not null references public.warehouse_products(id) on delete cascade,
  marketplace_product_id text,
  seller_sku text not null default '',
  listing_status text not null default 'Active' check (listing_status in ('Pending Approval','Active','Inactive','Out of Stock')),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  unique (seller_id, warehouse_product_id),
  unique (warehouse_product_id)
);
create index if not exists marketplace_seller_products_seller_idx on public.marketplace_seller_products(seller_id);
create index if not exists marketplace_seller_products_marketplace_id_idx on public.marketplace_seller_products(marketplace_product_id);

create table if not exists public.marketplace_seller_fee_rules (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.marketplace_seller_profiles(id) on delete cascade,
  commission_percent numeric(7,4) not null default 0 check (commission_percent between 0 and 100),
  service_fee_per_unit numeric(12,2) not null default 0 check (service_fee_per_unit >= 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);
create index if not exists marketplace_seller_fee_rules_active_idx on public.marketplace_seller_fee_rules(seller_id, effective_from desc);

-- This internal ledger is never directly selectable by browser roles. The
-- platform order key stays server-side; seller calls see only sale_reference.
create table if not exists public.marketplace_seller_sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_reference text not null unique default ('FS-' || upper(left(replace(gen_random_uuid()::text,'-',''),10))),
  seller_id uuid not null references public.marketplace_seller_profiles(id) on delete cascade,
  warehouse_product_id uuid not null references public.warehouse_products(id) on delete restrict,
  internal_order_id text not null references public.marketplace_orders(id) on delete cascade,
  internal_line_number integer not null,
  sale_date date not null default (timezone('Asia/Kuala_Lumpur', now())::date),
  product_name text not null,
  product_image text not null default '',
  seller_sku text not null default '',
  variant text not null default '',
  quantity integer not null default 0,
  unit_price numeric(12,2) not null default 0,
  gross_sales numeric(12,2) not null default 0,
  product_sale_status text not null default 'Processing'
    check (product_sale_status in ('Processing','Shipped','Completed','Cancelled','Returned','Refunded')),
  commission_percent_snapshot numeric(7,4) not null default 0,
  commission_amount numeric(12,2) not null default 0,
  service_fee_amount numeric(12,2) not null default 0,
  refund_amount numeric(12,2) not null default 0,
  seller_net_earnings numeric(12,2) not null default 0,
  currency text not null default 'MYR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (internal_order_id, internal_line_number)
);
create index if not exists marketplace_seller_sales_scope_idx on public.marketplace_seller_sale_lines(seller_id, sale_date desc);

create table if not exists public.marketplace_seller_restocks (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.marketplace_seller_profiles(id) on delete cascade,
  seller_product_id uuid not null references public.marketplace_seller_products(id) on delete cascade,
  requested_quantity integer not null check (requested_quantity > 0),
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected','Received')),
  admin_note text not null default '' check (char_length(admin_note) <= 1000),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create index if not exists marketplace_seller_restocks_scope_idx on public.marketplace_seller_restocks(seller_id, requested_at desc);

create table if not exists public.marketplace_seller_payouts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.marketplace_seller_profiles(id) on delete cascade,
  payout_reference text not null unique default ('FP-' || upper(left(replace(gen_random_uuid()::text,'-',''),10))),
  period_start date not null,
  period_end date not null,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'Pending' check (status in ('Pending','Processing','Paid','Failed')),
  paid_date date,
  statement_url text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);
create index if not exists marketplace_seller_payouts_scope_idx on public.marketplace_seller_payouts(seller_id, created_at desc);

alter table public.marketplace_seller_profiles enable row level security;
alter table public.marketplace_seller_users enable row level security;
alter table public.marketplace_seller_products enable row level security;
alter table public.marketplace_seller_fee_rules enable row level security;
alter table public.marketplace_seller_sale_lines enable row level security;
alter table public.marketplace_seller_restocks enable row level security;
alter table public.marketplace_seller_payouts enable row level security;
revoke all on public.marketplace_seller_profiles, public.marketplace_seller_users,
  public.marketplace_seller_products, public.marketplace_seller_fee_rules,
  public.marketplace_seller_sale_lines, public.marketplace_seller_restocks,
  public.marketplace_seller_payouts from anon, authenticated;

create or replace function public.seller_portal_require_scope()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare seller_scope uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to access Seller Portal.'; end if;
  select member.seller_id into seller_scope from public.marketplace_seller_users member where member.user_id = auth.uid();
  if seller_scope is null then raise exception 'Seller Portal access is not assigned to this account.'; end if;
  return seller_scope;
end;
$$;
revoke all on function public.seller_portal_require_scope() from public, anon, authenticated;

-- Authentication needs only a yes/no result for the current account. Never
-- return seller ids or profile data from this routing helper.
create or replace function public.seller_portal_has_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.marketplace_seller_users member where member.user_id = auth.uid()
  );
$$;
revoke all on function public.seller_portal_has_access() from public, anon;
grant execute on function public.seller_portal_has_access() to authenticated;

create or replace function public.seller_portal_sync_sale_line(p_order_id text, p_line_number integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  line_item jsonb;
  order_status text;
  paid_status text;
  seller_product public.marketplace_seller_products;
  product_data jsonb;
  fee public.marketplace_seller_fee_rules;
  qty integer;
  unit_amount numeric(12,2);
  gross numeric(12,2);
  commission_amount_value numeric(12,2);
  service_fee_value numeric(12,2);
  sale_status text;
begin
  select item into line_item from public.marketplace_order_items where order_id = p_order_id and line_number = p_line_number;
  if line_item is null then return; end if;
  select status, payment_status into order_status, paid_status from public.marketplace_orders where id = p_order_id;
  if lower(coalesce(paid_status,'')) not in ('paid','paid with furgo credit','successful','succeeded','completed')
     and not exists (select 1 from public.marketplace_seller_sale_lines existing
       where existing.internal_order_id = p_order_id and existing.internal_line_number = p_line_number) then
    return;
  end if;
  select * into seller_product from public.marketplace_seller_products where marketplace_product_id = line_item->>'productId' limit 1;
  if not found then return; end if;
  select wp.product_data into product_data from public.warehouse_products wp where wp.id = seller_product.warehouse_product_id;
  qty := greatest(coalesce(nullif(line_item->>'quantity','')::integer, 0), 0);
  unit_amount := greatest(coalesce(nullif(line_item->>'unitPrice','')::numeric, 0), 0);
  gross := round(unit_amount * qty, 2);
  select * into fee from public.marketplace_seller_fee_rules
    where seller_id = seller_product.seller_id and effective_from <= now()
      and (effective_to is null or effective_to > now())
    order by effective_from desc limit 1;
  commission_amount_value := round(gross * coalesce(fee.commission_percent, 0) / 100, 2);
  service_fee_value := round(qty * coalesce(fee.service_fee_per_unit, 0), 2);
  sale_status := case
    when exists (select 1 from public.marketplace_item_returns ret where ret.order_id=p_order_id and ret.line_number=p_line_number and ret.status='Refunded') then 'Refunded'
    when exists (select 1 from public.marketplace_item_returns ret where ret.order_id=p_order_id and ret.line_number=p_line_number and ret.status='Refund Processing') then 'Returned'
    when lower(coalesce(order_status,'')) like '%cancel%' then 'Cancelled'
    when lower(coalesce(order_status,'')) like '%refund%' then 'Refunded'
    when lower(coalesce(order_status,'')) like '%return%' then 'Returned'
    when lower(coalesce(order_status,'')) like '%deliver%' or lower(coalesce(order_status,'')) = 'completed' then 'Completed'
    when lower(coalesce(order_status,'')) like '%ship%' then 'Shipped'
    else 'Processing' end;
  insert into public.marketplace_seller_sale_lines (
    seller_id, warehouse_product_id, internal_order_id, internal_line_number, sale_date,
    product_name, product_image, seller_sku, variant, quantity, unit_price, gross_sales,
    product_sale_status, commission_percent_snapshot, commission_amount, service_fee_amount, seller_net_earnings
  ) values (
    seller_product.seller_id, seller_product.warehouse_product_id, p_order_id, p_line_number,
    (timezone('Asia/Kuala_Lumpur', (select o.created_at from public.marketplace_orders o where o.id = p_order_id)))::date,
    coalesce(nullif(line_item->>'name',''), product_data->>'name', 'Product'),
    coalesce(nullif(line_item->>'imageUrl',''), product_data->'images'->>0, ''),
    seller_product.seller_sku, coalesce(line_item->>'variantLabel',''), qty, unit_amount, gross,
    sale_status, coalesce(fee.commission_percent,0), commission_amount_value, service_fee_value,
    gross - commission_amount_value - service_fee_value
  ) on conflict (internal_order_id, internal_line_number) do update set
    product_sale_status = excluded.product_sale_status,
    updated_at = now();
end;
$$;
revoke all on function public.seller_portal_sync_sale_line(text, integer) from public, anon, authenticated;

create or replace function public.seller_portal_sync_order_lines()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.seller_portal_sync_sale_line(new.id, lines.line_number)
  from public.marketplace_order_items lines where lines.order_id = new.id;
  return new;
end;
$$;
revoke all on function public.seller_portal_sync_order_lines() from public, anon, authenticated;
drop trigger if exists seller_portal_order_status_sync on public.marketplace_orders;
create trigger seller_portal_order_status_sync after update of status, payment_status on public.marketplace_orders
for each row execute function public.seller_portal_sync_order_lines();

create or replace function public.seller_portal_sync_inserted_line()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.seller_portal_sync_sale_line(new.order_id, new.line_number);
  return new;
end;
$$;
revoke all on function public.seller_portal_sync_inserted_line() from public, anon, authenticated;
drop trigger if exists seller_portal_inserted_line_sync on public.marketplace_order_items;
create trigger seller_portal_inserted_line_sync after insert on public.marketplace_order_items
for each row execute function public.seller_portal_sync_inserted_line();

create or replace function public.seller_portal_sync_return_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('Refund Processing','Refunded') then
    update public.marketplace_seller_sale_lines set
      product_sale_status = case when new.status='Refunded' then 'Refunded' else 'Returned' end,
      updated_at=now()
    where internal_order_id=new.order_id and internal_line_number=new.line_number;
  elsif new.status='Rejected' then
    perform public.seller_portal_sync_sale_line(new.order_id,new.line_number);
  end if;
  return new;
end;
$$;
revoke all on function public.seller_portal_sync_return_status() from public, anon, authenticated;
drop trigger if exists seller_portal_return_status_sync on public.marketplace_item_returns;
create trigger seller_portal_return_status_sync after insert or update of status on public.marketplace_item_returns
for each row execute function public.seller_portal_sync_return_status();

create or replace function public.seller_portal_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare sid uuid := public.seller_portal_require_scope(); result jsonb;
begin
  select jsonb_build_object(
    'profile', (select jsonb_build_object('business_name', business_name, 'contact_name', contact_name,
      'contact_email', contact_email, 'contact_phone', contact_phone,
      'payment_details_masked', case when coalesce(payment_details->>'account_number','') = '' then '' else
        concat(coalesce(nullif(payment_details->>'bank_name',''),'Bank account'),' ···· ',right(regexp_replace(payment_details->>'account_number','\D','','g'),4)) end,
      'notification_preferences', notification_preferences)
      from public.marketplace_seller_profiles where id = sid),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
      'product_id', sp.warehouse_product_id, 'seller_product_id',sp.id,'name', wp.name, 'image', coalesce(wp.product_data->'images'->>0,''),
      'sku', sp.seller_sku, 'price', coalesce(wp.product_data->'variants'->0->>'price','0'),
      'variants',coalesce((select jsonb_agg(jsonb_build_object(
        'label',case when coalesce(v->>'label','')<>'' then v->>'label' else concat_ws(' · ',
          coalesce(nullif(v->>'optionLabel',''),nullif(v->>'option','')),
          coalesce(nullif(v->>'variantLabel',''),nullif(v->>'variant',''))) end,
        'price',coalesce(v->>'price',wp.product_data->'variants'->0->>'price','0')))
        from jsonb_array_elements(case when jsonb_typeof(wp.product_data->'variants')='array' then wp.product_data->'variants' else '[]'::jsonb end) v),'[]'::jsonb),
      'listing_status', sp.listing_status, 'listed_date', sp.created_at::date,
      'units_sold', coalesce((select sum(s.quantity) from public.marketplace_seller_sale_lines s where s.seller_id=sid and s.warehouse_product_id=sp.warehouse_product_id and s.product_sale_status not in ('Cancelled','Returned','Refunded')),0)
    ) order by wp.name) from public.marketplace_seller_products sp join public.warehouse_products wp on wp.id=sp.warehouse_product_id where sp.seller_id=sid),'[]'::jsonb),
    'inventory', coalesce((select jsonb_agg(jsonb_build_object(
      'product_id', sp.id,'name',wp.name,'sku',sp.seller_sku,
      'stock_received',coalesce((select sum(h.quantity_delta) from public.warehouse_inventory_stock_history h where h.warehouse_product_id=sp.warehouse_product_id and h.quantity_delta>0 and lower(coalesce(h.reason,''))='add on stock'),0),
      'available_stock',coalesce((select sum(l.quantity) from public.warehouse_inventory_lots l where l.warehouse_product_id=sp.warehouse_product_id),0),
      'reserved_stock',null,'damaged_stock',null,'units_sold',coalesce((select sum(s.quantity) from public.marketplace_seller_sale_lines s where s.seller_id=sid and s.warehouse_product_id=sp.warehouse_product_id and s.product_sale_status not in ('Cancelled','Returned','Refunded')),0),
      'low_stock_threshold',sp.low_stock_threshold,
      'last_updated',(select max(l.updated_at) from public.warehouse_inventory_lots l where l.warehouse_product_id=sp.warehouse_product_id)
    ) order by wp.name) from public.marketplace_seller_products sp join public.warehouse_products wp on wp.id=sp.warehouse_product_id where sp.seller_id=sid),'[]'::jsonb),
    'movements', coalesce((select jsonb_agg(jsonb_build_object('product_name',movement.product_name,'sku',movement.sku,
      'variant',movement.variant,'quantity_delta',movement.quantity_delta,'reason',movement.reason,'created_at',movement.created_at)
      order by movement.created_at desc) from (
        select h.product_name,coalesce(sp.seller_sku,'') as sku,h.variant,h.quantity_delta,
          case lower(h.reason)
            when 'sales' then 'Sold'
            when 'return / refund' then 'Returned'
            when 'return to supplier' then 'Returned to supplier'
            when 'add on stock' then 'Received'
            when 'clear expired stock' then 'Expired stock cleared'
            when 'damaged stock' then 'Damaged stock'
            when 'damaged / lost stock' then 'Damaged / lost stock'
            when 'stock correction' then 'Stock adjusted'
            when 'stock deduction' then 'Stock adjusted'
            when 'change stock' then 'Stock adjusted'
            when 'other' then 'Other adjustment'
            else case when h.quantity_delta > 0 then 'Received' else 'Stock adjusted' end
          end as reason,h.created_at
        from public.warehouse_inventory_stock_history h
        join public.marketplace_seller_products sp on sp.warehouse_product_id=h.warehouse_product_id and sp.seller_id=sid
        order by h.created_at desc limit 300
      ) movement),'[]'::jsonb),
    'sales', coalesce((select jsonb_agg(jsonb_build_object('sale_reference',s.sale_reference,'sale_date',s.sale_date,
      'product_id',s.warehouse_product_id,'product_name',s.product_name,'product_image',s.product_image,'seller_sku',s.seller_sku,
      'variant',s.variant,'quantity',s.quantity,'currency',s.currency,'unit_price',s.unit_price,'gross_sales',s.gross_sales,
      'product_sale_status',s.product_sale_status,'commission_amount',s.commission_amount,'service_fee_amount',s.service_fee_amount,
      'refund_amount',coalesce(r.refund_amount,0),'seller_net_earnings',s.seller_net_earnings-coalesce(r.refund_amount,0))
      order by s.sale_date desc,s.created_at desc) from public.marketplace_seller_sale_lines s
      left join lateral (select coalesce(sum(ret.refund_amount),0) as refund_amount from public.marketplace_item_returns ret
        where ret.order_id=s.internal_order_id and ret.line_number=s.internal_line_number and ret.status='Refunded') r on true
      where s.seller_id=sid),'[]'::jsonb),
    'payouts',coalesce((select jsonb_agg(jsonb_build_object('payout_reference',p.payout_reference,'period_start',p.period_start,
      'period_end',p.period_end,'amount',p.amount,'status',p.status,'paid_date',p.paid_date)
      order by p.created_at desc) from public.marketplace_seller_payouts p where p.seller_id=sid),'[]'::jsonb),
    'restock_requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'product_name',wp.name,'sku',sp.seller_sku,
      'requested_quantity',r.requested_quantity,'note',r.note,'status',r.status,'requested_at',r.requested_at)
      order by r.requested_at desc) from public.marketplace_seller_restocks r join public.marketplace_seller_products sp on sp.id=r.seller_product_id
      join public.warehouse_products wp on wp.id=sp.warehouse_product_id where r.seller_id=sid),'[]'::jsonb),
    'fees',coalesce((select jsonb_build_object('commission_percent',f.commission_percent,'service_fee_per_unit',f.service_fee_per_unit)
      from public.marketplace_seller_fee_rules f where f.seller_id=sid and f.effective_from<=now() and (f.effective_to is null or f.effective_to>now())
      order by f.effective_from desc limit 1),'{}'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.seller_portal_snapshot() from public, anon;
grant execute on function public.seller_portal_snapshot() to authenticated;

create or replace function public.seller_portal_request_restock(p_product_id uuid, p_quantity integer, p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid := public.seller_portal_require_scope(); new_id uuid;
begin
  if p_quantity is null or p_quantity < 1 then raise exception 'Enter a restock quantity greater than zero.'; end if;
  if char_length(coalesce(p_note,''))>1000 then raise exception 'The note is too long.'; end if;
  insert into public.marketplace_seller_restocks(seller_id,seller_product_id,requested_quantity,note)
  select sid,sp.id,p_quantity,coalesce(p_note,'') from public.marketplace_seller_products sp where sp.id=p_product_id and sp.seller_id=sid returning id into new_id;
  if new_id is null then raise exception 'Product was not found.'; end if;
  return new_id;
end;
$$;
revoke all on function public.seller_portal_request_restock(uuid,integer,text) from public, anon;
grant execute on function public.seller_portal_request_restock(uuid,integer,text) to authenticated;

create or replace function public.seller_portal_update_notifications(p_preferences jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid := public.seller_portal_require_scope();
begin
  if jsonb_typeof(p_preferences) <> 'object' then raise exception 'Notification preferences are invalid.'; end if;
  update public.marketplace_seller_profiles set notification_preferences=jsonb_build_object(
    'low_stock',coalesce((p_preferences->>'low_stock')::boolean,false),
    'product_status',coalesce((p_preferences->>'product_status')::boolean,false),
    'payouts',coalesce((p_preferences->>'payouts')::boolean,false)),updated_at=now() where id=sid;
end;
$$;
revoke all on function public.seller_portal_update_notifications(jsonb) from public, anon;
grant execute on function public.seller_portal_update_notifications(jsonb) to authenticated;

-- Admin-only seller setup functions. Product assignment is always explicit;
-- sellers cannot choose another seller or directly mutate stock/pricing.
create or replace function public.admin_marketplace_sellers()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare out_data jsonb;
begin
  if coalesce(public.current_portal_level(auth.uid()),0) < 3 then raise exception 'Director access is required.'; end if;
  select jsonb_build_object(
    'sellers',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'business_name',s.business_name,'contact_name',s.contact_name,
      'contact_email',s.contact_email,'contact_phone',s.contact_phone,'assigned_users',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',p.email,'display_name',p.display_name))
        from public.marketplace_seller_users m left join public.profiles p on p.id=m.user_id where m.seller_id=s.id),'[]'::jsonb),
      'products',coalesce((select jsonb_agg(jsonb_build_object('id',sp.id,'warehouse_product_id',wp.id,'name',wp.name,'sku',sp.seller_sku,
        'listing_status',sp.listing_status,'low_stock_threshold',sp.low_stock_threshold))
        from public.marketplace_seller_products sp join public.warehouse_products wp on wp.id=sp.warehouse_product_id where sp.seller_id=s.id),'[]'::jsonb),
      'restock_requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'product_name',wp.name,'seller_sku',sp.seller_sku,
        'requested_quantity',r.requested_quantity,'note',r.note,'status',r.status,'admin_note',r.admin_note,'requested_at',r.requested_at)
        order by r.requested_at desc) from public.marketplace_seller_restocks r
        join public.marketplace_seller_products sp on sp.id=r.seller_product_id
        join public.warehouse_products wp on wp.id=sp.warehouse_product_id where r.seller_id=s.id),'[]'::jsonb),
      'payouts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'reference',p.payout_reference,'period_start',p.period_start,
        'period_end',p.period_end,'amount',p.amount,'status',p.status,'paid_date',p.paid_date)
        order by p.created_at desc) from public.marketplace_seller_payouts p where p.seller_id=s.id),'[]'::jsonb),
      'fees',coalesce((select jsonb_build_object('commission_percent',f.commission_percent,'service_fee_per_unit',f.service_fee_per_unit)
        from public.marketplace_seller_fee_rules f where f.seller_id=s.id and f.effective_to is null order by f.effective_from desc limit 1),'{}'::jsonb)) order by s.business_name)
      from public.marketplace_seller_profiles s),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'marketplace_product_id',w.marketplace_product_id,
      'assigned',exists(select 1 from public.marketplace_seller_products sp where sp.warehouse_product_id=w.id)) order by w.name)
      from public.warehouse_products w),'[]'::jsonb)
  ) into out_data;
  return out_data;
end;
$$;
revoke all on function public.admin_marketplace_sellers() from public, anon;
grant execute on function public.admin_marketplace_sellers() to authenticated;

create or replace function public.admin_marketplace_seller_assign(p_email text,p_business_name text,p_contact_name text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_user uuid; seller_key uuid;
begin
  if coalesce(public.current_portal_level(auth.uid()),0) < 3 then raise exception 'Director access is required.'; end if;
  select id into target_user from public.profiles where lower(email)=lower(trim(p_email)) limit 1;
  if target_user is null then raise exception 'No Furgo account uses this email. Ask the seller to register first.'; end if;
  select seller_id into seller_key from public.marketplace_seller_users where user_id=target_user;
  if seller_key is null then
    select id into seller_key from public.marketplace_seller_profiles where lower(contact_email)=lower(trim(p_email)) order by created_at limit 1;
    if seller_key is null then
      insert into public.marketplace_seller_profiles(business_name,contact_name,contact_email,created_by)
      values(trim(p_business_name),coalesce(trim(p_contact_name),''),lower(trim(p_email)),auth.uid()) returning id into seller_key;
    else
      update public.marketplace_seller_profiles set business_name=trim(p_business_name),contact_name=coalesce(trim(p_contact_name),''),updated_at=now() where id=seller_key;
    end if;
    insert into public.marketplace_seller_users(seller_id,user_id,assigned_by) values(seller_key,target_user,auth.uid());
    if not exists(select 1 from public.marketplace_seller_fee_rules where seller_id=seller_key) then
      insert into public.marketplace_seller_fee_rules(seller_id,created_by) values(seller_key,auth.uid());
    end if;
  else
    update public.marketplace_seller_profiles set business_name=trim(p_business_name),contact_name=coalesce(trim(p_contact_name),''),contact_email=lower(trim(p_email)),updated_at=now() where id=seller_key;
  end if;
  return seller_key;
end;
$$;
revoke all on function public.admin_marketplace_seller_assign(text,text,text) from public, anon;
grant execute on function public.admin_marketplace_seller_assign(text,text,text) to authenticated;

create or replace function public.admin_marketplace_seller_revoke_access(p_seller_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.current_portal_level(auth.uid()),0) < 3 then raise exception 'Director access is required.'; end if;
  delete from public.marketplace_seller_users where seller_id=p_seller_id;
  if not found then raise exception 'No seller account access is assigned.'; end if;
end;
$$;
revoke all on function public.admin_marketplace_seller_revoke_access(uuid) from public, anon;
grant execute on function public.admin_marketplace_seller_revoke_access(uuid) to authenticated;

create or replace function public.admin_marketplace_seller_set_product(p_seller_id uuid,p_warehouse_product_id uuid,p_seller_sku text,p_remove boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare market_id text;
begin
  if coalesce(public.current_portal_level(auth.uid()),0) < 3 then raise exception 'Director access is required.'; end if;
  if p_remove then
    delete from public.marketplace_seller_products where seller_id=p_seller_id and warehouse_product_id=p_warehouse_product_id;
    return;
  end if;
  select marketplace_product_id into market_id from public.warehouse_products where id=p_warehouse_product_id;
  if not found then raise exception 'Warehouse product was not found.'; end if;
  insert into public.marketplace_seller_products(seller_id,warehouse_product_id,marketplace_product_id,seller_sku)
  values(p_seller_id,p_warehouse_product_id,market_id,coalesce(trim(p_seller_sku),''))
  on conflict (warehouse_product_id) do update set seller_sku=excluded.seller_sku
    where public.marketplace_seller_products.seller_id = excluded.seller_id;
  if not exists(select 1 from public.marketplace_seller_products sp where sp.seller_id=p_seller_id and sp.warehouse_product_id=p_warehouse_product_id) then
    raise exception 'This warehouse product is already assigned to another seller.';
  end if;
  insert into public.marketplace_seller_sale_lines (seller_id,warehouse_product_id,internal_order_id,internal_line_number,sale_date,
    product_name,product_image,seller_sku,variant,quantity,unit_price,gross_sales,product_sale_status,commission_percent_snapshot,
    commission_amount,service_fee_amount,seller_net_earnings)
  select p_seller_id,p_warehouse_product_id,o.id,i.line_number,(timezone('Asia/Kuala_Lumpur',o.created_at))::date,
    coalesce(i.item->>'name',w.name),coalesce(i.item->>'imageUrl',w.product_data->'images'->>0,''),coalesce(trim(p_seller_sku),''),coalesce(i.item->>'variantLabel',''),
    greatest(coalesce(nullif(i.item->>'quantity','')::integer,0),0),greatest(coalesce(nullif(i.item->>'unitPrice','')::numeric,0),0),
    greatest(coalesce(nullif(i.item->>'total','')::numeric,0),0),case when lower(o.status) like '%cancel%' then 'Cancelled' when lower(o.status) like '%ship%' then 'Shipped' when lower(o.status) like '%complet%' or lower(o.status) like '%deliver%' then 'Completed' else 'Processing' end,
    coalesce(f.commission_percent,0),round(greatest(coalesce(nullif(i.item->>'total','')::numeric,0),0)*coalesce(f.commission_percent,0)/100,2),
    greatest(coalesce(nullif(i.item->>'quantity','')::integer,0),0)*coalesce(f.service_fee_per_unit,0),
    greatest(coalesce(nullif(i.item->>'total','')::numeric,0),0)-round(greatest(coalesce(nullif(i.item->>'total','')::numeric,0),0)*coalesce(f.commission_percent,0)/100,2)-greatest(coalesce(nullif(i.item->>'quantity','')::integer,0),0)*coalesce(f.service_fee_per_unit,0)
  from public.marketplace_order_items i join public.marketplace_orders o on o.id=i.order_id join public.warehouse_products w on w.id=p_warehouse_product_id
  left join lateral(select * from public.marketplace_seller_fee_rules f where f.seller_id=p_seller_id and f.effective_from<=now() and (f.effective_to is null or f.effective_to>now()) order by f.effective_from desc limit 1) f on true
  where i.item->>'productId'=market_id
    and lower(coalesce(o.payment_status,'')) in ('paid','paid with furgo credit','successful','succeeded','completed')
  on conflict(internal_order_id,internal_line_number) do nothing;
end;
$$;
revoke all on function public.admin_marketplace_seller_set_product(uuid,uuid,text,boolean) from public, anon;
grant execute on function public.admin_marketplace_seller_set_product(uuid,uuid,text,boolean) to authenticated;

create or replace function public.admin_marketplace_seller_set_fees(p_seller_id uuid,p_commission_percent numeric,p_service_fee_per_unit numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.current_portal_level(auth.uid()),0) < 3 then raise exception 'Director access is required.'; end if;
  if p_commission_percent not between 0 and 100 or p_service_fee_per_unit < 0 then raise exception 'Enter valid non-negative fee values.'; end if;
  update public.marketplace_seller_fee_rules set effective_to=now() where seller_id=p_seller_id and effective_to is null;
  insert into public.marketplace_seller_fee_rules(seller_id,commission_percent,service_fee_per_unit,created_by) values(p_seller_id,p_commission_percent,p_service_fee_per_unit,auth.uid());
end;
$$;
revoke all on function public.admin_marketplace_seller_set_fees(uuid,numeric,numeric) from public, anon;
grant execute on function public.admin_marketplace_seller_set_fees(uuid,numeric,numeric) to authenticated;

create or replace function public.admin_marketplace_seller_set_listing(p_product_id uuid,p_status text,p_low_stock_threshold integer default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.current_portal_level(auth.uid()),0) < 3 then raise exception 'Director access is required.'; end if;
  if p_status not in ('Pending Approval','Active','Inactive','Out of Stock') then raise exception 'Choose a valid listing status.'; end if;
  if p_low_stock_threshold is not null and p_low_stock_threshold < 0 then raise exception 'Low stock threshold cannot be negative.'; end if;
  update public.marketplace_seller_products set listing_status=p_status,
    low_stock_threshold=coalesce(p_low_stock_threshold,low_stock_threshold)
  where id=p_product_id;
  if not found then raise exception 'Seller product was not found.'; end if;
end;
$$;
revoke all on function public.admin_marketplace_seller_set_listing(uuid,text,integer) from public, anon;
grant execute on function public.admin_marketplace_seller_set_listing(uuid,text,integer) to authenticated;

create or replace function public.admin_marketplace_seller_review_restock(p_request_id uuid,p_decision text,p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.current_portal_level(auth.uid()),0) < 3 then raise exception 'Director access is required.'; end if;
  if p_decision not in ('Approved','Rejected','Received') then raise exception 'Choose a valid restock decision.'; end if;
  update public.marketplace_seller_restocks set status=p_decision,admin_note=left(coalesce(p_note,''),1000),reviewed_at=now(),reviewed_by=auth.uid()
  where id=p_request_id;
  if not found then raise exception 'Restock request not found.'; end if;
end;
$$;
revoke all on function public.admin_marketplace_seller_review_restock(uuid,text,text) from public, anon;
grant execute on function public.admin_marketplace_seller_review_restock(uuid,text,text) to authenticated;

create or replace function public.admin_marketplace_seller_record_payout(p_seller_id uuid,p_period_start date,p_period_end date,p_amount numeric,p_status text,p_statement_url text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.current_portal_level(auth.uid()),0) < 3 then raise exception 'Director access is required.'; end if;
  if p_status not in ('Pending','Processing','Paid','Failed') or p_amount < 0 or p_period_end < p_period_start then raise exception 'Payout details are invalid.'; end if;
  if coalesce(p_statement_url,'') <> '' and p_statement_url not like 'https://%' then raise exception 'Statement links must use HTTPS.'; end if;
  insert into public.marketplace_seller_payouts(seller_id,period_start,period_end,amount,status,paid_date,statement_url,created_by)
  values(p_seller_id,p_period_start,p_period_end,p_amount,p_status,case when p_status='Paid' then current_date else null end,coalesce(p_statement_url,''),auth.uid());
end;
$$;
revoke all on function public.admin_marketplace_seller_record_payout(uuid,date,date,numeric,text,text) from public, anon;
grant execute on function public.admin_marketplace_seller_record_payout(uuid,date,date,numeric,text,text) to authenticated;

-- Register existing order lines after all seller assignments are in place by
-- assigning a product; newly inserted order lines are captured automatically.

