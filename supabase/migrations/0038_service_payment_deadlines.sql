-- Give unpaid online service bookings the same one-hour payment window as
-- Marketplace. The RPCs are owner-scoped and keep the expiry check server-side.

create or replace function public.expire_service_pending_payment(p_service text, p_order_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row record;
  details_row jsonb;
  changed_at timestamptz := now();
begin
  if auth.uid() is null then return false; end if;
  if p_service = 'grooming' then
    select id, user_id, status, details into booking_row from public.grooming_bookings
      where id::text = p_order_id and user_id = auth.uid() for update;
  elsif p_service = 'hotel' then
    select id, user_id, status, details into booking_row from public.pet_hotel_bookings
      where id = p_order_id and user_id = auth.uid() for update;
  elsif p_service = 'daycare' then
    select id, user_id, status, details into booking_row from public.pet_daycare_bookings
      where id = p_order_id and user_id = auth.uid() for update;
  else
    return false;
  end if;
  if booking_row.id is null then return false; end if;
  details_row := coalesce(booking_row.details, '{}'::jsonb);
  if coalesce(details_row->>'paymentStatus', '') <> 'Pending Payment'
    or lower(coalesce(details_row->>'paymentMethod', '')) not in ('gateway', 'online payment')
    or nullif(details_row->>'paymentDeadlineAt', '') is null
    or (details_row->>'paymentDeadlineAt')::timestamptz > changed_at
    or lower(concat_ws(' ', booking_row.status, details_row->>'status', details_row->>'adminStatus')) like '%cancel%' then
    return false;
  end if;
  details_row := details_row || jsonb_build_object(
    'status', 'Cancelled', 'adminStatus', 'Cancelled', 'paymentStatus', 'Failed Payment',
    'cancelledAt', changed_at, 'cancellationReason', 'Payment window expired', 'refundAmount', 0,
    'refundStatus', 'Not Required',
    'statusHistory', coalesce(details_row->'statusHistory', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'status', 'Cancelled', 'previousStatus', booking_row.status, 'changedAt', changed_at,
      'changedBy', 'System', 'reason', 'Payment window expired'
    ))
  );
  if p_service = 'grooming' then
    update public.grooming_bookings set status = 'Cancelled', details = details_row, updated_at = changed_at where id::text = p_order_id;
  elsif p_service = 'hotel' then
    update public.pet_hotel_bookings set status = 'Cancelled', details = details_row, updated_at = changed_at where id = p_order_id;
  else
    update public.pet_daycare_bookings set status = 'Cancelled', details = details_row, updated_at = changed_at where id = p_order_id;
  end if;
  return true;
end;
$$;
revoke all on function public.expire_service_pending_payment(text, text) from public, anon;
grant execute on function public.expire_service_pending_payment(text, text) to authenticated;

create or replace function public.complete_service_demo_payment(p_service text, p_order_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row record;
  details_row jsonb;
  changed_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Sign in to continue payment.'; end if;
  if p_service = 'grooming' then
    select id, user_id, status, details into booking_row from public.grooming_bookings
      where id::text = p_order_id and user_id = auth.uid() for update;
  elsif p_service = 'hotel' then
    select id, user_id, status, details into booking_row from public.pet_hotel_bookings
      where id = p_order_id and user_id = auth.uid() for update;
  elsif p_service = 'daycare' then
    select id, user_id, status, details into booking_row from public.pet_daycare_bookings
      where id = p_order_id and user_id = auth.uid() for update;
  else
    raise exception 'This service does not support online payment.';
  end if;
  if booking_row.id is null then raise exception 'This booking is not available in your account.'; end if;
  details_row := coalesce(booking_row.details, '{}'::jsonb);
  if lower(coalesce(details_row->>'paymentStatus', '')) in ('paid', 'paid with furgo credit') then return 'already_paid'; end if;
  if coalesce(details_row->>'paymentStatus', '') <> 'Pending Payment'
    or lower(coalesce(details_row->>'paymentMethod', '')) not in ('gateway', 'online payment') then
    raise exception 'This booking is not awaiting online payment.';
  end if;
  if nullif(details_row->>'paymentDeadlineAt', '') is null
    or (details_row->>'paymentDeadlineAt')::timestamptz <= changed_at then
    perform public.expire_service_pending_payment(p_service, p_order_id);
    return 'expired';
  end if;
  details_row := details_row || jsonb_build_object(
    'status', 'New Order', 'adminStatus', 'New Order', 'paymentStatus', 'Paid', 'paidAt', changed_at,
    'statusHistory', coalesce(details_row->'statusHistory', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'status', 'New Order', 'previousStatus', booking_row.status, 'changedAt', changed_at, 'changedBy', 'Customer'
    ))
  );
  if p_service = 'grooming' then
    update public.grooming_bookings set status = 'New Order', details = details_row, updated_at = changed_at where id::text = p_order_id;
  elsif p_service = 'hotel' then
    update public.pet_hotel_bookings set status = 'New Order', details = details_row, updated_at = changed_at where id = p_order_id;
  else
    update public.pet_daycare_bookings set status = 'New Order', details = details_row, updated_at = changed_at where id = p_order_id;
  end if;
  return 'paid';
