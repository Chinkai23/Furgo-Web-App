-- Customer notification categories and secure per-device Web Push endpoints.
-- Preferences continue to live in portal_notification_preferences.preferences.

alter table public.portal_notifications
  drop constraint if exists portal_notifications_event_type_check;

alter table public.portal_notifications
  add constraint portal_notifications_event_type_check
  check (event_type in (
    'marketplace_product_request',
    'marketplace_order',
    'marketplace_product_status',
    'local_finder_submission',
    'local_finder_edit',
    'local_finder_review_result',
    'marketplace_order_status',
    'service_booking_update',
    'pet_reminder',
    'pet_care_update',
    'furgo_update'
  ));

create table if not exists public.portal_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_push_subscriptions_user_idx
  on public.portal_push_subscriptions (user_id);

alter table public.portal_push_subscriptions enable row level security;
drop policy if exists "Users manage their own push subscriptions" on public.portal_push_subscriptions;
create policy "Users manage their own push subscriptions"
  on public.portal_push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.portal_push_subscriptions to authenticated;

create or replace function public.save_portal_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  if coalesce(length(trim(p_endpoint)), 0) = 0
     or coalesce(length(trim(p_p256dh)), 0) = 0
     or coalesce(length(trim(p_auth)), 0) = 0 then
    raise exception 'The browser push subscription is incomplete.';
  end if;
  insert into public.portal_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, updated_at)
  values (auth.uid(), trim(p_endpoint), trim(p_p256dh), trim(p_auth), coalesce(p_user_agent, ''), now())
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        updated_at = now();
end;
$$;

revoke all on function public.save_portal_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_portal_push_subscription(text, text, text, text) to authenticated;

create or replace function public.notify_customer_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_ref text := coalesce(nullif(trim(new.reference), ''), new.id);
  changed_at timestamptz := coalesce(new.updated_at, new.created_at, now());
  message_text text;
  event_key text;
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.payment_status is not distinct from old.payment_status then
    return new;
  end if;

  if tg_op = 'INSERT' then
    message_text := 'Your order ' || order_ref || ' was placed and is awaiting updates.';
  else
    message_text := 'Order ' || order_ref || ' is now ' || coalesce(new.status, 'updated')
      || case when coalesce(new.payment_status, '') <> '' then ' · Payment: ' || new.payment_status else '' end || '.';
  end if;
  event_key := new.id || ':' || md5(coalesce(new.status, '') || ':' || coalesce(new.payment_status, '') || ':' || changed_at::text);

  insert into public.portal_notifications (recipient_user_id, event_type, title, message, entity_id)
  values (new.user_id, 'marketplace_order_status', 'Marketplace order update', message_text, event_key)
  on conflict (recipient_user_id, event_type, entity_id) do nothing;
  return new;
end;
$$;

drop trigger if exists customer_marketplace_order_status_notification on public.marketplace_orders;
create trigger customer_marketplace_order_status_notification
after insert or update on public.marketplace_orders
for each row execute function public.notify_customer_order_status();

create or replace function public.notify_customer_service_booking_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(new);
  prior_data jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  booking_id text := coalesce(row_data->>'id', '');
  booking_ref text := coalesce(nullif(trim(row_data->>'reference'), ''), booking_id);
  booking_status text := coalesce(nullif(trim(row_data->>'status'), ''), 'updated');
  owner_id uuid := nullif(row_data->>'user_id', '')::uuid;
  event_key text;
  service_name text;
  message_text text;
  changed_at text := coalesce(row_data->>'updated_at', row_data->>'created_at', now()::text);
begin
  if tg_op = 'UPDATE' and row_data->>'status' is not distinct from prior_data->>'status' then
    return new;
  end if;
  service_name := case tg_table_name
    when 'grooming_bookings' then 'Grooming'
    when 'pet_hotel_bookings' then 'Pet Hotel'
    when 'pet_daycare_bookings' then 'Pet Daycare'
    else 'Service'
  end;
  message_text := case when tg_op = 'INSERT'
    then service_name || ' booking ' || booking_ref || ' was received.'
    else service_name || ' booking ' || booking_ref || ' is now ' || booking_status || '.'
  end;
  event_key := tg_table_name || ':' || booking_id || ':' || md5(booking_status || ':' || changed_at);

  insert into public.portal_notifications (recipient_user_id, event_type, title, message, entity_id)
  values (owner_id, 'service_booking_update', service_name || ' booking update', message_text, event_key)
  on conflict (recipient_user_id, event_type, entity_id) do nothing;
  return new;
