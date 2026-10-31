-- Customer order cancellation, bank-transfer repayment, and cancellation refund tracking.
-- Payment refunds are recorded after staff send them through the original payment method;
-- no payment provider is connected to this prototype yet.

create or replace function public.complete_marketplace_demo_payment(p_order_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.marketplace_orders;
  deadline timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to continue payment.'; end if;
  select * into order_row from public.marketplace_orders
  where id = p_order_id and user_id = auth.uid() for update;
  if not found then raise exception 'This order is not available in your account.'; end if;
  if order_row.payment_status = 'Paid' then return 'already_paid'; end if;
  if order_row.status <> 'Pending Payment' or order_row.payment_status <> 'Pending Payment'
    or lower(coalesce(order_row.details->>'paymentMethod', '')) <> 'online payment' then
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
    details = coalesce(details, '{}'::jsonb) || jsonb_build_object('paidAt', now()), updated_at = now()
  where id = p_order_id;
  return 'paid';
end;
$$;
revoke all on function public.complete_marketplace_demo_payment(text) from public, anon;
grant execute on function public.complete_marketplace_demo_payment(text) to authenticated;

create or replace function public.expire_marketplace_pending_payment(p_order_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.marketplace_orders;
  deadline timestamptz;
begin
  if auth.uid() is null then return false; end if;
  select * into order_row from public.marketplace_orders
  where id = p_order_id and user_id = auth.uid() for update;
  if not found or order_row.status <> 'Pending Payment' or order_row.payment_status <> 'Pending Payment' then return false; end if;
  deadline := nullif(order_row.details->>'paymentDeadlineAt', '')::timestamptz;
  if deadline is null or deadline > now() then return false; end if;
  update public.marketplace_orders set status = 'Cancelled', payment_status = 'Failed Payment',
    details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
      'cancelledAt', now(), 'cancellationReason', 'Payment window expired', 'refundAmount', 0, 'refundStatus', 'Not Required'
    ), updated_at = now()
  where id = p_order_id;
  return true;
end;
$$;
revoke all on function public.expire_marketplace_pending_payment(text) from public, anon;
grant execute on function public.expire_marketplace_pending_payment(text) to authenticated;

create or replace function public.cancel_marketplace_order(p_order_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.marketplace_orders;
  shipment jsonb;
  paid boolean;
  refund_amount numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Sign in to cancel this order.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter a cancellation reason.'; end if;
  select * into order_row from public.marketplace_orders
  where id = p_order_id and user_id = auth.uid() for update;
  if not found then raise exception 'This order is not available in your account.'; end if;
  if lower(coalesce(order_row.status, '')) like '%cancel%' then raise exception 'This order has already been cancelled.'; end if;
  if order_row.details ? 'receipt' and order_row.details->'receipt' <> 'null'::jsonb then
    raise exception 'Furgo has confirmed this order, so it can no longer be cancelled online.';
  end if;
  if lower(coalesce(order_row.status, '')) ~ '(received order|shipped|delivered|completed)' then
    raise exception 'Furgo has confirmed or shipped this order, so it can no longer be cancelled online.';
  end if;
  for shipment in select value from jsonb_each(coalesce(order_row.details->'supplierShipments', '{}'::jsonb)) loop
    if lower(coalesce(shipment->>'status', '')) in ('shipped', 'in transit', 'delivered') then
      raise exception 'A supplier has shipped this order, so it can no longer be cancelled online.';
    end if;
  end loop;
  paid := lower(coalesce(order_row.payment_status, '')) in ('paid', 'paid with furgo credit', 'successful', 'succeeded', 'completed');
  refund_amount := case when paid then greatest(coalesce(order_row.total, 0), 0) else 0 end;
  update public.marketplace_orders set
    status = 'Cancelled',
    payment_status = case when paid then 'Refund Processing' else 'Cancelled' end,
    details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
      'customerCancellationReason', left(trim(p_reason), 2000),
      'cancelledAt', now(),
      'refundAmount', refund_amount,
      'refundStatus', case when paid then 'Refund Processing' else 'Not Required' end
    ),
    updated_at = now()
  where id = p_order_id;
end;
$$;
revoke all on function public.cancel_marketplace_order(text, text) from public, anon;
grant execute on function public.cancel_marketplace_order(text, text) to authenticated;

create or replace function public.resubmit_marketplace_payment(p_order_id text, p_transfer_slip jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.marketplace_orders;
begin
  if auth.uid() is null then raise exception 'Sign in to retry payment.'; end if;
  if coalesce(p_transfer_slip->>'name', '') = '' or coalesce(p_transfer_slip->>'data', '') !~ '^data:(image/(png|jpeg|webp)|application/pdf);base64,' then
    raise exception 'Upload a valid transfer slip image or PDF.';
  end if;
  select * into order_row from public.marketplace_orders
  where id = p_order_id and user_id = auth.uid() for update;
  if not found then raise exception 'This order is not available in your account.'; end if;
  if lower(coalesce(order_row.payment_status, '')) not in ('payment rejected', 'failed payment') then
    raise exception 'This order does not need a payment retry.';
  end if;
  if lower(coalesce(order_row.details->>'paymentMethod', '')) not like '%transfer%' then
    raise exception 'A transfer slip can only be resubmitted for a bank-transfer order.';
  end if;
  if lower(coalesce(order_row.status, '')) like '%cancel%' then raise exception 'Cancelled orders cannot be paid again.'; end if;
  update public.marketplace_orders set
    status = 'Pending Payment Verification',
    payment_status = 'Pending Payment Verification',
    details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
      'transferSlip', p_transfer_slip,
      'paymentRetryAt', now(),
      'paymentRetryCount', coalesce(nullif(details->>'paymentRetryCount', '')::integer, 0) + 1
    ) - 'paymentRejectionReason',
    updated_at = now()
  where id = p_order_id;
end;
$$;
revoke all on function public.resubmit_marketplace_payment(text, jsonb) from public, anon;
grant execute on function public.resubmit_marketplace_payment(text, jsonb) to authenticated;

create or replace function public.complete_marketplace_order_cancellation_refund(p_order_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_portal_level(auth.uid()) < 2 then raise exception 'Manager or Director access is required to record a refund.'; end if;
  update public.marketplace_orders set
    payment_status = 'Refunded',
    details = coalesce(details, '{}'::jsonb) || jsonb_build_object('refundStatus', 'Refunded', 'refundedAt', now()),
    updated_at = now()
  where id = p_order_id
    and status = 'Cancelled'
    and details->>'refundStatus' = 'Refund Processing';
  if not found then raise exception 'This cancelled order is not awaiting a refund.'; end if;
end;
$$;
revoke all on function public.complete_marketplace_order_cancellation_refund(text) from public, anon;
grant execute on function public.complete_marketplace_order_cancellation_refund(text) to authenticated;
