-- Product-level Marketplace returns. The Furgo receipt remains an order receipt;
-- this migration records return/refund workflow and does not issue a payment.

create table public.marketplace_item_returns (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  line_number integer not null,
  customer_id uuid not null references auth.users (id) on delete cascade,
  supplier_name text not null,
  status text not null default 'Requested'
    check (status in ('Requested', 'Return In Progress', 'Admin Review', 'Refund Processing', 'Refunded', 'Rejected')),
  reason text not null,
  photo_path text not null,
  paid_amount numeric(12,2) not null check (paid_amount >= 0),
  shipping_refund numeric(12,2) not null check (shipping_refund >= 0),
  refund_amount numeric(12,2) not null check (refund_amount >= 0),
  supplier_response text not null default '',
  decision_reason text not null default '',
  status_history jsonb not null default '[]'::jsonb,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  refunded_at timestamptz,
  constraint marketplace_item_returns_order_line_fk
    foreign key (order_id, line_number)
    references public.marketplace_order_items (order_id, line_number) on delete cascade,
  constraint marketplace_item_returns_one_per_line unique (order_id, line_number)
);

create index marketplace_item_returns_customer_idx
  on public.marketplace_item_returns (customer_id, requested_at desc);
create index marketplace_item_returns_supplier_idx
  on public.marketplace_item_returns (lower(supplier_name), status, requested_at desc);

-- Checkout creates orders and lines once; only portal admins may edit them later.
-- Protecting line snapshots keeps the amount used by a return case stable.
create policy "Customers cannot edit Marketplace orders after checkout"
  on public.marketplace_orders as restrictive for update to authenticated
  using (user_id <> auth.uid() or public.current_portal_level(auth.uid()) >= 1)
  with check (user_id <> auth.uid() or public.current_portal_level(auth.uid()) >= 1);
create policy "Customers cannot delete Marketplace orders after checkout"
  on public.marketplace_orders as restrictive for delete to authenticated
  using (user_id <> auth.uid() or public.current_portal_level(auth.uid()) >= 1);
create policy "Customers cannot edit Marketplace lines after checkout"
  on public.marketplace_order_items as restrictive for update to authenticated
  using (exists (
    select 1 from public.marketplace_orders order_row
    where order_row.id = order_id and (order_row.user_id <> auth.uid() or public.current_portal_level(auth.uid()) >= 1)
  ))
  with check (exists (
    select 1 from public.marketplace_orders order_row
    where order_row.id = order_id and (order_row.user_id <> auth.uid() or public.current_portal_level(auth.uid()) >= 1)
  ));
create policy "Customers cannot delete Marketplace lines after checkout"
  on public.marketplace_order_items as restrictive for delete to authenticated
  using (exists (
    select 1 from public.marketplace_orders order_row
    where order_row.id = order_id and (order_row.user_id <> auth.uid() or public.current_portal_level(auth.uid()) >= 1)
  ));

-- Backfill immutable line-level refund inputs for orders placed before this migration.
with line_amounts as (
  select lines.order_id, lines.line_number, lines.item,
    greatest(coalesce(nullif(lines.item->>'total', '')::numeric, 0), 0) as line_total,
    coalesce(nullif(order_row.details->>'shipping', '')::numeric, 0) as order_shipping,
    coalesce(nullif(order_row.details->>'discount', '')::numeric, 0) as order_discount,
    sum(greatest(coalesce(nullif(lines.item->>'total', '')::numeric, 0), 0)) over (partition by lines.order_id) as subtotal,
    row_number() over (partition by lines.order_id order by lines.line_number) as line_index,
    count(*) over (partition by lines.order_id) as line_count
  from public.marketplace_order_items lines
  join public.marketplace_orders order_row on order_row.id = lines.order_id
), line_shares as (
  select line_amounts.*,
    case when line_index = line_count then
      order_shipping - coalesce(sum(case when line_index < line_count then round(order_shipping * line_total / nullif(subtotal, 0), 2) else 0 end) over (partition by order_id), 0)
    else coalesce(round(order_shipping * line_total / nullif(subtotal, 0), 2), 0) end as shipping_share,
    case when line_index = line_count then
      order_discount - coalesce(sum(case when line_index < line_count then round(order_discount * line_total / nullif(subtotal, 0), 2) else 0 end) over (partition by order_id), 0)
    else coalesce(round(order_discount * line_total / nullif(subtotal, 0), 2), 0) end as discount_share
  from line_amounts
)
update public.marketplace_order_items lines set item = line_shares.item || jsonb_build_object(
  'lineNumber', line_shares.line_number,
  'allocatedDiscount', greatest(line_shares.discount_share, 0),
  'shippingFeeAllocated', greatest(line_shares.shipping_share, 0),
  'paidAmount', greatest(line_shares.line_total - line_shares.discount_share, 0),
  'refundableAmount', greatest(line_shares.line_total - line_shares.discount_share + line_shares.shipping_share, 0)
)
from line_shares
where lines.order_id = line_shares.order_id and lines.line_number = line_shares.line_number
  and not (lines.item ? 'paidAmount');

