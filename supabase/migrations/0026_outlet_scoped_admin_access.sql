-- Add outlet assignments for Executive and Manager accounts and scope their orders.

create table public.admin_outlets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 100),
  shortform text not null unique check (shortform ~ '^[A-Z0-9]{2,8}$'),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admin_outlets enable row level security;
create policy "Authenticated users can read outlet names"
  on public.admin_outlets for select to authenticated using (public.current_portal_level(auth.uid()) >= 1);
grant select on public.admin_outlets to authenticated;

alter table public.portal_access
  add column outlet_id uuid references public.admin_outlets (id) on delete set null;
create index portal_access_outlet_id_idx on public.portal_access (outlet_id, level);

alter table public.marketplace_orders add column outlet text not null default '';
create index marketplace_orders_outlet_created_idx on public.marketplace_orders (outlet, created_at desc);
update public.marketplace_orders
set outlet = coalesce(nullif(details->>'outlet', ''), nullif(details->>'fulfillmentOutlet', ''), nullif(details->>'location', ''), '');

create or replace function public.current_admin_outlet_id(_user_id uuid default auth.uid())
returns uuid
language sql stable security definer set search_path = ''
as $$
  select access.outlet_id from public.portal_access access where access.user_id = _user_id;
$$;
revoke all on function public.current_admin_outlet_id(uuid) from public, anon;
grant execute on function public.current_admin_outlet_id(uuid) to authenticated;

create or replace function public.admin_order_outlet_allowed(_outlet text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when public.current_portal_level(auth.uid()) >= 3 then true
    when public.current_portal_level(auth.uid()) between 1 and 2 then
      coalesce(nullif(trim(_outlet), ''), '') <> ''
      and lower(trim(_outlet)) = lower(trim(coalesce((
        select outlet.name from public.portal_access access
        join public.admin_outlets outlet on outlet.id = access.outlet_id
        where access.user_id = auth.uid()
      ), '')))
    else false
  end;
$$;
revoke all on function public.admin_order_outlet_allowed(text) from public, anon;
grant execute on function public.admin_order_outlet_allowed(text) to authenticated;

create or replace function public.admin_app_data_outlet_allowed(_scope text, _storage_key text, _payload jsonb)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  assigned_name text;
  item jsonb;
begin
  if public.current_portal_level(auth.uid()) >= 3 then return true; end if;
  if public.current_portal_level(auth.uid()) < 1 then return false; end if;
  if _scope <> 'operation' then return false; end if;
  if _storage_key = 'furgo-demo-check-in-tokens' then return true; end if;
  if _storage_key not in (
    'furgo-demo-marketplace-orders', 'furgo-demo-hotel-bookings',
    'furgo-demo-daycare-bookings', 'furgo-demo-daycare-orders'
  ) then return false; end if;
  select outlet.name into assigned_name from public.portal_access access
  join public.admin_outlets outlet on outlet.id = access.outlet_id
  where access.user_id = auth.uid();
  if assigned_name is null or jsonb_typeof(_payload) is distinct from 'array' then return false; end if;
  for item in select value from jsonb_array_elements(_payload) loop
    if lower(trim(coalesce(item->>'outlet', ''))) <> lower(trim(assigned_name)) then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.admin_app_data_outlet_allowed(text, text, jsonb) from public, anon;
grant execute on function public.admin_app_data_outlet_allowed(text, text, jsonb) to authenticated;

-- Directors can create outlets; managers can only see and manage their assigned team.
create or replace function public.get_admin_outlets()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.current_portal_level(auth.uid()) < 3 then raise exception 'Only Directors can manage outlet setup.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'shortform', shortform, 'active', active) order by name)
    from public.admin_outlets where active), '[]'::jsonb);
end;
$$;
revoke all on function public.get_admin_outlets() from public, anon;
grant execute on function public.get_admin_outlets() to authenticated;

