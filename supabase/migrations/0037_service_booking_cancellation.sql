-- Let customers cancel Grooming, Pet Hotel, and Pet Daycare bookings before
-- the order reaches Received Order. The row lock prevents cancellation from
-- racing with an Admin confirmation/status update.
create or replace function public.cancel_service_booking(
  p_service text,
  p_order_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
  previous_status text;
  order_details jsonb;
  booking_owner uuid;
  payment_status text;
  cancellation_status text;
  refund_amount numeric(12,2);
  changed_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Sign in to cancel this booking.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Choose a cancellation reason.'; end if;

  if p_service = 'grooming' then
    select status, details, user_id into current_status, order_details, booking_owner
    from public.grooming_bookings where id = p_order_id::uuid and user_id = auth.uid() for update;
  elsif p_service = 'hotel' then
    select status, details, user_id into current_status, order_details, booking_owner
    from public.pet_hotel_bookings where id = p_order_id and user_id = auth.uid() for update;
  elsif p_service = 'daycare' then
    select status, details, user_id into current_status, order_details, booking_owner
    from public.pet_daycare_bookings where id = p_order_id and user_id = auth.uid() for update;
  else
    raise exception 'This service cannot be cancelled here.';
  end if;

  if booking_owner is null then raise exception 'This booking is not available in your account.'; end if;
  order_details := coalesce(order_details, '{}'::jsonb);
  previous_status := coalesce(nullif(order_details->>'adminStatus', ''), nullif(order_details->>'status', ''), current_status, 'New Order');
  cancellation_status := lower(concat_ws(' ', current_status, order_details->>'status', order_details->>'adminStatus'));
  if (order_details ? 'receipt' and order_details->'receipt' <> 'null'::jsonb)
    or cancellation_status ~ '(received order|in progress|pet taxi|checked.?in|service complete|completed|no.?show|cancel|checked.?out)' then
    raise exception 'This booking can only be cancelled before it reaches Received Order.';
  end if;

  payment_status := coalesce(order_details->>'paymentStatus', '');
  if lower(payment_status) ~ '(paid|successful|succeeded|credit|receipt uploaded)' then
    refund_amount := greatest(coalesce(nullif(order_details->>'total', '')::numeric, 0), 0);
  else
    refund_amount := 0;
  end if;

  order_details := order_details || jsonb_build_object(
    'status', 'Cancelled',
    'adminStatus', 'Cancelled',
    'paymentStatus', case when refund_amount > 0 then 'Refunded to Furgo Credit' else 'Cancelled' end,
    'customerCancellationReason', left(trim(p_reason), 2000),
    'cancelledAt', changed_at,
    'refundAmount', refund_amount,
    'refundStatus', case when refund_amount > 0 then 'Refunded to Furgo Credit' else 'Not Required' end,
    'statusHistory', coalesce(order_details->'statusHistory', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'status', 'Cancelled',
      'previousStatus', previous_status,
      'changedAt', changed_at,
      'changedBy', 'Customer',
      'reason', left(trim(p_reason), 2000),
      'refundAmount', refund_amount
    ))
  );

  if p_service = 'grooming' then
    update public.grooming_bookings set status = 'Cancelled', details = order_details, updated_at = changed_at
    where id = p_order_id::uuid and user_id = auth.uid();
  elsif p_service = 'hotel' then
    update public.pet_hotel_bookings set status = 'Cancelled', details = order_details, updated_at = changed_at
    where id = p_order_id and user_id = auth.uid();
  else
    update public.pet_daycare_bookings set status = 'Cancelled', details = order_details, updated_at = changed_at
    where id = p_order_id and user_id = auth.uid();
  end if;

  return jsonb_build_object('status', 'Cancelled', 'refundAmount', refund_amount, 'refundStatus', order_details->>'refundStatus');
end;
$$;

revoke all on function public.cancel_service_booking(text, text, text) from public, anon;
grant execute on function public.cancel_service_booking(text, text, text) to authenticated;