alter table public.marketplace_item_returns enable row level security;
create policy "Customers suppliers and managers read item returns"
  on public.marketplace_item_returns for select to authenticated
  using (
    customer_id = auth.uid()
    or public.current_portal_level(auth.uid()) >= 1
    or exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = auth.uid()
        and lower(access.supplier_name) = lower(marketplace_item_returns.supplier_name)
    )
  );
revoke insert, update, delete on public.marketplace_item_returns from anon, authenticated;
grant select on public.marketplace_item_returns to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-return-evidence', 'marketplace-return-evidence', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy "Customers upload their own Marketplace return photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marketplace-return-evidence'
    and split_part(name, '/', 1) = auth.uid()::text
  );
create policy "Marketplace return participants read evidence"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'marketplace-return-evidence'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or exists (
        select 1 from public.marketplace_item_returns item_return
        where item_return.photo_path = name
          and (
            item_return.customer_id = auth.uid()
            or public.current_portal_level(auth.uid()) >= 1
            or exists (
              select 1 from public.marketplace_supplier_access access
              where access.supplier_user_id = auth.uid()
                and lower(access.supplier_name) = lower(item_return.supplier_name)
            )
          )
      )
    )
  );
create policy "Customers delete their unsubmitted Marketplace return photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'marketplace-return-evidence'
    and split_part(name, '/', 1) = auth.uid()::text
    and not exists (select 1 from public.marketplace_item_returns item_return where item_return.photo_path = name)
  );

create or replace function public.request_marketplace_item_return(
  p_order_id text,
  p_line_number integer,
  p_reason text,
  p_photo_path text
)
returns public.marketplace_item_returns
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.marketplace_orders;
  line_row public.marketplace_order_items;
  supplier_name text;
  shipment jsonb;
  delivered_at timestamptz;
  paid_amount numeric(12,2);
  shipping_refund numeric(12,2);
  result public.marketplace_item_returns;
begin
  select * into order_row from public.marketplace_orders
  where id = p_order_id and user_id = auth.uid() for update;
  if not found then raise exception 'This order is not available in your account.'; end if;
  if lower(coalesce(order_row.status, '')) like '%cancel%' then raise exception 'Cancelled orders cannot be returned.'; end if;
  if lower(coalesce(order_row.payment_status, '')) not in ('paid', 'succeeded', 'successful', 'completed') then
    raise exception 'A return can be requested after payment is confirmed.';
  end if;
  select * into line_row from public.marketplace_order_items
  where order_id = p_order_id and line_number = p_line_number;
  if not found then raise exception 'The product could not be found in this order.'; end if;
  supplier_name := coalesce(nullif(trim(line_row.item->>'supplierId'), ''), nullif(trim(line_row.item->>'supplier'), ''), '');
  if supplier_name = '' then raise exception 'This product has no supplier assigned, so an online return cannot be started.'; end if;
  shipment := coalesce(order_row.details->'supplierShipments'->lower(trim(supplier_name)), '{}'::jsonb);
  if shipment->>'status' <> 'Delivered' or coalesce(shipment->>'deliveredAt', '') = '' then
    raise exception 'A return can only be requested after this supplier shipment is delivered.';
  end if;
  delivered_at := (shipment->>'deliveredAt')::timestamptz;
  if now() > delivered_at + interval '7 days' then raise exception 'The 7-day return window for this shipment has ended.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter a reason for the return.'; end if;
  if coalesce(trim(p_photo_path), '') = '' or split_part(p_photo_path, '/', 1) <> auth.uid()::text then
    raise exception 'Upload a product photo before submitting the return request.';
  end if;
  if not exists (
    select 1 from storage.objects evidence
    where evidence.bucket_id = 'marketplace-return-evidence'
      and evidence.name = p_photo_path
      and evidence.name ~* '\.(jpg|jpeg|png|webp)$'
  ) then raise exception 'The product photo upload could not be verified. Upload it again and retry.'; end if;
  paid_amount := coalesce(nullif(line_row.item->>'paidAmount', '')::numeric, nullif(line_row.item->>'total', '')::numeric, 0);
  shipping_refund := coalesce(nullif(line_row.item->>'shippingFeeAllocated', '')::numeric, 0);
  insert into public.marketplace_item_returns (
    order_id, line_number, customer_id, supplier_name, reason, photo_path,
    paid_amount, shipping_refund, refund_amount, status_history
  ) values (
    p_order_id, p_line_number, auth.uid(), supplier_name, left(trim(p_reason), 2000), p_photo_path,
    paid_amount, shipping_refund, paid_amount + shipping_refund,
    jsonb_build_array(jsonb_build_object('status', 'Requested', 'at', now(), 'by', auth.uid()))
  ) returning * into result;
  return result;