end;
$$;

drop trigger if exists customer_grooming_booking_notification on public.grooming_bookings;
create trigger customer_grooming_booking_notification
after insert or update on public.grooming_bookings
for each row execute function public.notify_customer_service_booking_update();

drop trigger if exists customer_pet_hotel_booking_notification on public.pet_hotel_bookings;
create trigger customer_pet_hotel_booking_notification
after insert or update on public.pet_hotel_bookings
for each row execute function public.notify_customer_service_booking_update();

drop trigger if exists customer_pet_daycare_booking_notification on public.pet_daycare_bookings;
create trigger customer_pet_daycare_booking_notification
after insert or update on public.pet_daycare_bookings
for each row execute function public.notify_customer_service_booking_update();

create or replace function public.notify_customer_pet_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_fields text[] := array[]::text[];
  changed_at timestamptz := coalesce(new.updated_at, now());
begin
  if new.weight_kg is distinct from old.weight_kg then changed_fields := array_append(changed_fields, 'weight'); end if;
  if new.vaccination_cards is distinct from old.vaccination_cards
     or new.vaccination_valid_until is distinct from old.vaccination_valid_until then
    changed_fields := array_append(changed_fields, 'vaccination');
  end if;
  if new.remarks is distinct from old.remarks then changed_fields := array_append(changed_fields, 'care notes'); end if;
  if new.name is distinct from old.name
     or new.breed is distinct from old.breed
     or new.sex is distinct from old.sex
     or new.species is distinct from old.species then
    changed_fields := array_append(changed_fields, 'profile');
  end if;
  if cardinality(changed_fields) = 0 then return new; end if;

  insert into public.portal_notifications (recipient_user_id, event_type, title, message, entity_id)
  values (
    new.user_id,
    'pet_care_update',
    coalesce(nullif(trim(new.name), ''), 'Pet') || ' care profile updated',
    coalesce(nullif(trim(new.name), ''), 'Your pet') || '’s ' || array_to_string(changed_fields, ', ') || ' details were updated.',
    'pet-profile:' || new.id::text || ':' || md5(to_jsonb(new)::text || changed_at::text)
  )
  on conflict (recipient_user_id, event_type, entity_id) do nothing;
  return new;
end;
$$;

drop trigger if exists customer_pet_profile_update_notification on public.pet_profiles;
create trigger customer_pet_profile_update_notification
after update on public.pet_profiles
for each row execute function public.notify_customer_pet_profile_update();

create or replace function public.create_customer_pet_reminder_notification(
  p_title text,
  p_message text,
  p_entity_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  if coalesce(length(trim(p_title)), 0) not between 1 and 120
     or coalesce(length(trim(p_message)), 0) not between 1 and 500
     or coalesce(length(trim(p_entity_id)), 0) not between 1 and 240 then
    raise exception 'Reminder notification details are invalid.';
  end if;
  insert into public.portal_notifications (recipient_user_id, event_type, title, message, entity_id)
  values (auth.uid(), 'pet_reminder', trim(p_title), trim(p_message), trim(p_entity_id))
  on conflict (recipient_user_id, event_type, entity_id) do nothing;
end;
$$;

revoke all on function public.create_customer_pet_reminder_notification(text, text, text) from public, anon;
grant execute on function public.create_customer_pet_reminder_notification(text, text, text) to authenticated;

create or replace function public.publish_furgo_customer_update(p_title text, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  broadcast_id uuid := gen_random_uuid();
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 1 then
    raise exception 'Admin access is required to publish a Furgo update.';
  end if;
  if coalesce(length(trim(p_title)), 0) not between 1 and 120
     or coalesce(length(trim(p_message)), 0) not between 1 and 1000 then
    raise exception 'Enter a title and a message for the Furgo update.';
  end if;

  insert into public.portal_notifications (recipient_user_id, event_type, title, message, entity_id)
  select roles.user_id, 'furgo_update', trim(p_title), trim(p_message), broadcast_id::text
  from public.user_roles roles
  where roles.role = 'customer'::public.app_role
  on conflict (recipient_user_id, event_type, entity_id) do nothing;
  return broadcast_id;
end;
$$;

revoke all on function public.publish_furgo_customer_update(text, text) from public, anon;
grant execute on function public.publish_furgo_customer_update(text, text) to authenticated;