create or replace function public.manage_admin_outlet(p_name text, p_shortform text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  if public.current_portal_level(auth.uid()) < 3 then raise exception 'Only Directors can add outlets.'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 100 then raise exception 'Enter an outlet name between 2 and 100 characters.'; end if;
  if upper(trim(coalesce(p_shortform, ''))) !~ '^[A-Z0-9]{2,8}$' then raise exception 'Use a shortform with 2 to 8 letters or numbers.'; end if;
  insert into public.admin_outlets(name, shortform, created_by)
  values (trim(p_name), upper(trim(p_shortform)), auth.uid()) returning id into new_id;
  return jsonb_build_object('id', new_id, 'name', trim(p_name), 'shortform', upper(trim(p_shortform)));
end;
$$;
revoke all on function public.manage_admin_outlet(text, text) from public, anon;
grant execute on function public.manage_admin_outlet(text, text) to authenticated;

create or replace function public.get_admin_team()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  caller_rank smallint := public.current_portal_level(auth.uid());
  caller_outlet uuid := public.current_admin_outlet_id(auth.uid());
begin
  if caller_rank < 2 then raise exception 'Only Managers and Directors can manage portal users.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', member.user_id, 'level', member.level, 'display_name', member.display_name,
      'email', member.email, 'created_at', member.created_at,
      'outlet_id', member.outlet_id, 'outlet_name', member.outlet_name, 'outlet_shortform', member.outlet_shortform
    ) order by member.sort_rank, member.display_name)
    from (
      select access.user_id, access.level::text as level,
        coalesce(nullif(profile.display_name, ''), profile.email, 'Furgo user') as display_name,
        profile.email, access.created_at, access.outlet_id, outlet.name as outlet_name, outlet.shortform as outlet_shortform,
        case access.level when 'director' then 1 when 'manager' then 2 else 3 end as sort_rank
      from public.portal_access access
      join public.profiles profile on profile.id = access.user_id
      left join public.admin_outlets outlet on outlet.id = access.outlet_id
      where (caller_rank = 3 and (case access.level when 'director' then 3 when 'manager' then 2 else 1 end < caller_rank or access.level = 'director'))
         or (caller_rank = 2 and access.level = 'executive' and access.outlet_id = caller_outlet)
      union all
      select role_entry.user_id, 'driver'::text, coalesce(nullif(profile.display_name, ''), profile.email, 'Furgo user'),
        profile.email, role_entry.created_at, null::uuid, null::text, null::text, 4
      from public.user_roles role_entry join public.profiles profile on profile.id = role_entry.user_id
      where role_entry.role::text = 'driver' and caller_rank = 3
    ) member
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_admin_team() from public, anon;
grant execute on function public.get_admin_team() to authenticated;