end;
$$;
revoke all on function public.complete_service_demo_payment(text, text) from public, anon;
grant execute on function public.complete_service_demo_payment(text, text) to authenticated;

-- If Supabase's pg_cron extension is enabled, expire all unpaid orders in the
-- background even when the customer has closed My Orders. Browser countdowns
-- remain display-only and the payment RPCs enforce the same deadline.
create or replace function public.expire_all_pending_online_payments()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_at timestamptz := now();
begin
  update public.marketplace_orders
  set status = 'Cancelled', payment_status = 'Failed Payment',
      details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'cancelledAt', changed_at, 'cancellationReason', 'Payment window expired',
        'refundAmount', 0, 'refundStatus', 'Not Required'
      ), updated_at = changed_at
  where status = 'Pending Payment' and payment_status = 'Pending Payment'
    and lower(coalesce(details->>'paymentMethod', '')) = 'online payment'
    and nullif(details->>'paymentDeadlineAt', '') is not null
    and (details->>'paymentDeadlineAt')::timestamptz <= changed_at;

  update public.grooming_bookings
  set status = 'Cancelled', details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'status', 'Cancelled', 'adminStatus', 'Cancelled', 'paymentStatus', 'Failed Payment',
        'cancelledAt', changed_at, 'cancellationReason', 'Payment window expired',
        'refundAmount', 0, 'refundStatus', 'Not Required'
      ), updated_at = changed_at
  where details->>'paymentStatus' = 'Pending Payment'
    and lower(coalesce(details->>'paymentMethod', '')) in ('gateway', 'online payment')
    and nullif(details->>'paymentDeadlineAt', '') is not null
    and (details->>'paymentDeadlineAt')::timestamptz <= changed_at
    and status <> 'Cancelled';

  update public.pet_hotel_bookings
  set status = 'Cancelled', details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'status', 'Cancelled', 'adminStatus', 'Cancelled', 'paymentStatus', 'Failed Payment',
        'cancelledAt', changed_at, 'cancellationReason', 'Payment window expired',
        'refundAmount', 0, 'refundStatus', 'Not Required'
      ), updated_at = changed_at
  where details->>'paymentStatus' = 'Pending Payment'
    and lower(coalesce(details->>'paymentMethod', '')) in ('gateway', 'online payment')
    and nullif(details->>'paymentDeadlineAt', '') is not null
    and (details->>'paymentDeadlineAt')::timestamptz <= changed_at
    and status <> 'Cancelled';

  update public.pet_daycare_bookings
  set status = 'Cancelled', details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'status', 'Cancelled', 'adminStatus', 'Cancelled', 'paymentStatus', 'Failed Payment',
        'cancelledAt', changed_at, 'cancellationReason', 'Payment window expired',
        'refundAmount', 0, 'refundStatus', 'Not Required'
      ), updated_at = changed_at
  where details->>'paymentStatus' = 'Pending Payment'
    and lower(coalesce(details->>'paymentMethod', '')) in ('gateway', 'online payment')
    and nullif(details->>'paymentDeadlineAt', '') is not null
    and (details->>'paymentDeadlineAt')::timestamptz <= changed_at
    and status <> 'Cancelled';
end;
$$;
revoke all on function public.expire_all_pending_online_payments() from public, anon, authenticated;

do $$
begin
  if to_regnamespace('cron') is not null then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = ''furgo-expire-unpaid-orders''';
    execute 'select cron.schedule(''furgo-expire-unpaid-orders'', ''* * * * *'', ''select public.expire_all_pending_online_payments()'')';
  end if;
end;
$$;
