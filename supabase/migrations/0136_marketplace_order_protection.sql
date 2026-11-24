begin;

alter table public.marketplace_orders
  add column order_version bigint not null default 0;

-- The database owns the version for both new orders and subsequent updates.
create function public.advance_marketplace_order_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.order_version := case when tg_op = 'INSERT' then 0 else old.order_version + 1 end;
  return new;
end;
$$;
revoke all on function public.advance_marketplace_order_version() from public, anon, authenticated;

create trigger marketplace_order_version
before insert or update on public.marketplace_orders
for each row execute function public.advance_marketplace_order_version();

create function public.update_admin_marketplace_order(
  p_order_id text, p_expected_version bigint, p_action text, p_payload jsonb default '{}'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  portal_level smallint := public.current_portal_level(caller);
  order_row public.marketplace_orders;
  order_details jsonb;
  receipt jsonb;
  current_status text;
  next_status text;
  next_payment text;
  paid boolean;
  dispatched boolean;
  cancelled boolean;
  before_fulfillment boolean;
  history_source text := 'Admin';
  changed_at timestamptz;
begin
  if caller is null or portal_level < 1 then
    raise exception 'Admin Portal access is required.' using errcode = '42501';
  end if;

  select * into order_row from public.marketplace_orders
  where id = p_order_id and public.admin_order_outlet_allowed(outlet) for update;
  if not found then
    raise exception 'This Marketplace order is not available in your outlet.' using errcode = '42501';
  end if;
  if order_row.order_version is distinct from p_expected_version then
    raise sqlstate 'PT409' using message = 'This order changed. Refresh the order and try again.';
  end if;

  changed_at := clock_timestamp();
  order_details := order_row.details;
  if jsonb_typeof(order_details) is distinct from 'object' then
    raise exception 'This Marketplace order has invalid details.';
  end if;
  receipt := order_details->'receipt';
  current_status := lower(trim(order_row.status));
  next_status := order_row.status;
  next_payment := order_row.payment_status;
  paid := lower(next_payment) in ('paid', 'paid with furgo credit', 'successful', 'succeeded', 'completed');
  cancelled := current_status in ('cancelled', 'canceled');
  dispatched := current_status in ('shipped', 'delivered', 'completed')
    or lower(coalesce(order_details->'supplierShipment'->>'status', '')) in ('shipped', 'delivered')
    or exists (
      select 1 from jsonb_each(case when jsonb_typeof(order_details->'supplierShipments') = 'object'
        then order_details->'supplierShipments' else '{}'::jsonb end) shipment
      where lower(shipment.value->>'status') in ('shipped', 'delivered')
    );
  before_fulfillment := current_status in ('new', 'new order', 'paid / processing', 'pending / confirmed',
    'pending payment', 'pending payment verification', 'payment rejected', 'failed payment');

  case p_action
    when 'status' then
      next_status := p_payload->>'status';
      if next_status is not distinct from order_row.status then return to_jsonb(order_row); end if;
      if not coalesce(not cancelled and case next_status
        when 'New Order' then paid and before_fulfillment and not dispatched
        when 'Pending Payment' then not paid and before_fulfillment and not dispatched
        when 'Completed' then paid and (current_status in ('received order', 'in progress', 'shipped', 'delivered') or dispatched)
        when 'Cancelled' then not dispatched and (before_fulfillment or current_status in ('received order', 'in progress'))
        else false end, false) then
        raise exception 'This Marketplace order cannot move to the selected status.';
      end if;
      select nullif(trim(display_name), '') into history_source from public.profiles where id = caller;
      if history_source is not null then
        history_source := history_source || ' (' || case portal_level when 3 then 'director' when 2 then 'manager' else 'executive' end || ')';
      else
        history_source := 'Admin';
      end if;
      if next_status = 'Completed' then
        order_details := order_details || jsonb_build_object('completedAt', changed_at);
      elsif next_status = 'Cancelled' then
        order_details := order_details || jsonb_build_object('cancelledAt', changed_at);
      end if;
    when 'ship' then
      if not paid or cancelled or current_status in ('delivered', 'completed')
        or not (before_fulfillment or current_status in ('received order', 'in progress', 'shipped')) then
        raise exception 'Only an active paid order can be shipped.';
      end if;
      if nullif(trim(p_payload->>'courier'), '') is null or nullif(trim(p_payload->>'trackingNumber'), '') is null
        or coalesce(trim(p_payload->>'trackingUrl'), '') !~* '^(https?://.+)?$' then
        raise exception 'Enter a courier, tracking number, and a valid tracking link if supplied.';
      end if;
      next_status := 'Shipped';
      order_details := order_details || jsonb_build_object(
        'courier', trim(p_payload->>'courier'), 'trackingNumber', trim(p_payload->>'trackingNumber'),
        'trackingUrl', coalesce(trim(p_payload->>'trackingUrl'), ''), 'shippedAt', changed_at
      );
    when 'deliver' then
      if not paid or current_status <> 'shipped' then raise exception 'Only a shipped order can be marked delivered.'; end if;
      next_status := 'Delivered';
      order_details := order_details || jsonb_build_object('deliveredAt', changed_at);
    when 'approve_payment', 'reject_payment' then
      if lower(next_payment) <> 'pending payment verification' or cancelled or dispatched
        or not (before_fulfillment or current_status in ('received order', 'in progress')) then
        raise exception 'This order is no longer awaiting bank transfer verification.';
      end if;
      if p_action = 'approve_payment' then
        next_payment := 'Paid';
        if before_fulfillment then next_status := 'Paid / Processing'; end if;
      else
        if nullif(trim(p_payload->>'reason'), '') is null then raise exception 'Enter a reason for rejecting the payment.'; end if;
        next_payment := 'Payment Rejected';
        next_status := 'Payment Rejected';
        order_details := order_details || jsonb_build_object('paymentRejectionReason', trim(p_payload->>'reason'));
      end if;
      order_details := order_details || jsonb_build_object('paymentStatus', next_payment);
    when 'save_receipt' then
      if nullif(trim(p_payload->>'name'), '') is null or octet_length(p_payload::text) > 2200000 then
        raise exception 'Provide a valid receipt no larger than 1.5 MB.';
      end if;
      if jsonb_typeof(p_payload->'document') = 'object' then
        receipt := jsonb_build_object('name', p_payload->>'name', 'type', 'Full Payment', 'document', p_payload->'document',
          'previousStatus', coalesce(receipt->>'previousStatus', order_row.status));
        history_source := 'Generated receipt';
      elsif coalesce(p_payload->>'data', '') ~* '^data:(image/[a-z0-9.+-]+|application/pdf);base64,[a-z0-9+/=]+$' then
        receipt := jsonb_build_object('name', p_payload->>'name', 'source', 'upload', 'data', p_payload->>'data',
          'previousStatus', coalesce(receipt->>'previousStatus', order_row.status));
        history_source := 'Admin receipt upload';
      else
        raise exception 'Provide receipt details or an image/PDF receipt.';
      end if;
      order_details := order_details || jsonb_build_object('receipt', receipt || jsonb_build_object('uploadedAt', changed_at),
        'adminReceiptUploadedAt', changed_at);
      if before_fulfillment and not dispatched and current_status not in ('payment rejected', 'failed payment') then
        next_status := 'Received Order';
      end if;
    when 'remove_receipt' then
      if jsonb_typeof(receipt) is distinct from 'object' then raise exception 'This order has no receipt to remove.'; end if;
      order_details := order_details - 'receipt' - 'adminReceiptUploadedAt';
      -- Restore only a pre-receipt state that agrees with the current payment.
      if current_status = 'received order' and not dispatched and receipt->>'previousStatus' is not null then
        if paid and lower(receipt->>'previousStatus') in ('new', 'new order', 'paid / processing', 'pending / confirmed') then
          next_status := receipt->>'previousStatus';
        elsif lower(receipt->>'previousStatus') in ('pending payment', 'pending payment verification') then
          next_status := case when paid then 'New Order' else order_row.payment_status end;
        end if;
      end if;
      history_source := 'Admin receipt removal';
    else
      raise exception 'Choose a valid Marketplace order action.';
  end case;

  if next_status is distinct from order_row.status then
    order_details := order_details || jsonb_build_object(
      'status', next_status, 'adminStatus', next_status,
      'statusHistory', (case when jsonb_typeof(order_details->'statusHistory') = 'array'
        then order_details->'statusHistory' else '[]'::jsonb end) || jsonb_build_array(jsonb_build_object(
          'status', next_status, 'previousStatus', order_row.status, 'changedAt', changed_at, 'changedBy', history_source
        ))
    );
  end if;

  -- Preserve existing stock and seller triggers for real lifecycle changes.
  -- A receipt-only edit does not invoke the status or payment triggers.
  if next_payment is distinct from order_row.payment_status then
    update public.marketplace_orders set status = next_status, payment_status = next_payment,
      details = order_details, updated_at = changed_at where id = order_row.id;
  elsif next_status is distinct from order_row.status then
    update public.marketplace_orders set status = next_status,
      details = order_details, updated_at = changed_at where id = order_row.id;
  else
    update public.marketplace_orders set details = order_details, updated_at = changed_at where id = order_row.id;
  end if;

  -- Stock triggers can update the same header again. Return its final version.
  select * into order_row from public.marketplace_orders where id = p_order_id;
  return to_jsonb(order_row);
end;
$$;
revoke all on function public.update_admin_marketplace_order(text, bigint, text, jsonb) from public, anon;
grant execute on function public.update_admin_marketplace_order(text, bigint, text, jsonb) to authenticated;

-- Older tabs must fail closed instead of replaying an order list or deleting lines.
-- Checkout and existing legacy customer inserts retain their current access.
revoke update, delete on public.marketplace_orders, public.marketplace_order_items from anon, authenticated;

commit;