create or replace function public.manage_admin_team_member(p_email text, p_level text, p_action text, p_outlet_id uuid default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_rank smallint := public.current_portal_level(auth.uid());
  caller_outlet uuid := public.current_admin_outlet_id(auth.uid());
  target uuid;
  target_rank smallint;
  target_outlet uuid;
  requested_rank smallint;
  requested_level public.portal_level;
  action_name text := lower(coalesce(p_action, 'add'));
  requested_type text := lower(coalesce(p_level, ''));
begin
  if caller_rank < 2 then raise exception 'Only Managers and Directors can manage portal users.'; end if;
  if action_name not in ('add', 'update', 'remove') then raise exception 'Unsupported team action.'; end if;
  select profile.id into target from public.profiles profile where lower(profile.email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if target is null then raise exception 'No Furgo account was found for that email. The person must register first.'; end if;
  if target = caller then raise exception 'You cannot change your own portal level.'; end if;
  target_rank := public.current_portal_level(target);
  select access.outlet_id into target_outlet from public.portal_access access where access.user_id = target;

  if action_name = 'remove' and requested_type = 'director' then
    raise exception 'Director removals must use the approval request workflow.';
  end if;
  if requested_type = 'driver' then
    if caller_rank < 3 then raise exception 'Only Directors can add or remove Driver access.'; end if;
    if action_name = 'update' then raise exception 'Driver access cannot be changed with the admin-level editor.'; end if;
    if action_name = 'remove' then
      delete from public.user_roles where user_id = target and role::text = 'driver';
      if not found then raise exception 'This account does not have Driver access.'; end if;
      perform public.log_admin_action('portal_access_removed', 'team_member', target::text, jsonb_build_object('email', lower(trim(p_email)), 'account_type', 'driver'));
      return jsonb_build_object('ok', true, 'action', action_name, 'level', 'driver');
    end if;
    if target_rank > 0 then raise exception 'Accounts with an admin portal level cannot also be assigned as Drivers.'; end if;
    insert into public.user_roles(user_id, role) values (target, 'driver'::public.app_role) on conflict (user_id, role) do nothing;
    perform public.log_admin_action('portal_access_added', 'team_member', target::text, jsonb_build_object('email', lower(trim(p_email)), 'account_type', 'driver'));
    return jsonb_build_object('ok', true, 'action', action_name, 'level', 'driver');
  end if;

  if action_name = 'remove' then
    if caller_rank = 2 then
      if target_rank <> 1 or target_outlet is distinct from caller_outlet then raise exception 'Managers can only remove Executive access at their assigned outlet.'; end if;
    elsif target_rank > caller_rank or (target_rank = caller_rank and not (caller_rank = 3 and target_rank = 3)) then
      raise exception 'You can only remove users below your own level. Directors may remove another Director through approval.';
    end if;
    delete from public.portal_access where user_id = target;
    delete from public.user_roles where user_id = target and role::text in ('staff', 'admin');
    perform public.log_admin_action('portal_access_removed', 'team_member', target::text,
      jsonb_build_object('email', lower(trim(p_email)), 'previous_level', case target_rank when 3 then 'director' when 2 then 'manager' when 1 then 'executive' else 'customer' end));
    return jsonb_build_object('ok', true, 'action', action_name);
  end if;

  requested_rank := case requested_type when 'executive' then 1 when 'manager' then 2 when 'director' then 3 else 0 end;
  if requested_rank = 0 then raise exception 'Choose a valid portal level.'; end if;
  if target_rank >= caller_rank and not (caller_rank = 3 and target_rank = 3 and requested_rank = 3) then raise exception 'You can only edit users below your own level.'; end if;
  if caller_rank = 2 then
    if requested_type <> 'executive' or p_outlet_id is distinct from caller_outlet
       or (action_name = 'update' and (target_rank <> 1 or target_outlet is distinct from caller_outlet))
       or (action_name = 'add' and target_rank = 1 and target_outlet is distinct from caller_outlet)
       or exists (select 1 from public.user_roles where user_id = target and role::text = 'driver') then
      raise exception 'Managers can only assign Executive access at their assigned outlet.';
    end if;
  end if;
  if requested_rank > caller_rank or (requested_rank = caller_rank and caller_rank <> 3) then
    raise exception 'You can only assign levels at or below your own. Only Directors can add other Directors.';
  end if;
  if requested_type in ('executive', 'manager') then
    if p_outlet_id is null then raise exception 'Choose an outlet for this account.'; end if;
    if not exists(select 1 from public.admin_outlets where id = p_outlet_id and active) then raise exception 'Choose an active outlet.'; end if;
    if caller_rank = 2 and p_outlet_id is distinct from caller_outlet then raise exception 'Managers can only assign users to their own outlet.'; end if;
  elsif requested_type = 'director' then
    if caller_rank < 3 then raise exception 'Only Directors can assign Director access.'; end if;
    p_outlet_id := null;
  end if;
  requested_level := requested_type::public.portal_level;
  delete from public.user_roles where user_id = target and role::text in ('staff', 'admin');
  insert into public.user_roles(user_id, role) values (target, case when requested_level = 'director' then 'admin'::public.app_role else 'staff'::public.app_role end);
  insert into public.portal_access(user_id, level, outlet_id, assigned_by, updated_at)
  values(target, requested_level, p_outlet_id, caller, now())
  on conflict(user_id) do update set level = excluded.level, outlet_id = excluded.outlet_id, assigned_by = excluded.assigned_by, updated_at = now();
  perform public.log_admin_action(case when action_name = 'add' then 'portal_access_added' else 'portal_access_level_changed' end,
    'team_member', target::text, jsonb_build_object('email', lower(trim(p_email)), 'level', requested_level, 'outlet_id', p_outlet_id));
  return jsonb_build_object('ok', true, 'action', action_name, 'level', requested_level, 'outlet_id', p_outlet_id);
end;
$$;
revoke all on function public.manage_admin_team_member(text, text, text) from public, anon, authenticated;
revoke all on function public.manage_admin_team_member(text, text, text, uuid) from public, anon;
grant execute on function public.manage_admin_team_member(text, text, text, uuid) to authenticated;

-- Keep service orders, inserts, and status changes inside the assigned outlet.
drop policy if exists "Customers and admins can read grooming bookings" on public.grooming_bookings;
create policy "Customers and outlet admins read grooming bookings" on public.grooming_bookings for select to authenticated
using (user_id = auth.uid() or public.admin_order_outlet_allowed(outlet));
drop policy if exists "Admins can update grooming bookings" on public.grooming_bookings;
create policy "Outlet admins update grooming bookings" on public.grooming_bookings for update to authenticated
using (public.admin_order_outlet_allowed(outlet)) with check (public.admin_order_outlet_allowed(outlet));
create policy "Restrict grooming order reads and updates by outlet" on public.grooming_bookings as restrictive for all to authenticated
using (not public.has_role(auth.uid(), 'staff') or user_id = auth.uid() or public.admin_order_outlet_allowed(outlet))
with check (not public.has_role(auth.uid(), 'staff') or user_id = auth.uid() or public.admin_order_outlet_allowed(outlet));

drop policy if exists "Customers and admins read Pet Hotel bookings" on public.pet_hotel_bookings;
create policy "Customers and outlet admins read Pet Hotel bookings" on public.pet_hotel_bookings for select to authenticated
using (user_id = auth.uid() or public.admin_order_outlet_allowed(outlet));
drop policy if exists "Customers and admins update Pet Hotel bookings" on public.pet_hotel_bookings;
create policy "Customers and outlet admins update Pet Hotel bookings" on public.pet_hotel_bookings for update to authenticated
using ((user_id = auth.uid() and not public.has_role(auth.uid(), 'admin')) or public.admin_order_outlet_allowed(outlet))
with check ((user_id = auth.uid() and not public.has_role(auth.uid(), 'admin')) or public.admin_order_outlet_allowed(outlet));
create policy "Restrict Pet Hotel order reads and updates by outlet" on public.pet_hotel_bookings as restrictive for all to authenticated
using (not public.has_role(auth.uid(), 'staff') or user_id = auth.uid() or public.admin_order_outlet_allowed(outlet))
with check (not public.has_role(auth.uid(), 'staff') or user_id = auth.uid() or public.admin_order_outlet_allowed(outlet));
drop policy if exists "Customers and admins read Pet Daycare bookings" on public.pet_daycare_bookings;
create policy "Customers and outlet admins read Pet Daycare bookings" on public.pet_daycare_bookings for select to authenticated
using (user_id = auth.uid() or public.admin_order_outlet_allowed(outlet));
drop policy if exists "Customers and admins update Pet Daycare bookings" on public.pet_daycare_bookings;
create policy "Customers and outlet admins update Pet Daycare bookings" on public.pet_daycare_bookings for update to authenticated
using ((user_id = auth.uid() and not public.has_role(auth.uid(), 'admin')) or public.admin_order_outlet_allowed(outlet))
with check ((user_id = auth.uid() and not public.has_role(auth.uid(), 'admin')) or public.admin_order_outlet_allowed(outlet));
create policy "Restrict Pet Daycare order reads and updates by outlet" on public.pet_daycare_bookings as restrictive for all to authenticated
using (not public.has_role(auth.uid(), 'staff') or user_id = auth.uid() or public.admin_order_outlet_allowed(outlet))
with check (not public.has_role(auth.uid(), 'staff') or user_id = auth.uid() or public.admin_order_outlet_allowed(outlet));

drop policy if exists "Customers and admins read marketplace orders" on public.marketplace_orders;
create policy "Customers and outlet admins read marketplace orders" on public.marketplace_orders for select to authenticated
using (user_id = auth.uid() or public.admin_order_outlet_allowed(outlet));
drop policy if exists "Customers and admins update marketplace orders" on public.marketplace_orders;
create policy "Customers and outlet admins update marketplace orders" on public.marketplace_orders for update to authenticated
using ((user_id = auth.uid() and not public.has_role(auth.uid(), 'admin')) or public.admin_order_outlet_allowed(outlet))
with check ((user_id = auth.uid() and not public.has_role(auth.uid(), 'admin')) or public.admin_order_outlet_allowed(outlet));
create policy "Restrict marketplace order reads and updates by outlet" on public.marketplace_orders as restrictive for all to authenticated
using (not public.has_role(auth.uid(), 'staff') or user_id = auth.uid() or public.admin_order_outlet_allowed(outlet))
with check (not public.has_role(auth.uid(), 'staff') or user_id = auth.uid() or public.admin_order_outlet_allowed(outlet));
create policy "Outlet admins read marketplace order items" on public.marketplace_order_items for select to authenticated
using (exists (select 1 from public.marketplace_orders order_row where order_row.id = order_id and public.admin_order_outlet_allowed(order_row.outlet)));

create policy "Restrict marketplace order inserts to assigned outlet" on public.marketplace_orders as restrictive for insert to authenticated
with check ((user_id = auth.uid() and not public.has_role(auth.uid(), 'admin')) or public.admin_order_outlet_allowed(outlet));
create policy "Restrict marketplace order deletes to assigned outlet" on public.marketplace_orders as restrictive for delete to authenticated
using ((user_id = auth.uid() and not public.has_role(auth.uid(), 'admin')) or public.admin_order_outlet_allowed(outlet));
create policy "Restrict Pet Hotel booking deletes to assigned outlet" on public.pet_hotel_bookings as restrictive for delete to authenticated
using ((user_id = auth.uid() and not public.has_role(auth.uid(), 'admin')) or public.admin_order_outlet_allowed(outlet));
create policy "Restrict Pet Daycare booking deletes to assigned outlet" on public.pet_daycare_bookings as restrictive for delete to authenticated
using ((user_id = auth.uid() and not public.has_role(auth.uid(), 'admin')) or public.admin_order_outlet_allowed(outlet));

-- Staff can only read or mutate legacy order snapshots for their own outlet.
drop policy if exists "Limit staff app data to their level" on public.app_data;
drop policy if exists "Limit staff app data inserts to their level" on public.app_data;
drop policy if exists "Limit staff app data updates to their level" on public.app_data;
create policy "Limit staff app data to their outlet" on public.app_data as restrictive for select to authenticated
using (not public.has_role(auth.uid(), 'staff') or public.admin_app_data_outlet_allowed(scope, storage_key, payload));
create policy "Limit staff app data inserts to their outlet" on public.app_data as restrictive for insert to authenticated
with check (not public.has_role(auth.uid(), 'staff') or public.admin_app_data_outlet_allowed(scope, storage_key, payload));
create policy "Limit staff app data updates to their outlet" on public.app_data as restrictive for update to authenticated
using (not public.has_role(auth.uid(), 'staff') or public.admin_app_data_outlet_allowed(scope, storage_key, payload))
with check (not public.has_role(auth.uid(), 'staff') or public.admin_app_data_outlet_allowed(scope, storage_key, payload));

-- Resolve a scanned service QR to the assigned outlet without exposing another outlet's order details.
create or replace function public.check_admin_qr_outlet(p_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  token_row jsonb;
  order_key text;
  order_id text;
  order_outlet text;
  assigned_outlet text;
begin
  if public.current_portal_level(auth.uid()) < 1 then raise exception 'Admin portal access is required.'; end if;
  select ad.payload -> upper(regexp_replace(coalesce(p_token, ''), '[^A-Z0-9]', '', 'g'))
    into token_row from public.app_data ad
    where ad.scope = 'operation' and ad.storage_key = 'furgo-demo-check-in-tokens'
      and ad.payload ? upper(regexp_replace(coalesce(p_token, ''), '[^A-Z0-9]', '', 'g')) limit 1;
  if token_row is null then return jsonb_build_object('ok', false, 'message', 'This QR code was not found. Refresh the order QR code and try again.'); end if;
  order_key := token_row->>'orderKey'; order_id := token_row->>'orderId';
  if order_key = 'furgo-demo-grooming-bookings' then select outlet into order_outlet from public.grooming_bookings where id::text = order_id;
  elsif order_key = 'furgo-demo-hotel-bookings' then select outlet into order_outlet from public.pet_hotel_bookings where id = order_id;
  elsif order_key in ('furgo-demo-daycare-bookings', 'furgo-demo-daycare-orders') then select outlet into order_outlet from public.pet_daycare_bookings where id = order_id;
  elsif order_key = 'furgo-demo-marketplace-orders' then select outlet into order_outlet from public.marketplace_orders where id = order_id;
  end if;
  select outlet.name into assigned_outlet from public.portal_access access join public.admin_outlets outlet on outlet.id = access.outlet_id where access.user_id = auth.uid();
  if public.current_portal_level(auth.uid()) >= 3 then return jsonb_build_object('ok', true, 'allowed', true); end if;
  if coalesce(order_outlet, '') = '' or assigned_outlet is null or lower(trim(order_outlet)) <> lower(trim(assigned_outlet)) then
    return jsonb_build_object('ok', true, 'allowed', false, 'message', 'This order is not from your assigned outlet. You can only check in orders for ' || coalesce(assigned_outlet, 'your assigned outlet') || '.');
  end if;
  return jsonb_build_object('ok', true, 'allowed', true);
end;
$$;
revoke all on function public.check_admin_qr_outlet(text) from public, anon;
grant execute on function public.check_admin_qr_outlet(text) to authenticated;