exception when unique_violation then
  raise exception 'A return request already exists for this product in the order.';
end;
$$;
revoke all on function public.request_marketplace_item_return(text, integer, text, text) from public, anon;
grant execute on function public.request_marketplace_item_return(text, integer, text, text) to authenticated;

create or replace function public.respond_marketplace_item_return(
  p_return_id uuid,
  p_decision text,
  p_reason text default ''
)
returns public.marketplace_item_returns
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplier_name text;
  item_return public.marketplace_item_returns;
  next_status text;
begin
  select access.supplier_name into supplier_name from public.marketplace_supplier_access access
  where access.supplier_user_id = auth.uid();
  if supplier_name is null then raise exception 'Supplier Portal access is required.'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Choose approve or reject.'; end if;
  if p_decision = 'reject' and coalesce(trim(p_reason), '') = '' then raise exception 'Enter a reason for rejecting this return.'; end if;
  select * into item_return from public.marketplace_item_returns where id = p_return_id for update;
  if not found or lower(item_return.supplier_name) <> lower(supplier_name) then raise exception 'This return request is not assigned to your supplier account.'; end if;
  if item_return.status <> 'Requested' then raise exception 'This return request has already been reviewed.'; end if;
  next_status := case when p_decision = 'approve' then 'Return In Progress' else 'Admin Review' end;
  update public.marketplace_item_returns set
    status = next_status,
    supplier_response = case when p_decision = 'reject' then left(trim(p_reason), 2000) else 'Return approved. Coordinate the return shipment with the customer.' end,
    updated_at = now(),
    status_history = status_history || jsonb_build_array(jsonb_build_object('status', next_status, 'at', now(), 'by', auth.uid(), 'reason', left(trim(coalesce(p_reason, '')), 2000)))
  where id = p_return_id returning * into item_return;
  return item_return;
end;
$$;
revoke all on function public.respond_marketplace_item_return(uuid, text, text) from public, anon;
grant execute on function public.respond_marketplace_item_return(uuid, text, text) to authenticated;

create or replace function public.mark_marketplace_item_return_received(p_return_id uuid)
returns public.marketplace_item_returns
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplier_name text;
  item_return public.marketplace_item_returns;
begin
  select access.supplier_name into supplier_name from public.marketplace_supplier_access access
  where access.supplier_user_id = auth.uid();
  if supplier_name is null then raise exception 'Supplier Portal access is required.'; end if;
  select * into item_return from public.marketplace_item_returns where id = p_return_id for update;
  if not found or lower(item_return.supplier_name) <> lower(supplier_name) then raise exception 'This return request is not assigned to your supplier account.'; end if;
  if item_return.status <> 'Return In Progress' then raise exception 'Only an approved return can be marked received.'; end if;
  update public.marketplace_item_returns set status = 'Refund Processing', updated_at = now(),
    status_history = status_history || jsonb_build_array(jsonb_build_object('status', 'Refund Processing', 'at', now(), 'by', auth.uid()))
  where id = p_return_id returning * into item_return;
  return item_return;
end;
$$;
revoke all on function public.mark_marketplace_item_return_received(uuid) from public, anon;
grant execute on function public.mark_marketplace_item_return_received(uuid) to authenticated;

create or replace function public.review_marketplace_item_return(p_return_id uuid, p_decision text, p_reason text default '')
returns public.marketplace_item_returns
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_return public.marketplace_item_returns;
  next_status text;
begin
  if public.current_portal_level(auth.uid()) < 2 then raise exception 'Manager or Director access is required to review this return.'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Choose approve or reject.'; end if;
  if p_decision = 'reject' and coalesce(trim(p_reason), '') = '' then raise exception 'Enter a reason for rejecting this return.'; end if;
  select * into item_return from public.marketplace_item_returns where id = p_return_id for update;
  if not found or item_return.status <> 'Admin Review' then raise exception 'This return is not awaiting an admin review.'; end if;
  next_status := case when p_decision = 'approve' then 'Return In Progress' else 'Rejected' end;
  update public.marketplace_item_returns set status = next_status,
    decision_reason = left(trim(coalesce(p_reason, '')), 2000), updated_at = now(),
    status_history = status_history || jsonb_build_array(jsonb_build_object('status', next_status, 'at', now(), 'by', auth.uid(), 'reason', left(trim(coalesce(p_reason, '')), 2000)))
  where id = p_return_id returning * into item_return;
  return item_return;
end;
$$;
revoke all on function public.review_marketplace_item_return(uuid, text, text) from public, anon;
grant execute on function public.review_marketplace_item_return(uuid, text, text) to authenticated;

create or replace function public.complete_marketplace_item_refund(p_return_id uuid)
returns public.marketplace_item_returns
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_return public.marketplace_item_returns;
begin
  if public.current_portal_level(auth.uid()) < 2 then raise exception 'Manager or Director access is required to record a refund.'; end if;
  select * into item_return from public.marketplace_item_returns where id = p_return_id for update;
  if not found or item_return.status <> 'Refund Processing' then raise exception 'This return is not ready to be marked refunded.'; end if;
  update public.marketplace_item_returns set status = 'Refunded', refunded_at = now(), updated_at = now(),
    status_history = status_history || jsonb_build_array(jsonb_build_object('status', 'Refunded', 'at', now(), 'by', auth.uid()))
  where id = p_return_id returning * into item_return;
  return item_return;
end;
$$;
revoke all on function public.complete_marketplace_item_refund(uuid) from public, anon;
grant execute on function public.complete_marketplace_item_refund(uuid) to authenticated;

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
revoke all on function public.get_marketplace_item_return_review_queue() from public, anon;
grant execute on function public.get_marketplace_item_return_review_queue() to authenticated;

create or replace function public.get_marketplace_supplier_orders()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', order_row.id,
    'reference', order_row.reference,
    'status', order_row.status,
    'paymentStatus', order_row.payment_status,
    'paymentMethod', order_row.details->>'paymentMethod',
    'total', order_row.total,
    'createdAt', order_row.created_at,
    'recipientName', coalesce(order_row.details->>'customerName', order_row.details->'address'->>'name', ''),
    'recipientPhone', coalesce(order_row.details->>'deliveryPhone', order_row.details->'address'->>'phone', order_row.details->>'customerPhone', ''),
    'recipientAddress', concat_ws(', ', nullif(order_row.details->'address'->>'street', ''), nullif(order_row.details->'address'->>'postcode', ''), nullif(order_row.details->'address'->>'city', ''), nullif(order_row.details->'address'->>'state', '')),
    'supplierShipment', coalesce(order_row.details->'supplierShipments'->lower(trim(access.supplier_name)), '{}'::jsonb),
    'products', supplier_lines.lines
  )
  from public.marketplace_orders order_row
  join public.marketplace_supplier_access access on access.supplier_user_id = auth.uid()
  cross join lateral (
    select coalesce(jsonb_agg(
      lines.item || jsonb_build_object(
        'lineNumber', lines.line_number,
        'images', coalesce(case when jsonb_typeof(lines.item->'images') = 'array' then lines.item->'images' end, product_catalog.images, '[]'::jsonb),
        'returnRequest', case when item_return.id is null then null else jsonb_build_object(
          'id', item_return.id,
          'status', item_return.status,
          'reason', item_return.reason,
          'photoPath', item_return.photo_path,
          'paidAmount', item_return.paid_amount,
          'shippingRefund', item_return.shipping_refund,
          'refundAmount', item_return.refund_amount,
          'supplierResponse', item_return.supplier_response,
          'decisionReason', item_return.decision_reason,
          'requestedAt', item_return.requested_at,
          'refundedAt', item_return.refunded_at
        ) end
      ) order by lines.line_number
    ), '[]'::jsonb) as lines
    from public.marketplace_order_items lines
    left join public.marketplace_item_returns item_return
      on item_return.order_id = lines.order_id and item_return.line_number = lines.line_number
    left join lateral (
      select product.value->'images' as images
      from public.app_data catalog
      cross join lateral jsonb_array_elements(case when jsonb_typeof(catalog.payload) = 'array' then catalog.payload else '[]'::jsonb end) product(value)
      where catalog.record_id = 'shared:furgo-demo-marketplace-products:shared'
        and product.value->>'id' = lines.item->>'productId'
      limit 1
    ) product_catalog on true
    where lines.order_id = order_row.id
      and lower(coalesce(nullif(trim(lines.item->>'supplierId'), ''), nullif(trim(lines.item->>'supplier'), ''), '')) = lower(access.supplier_name)
  ) supplier_lines
  where jsonb_array_length(supplier_lines.lines) > 0
  order by order_row.created_at desc;
$$;
revoke all on function public.get_marketplace_supplier_orders() from public, anon;
grant execute on function public.get_marketplace_supplier_orders() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketplace_item_returns'
    ) then
    alter publication supabase_realtime add table public.marketplace_item_returns;
  end if;
end;
$$;
