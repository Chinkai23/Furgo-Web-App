-- Store portal levels separately from the legacy customer/admin/driver roles.
create type public.portal_level as enum ('executive', 'manager', 'director');

create table public.portal_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  level public.portal_level not null,
  assigned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.portal_access enable row level security;
create policy "Users can read their own portal level"
  on public.portal_access for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.portal_access to authenticated;

-- Legacy Admin accounts become Directors; legacy Staff accounts become Executives.
insert into public.portal_access (user_id, level)
select user_id, case role::text when 'admin' then 'director'::public.portal_level else 'executive'::public.portal_level end
from public.user_roles
where role::text in ('admin', 'staff')
on conflict (user_id) do nothing;

create or replace function public.current_portal_level(_user_id uuid)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case access.level when 'director' then 3 when 'manager' then 2 when 'executive' then 1 end
     from public.portal_access access where access.user_id = _user_id),
    case when public.has_role(_user_id, 'admin') then 3
         when public.has_role(_user_id, 'staff') then 1
         else 0 end
  )::smallint;
$$;
revoke all on function public.current_portal_level(uuid) from public;
grant execute on function public.current_portal_level(uuid) to authenticated;

create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text not null default 'Portal user',
  actor_level public.portal_level not null,
  action text not null check (char_length(action) between 1 and 80),
  target_type text not null check (char_length(target_type) between 1 and 60),
  target_id text not null default '' check (char_length(target_id) <= 120),
  details jsonb not null default '{}'::jsonb check (pg_catalog.octet_length(details::text) <= 2000),
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created_at_idx on public.admin_audit_logs (created_at desc);
alter table public.admin_audit_logs enable row level security;
create policy "Managers and Directors can read admin audit logs"
  on public.admin_audit_logs for select to authenticated
  using ((select public.current_portal_level(auth.uid())) >= 2);
grant select on public.admin_audit_logs to authenticated;

create or replace function public.log_admin_action(p_action text, p_target_type text, p_target_id text default '', p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_rank smallint;
  actor_level public.portal_level;
  actor_display_name text;
begin
  actor_rank := public.current_portal_level(actor);
  if actor_rank < 1 then raise exception 'Portal access is required to record admin actions.'; end if;
  if coalesce(p_action, '') not in (
    'customer_check_in_updated', 'customer_record_status_updated', 'daycare_addon_removed',
    'daycare_details_updated', 'daycare_pass_removed', 'daycare_settings_updated',
    'grooming_package_removed', 'grooming_settings_updated', 'hotel_addon_removed',
    'hotel_care_update_uploaded', 'hotel_room_removed', 'hotel_settings_updated',
    'marketplace_offer_settings_updated', 'marketplace_payment_approved',
    'marketplace_payment_rejected', 'marketplace_product_hidden', 'marketplace_product_published',
    'marketplace_product_removed', 'marketplace_product_saved', 'order_status_updated',
    'pet_remarks_updated', 'promotion_removed', 'promotion_uploaded', 'receipt_uploaded',
    'portal_access_added', 'portal_access_level_changed', 'portal_access_removed'
  ) then raise exception 'Unsupported admin activity action.'; end if;
  actor_level := case actor_rank when 3 then 'director'::public.portal_level when 2 then 'manager'::public.portal_level else 'executive'::public.portal_level end;
  select coalesce(nullif(profile.display_name, ''), profile.email, 'Portal user') into actor_display_name
  from public.profiles profile where profile.id = actor;
  if coalesce(pg_catalog.octet_length(coalesce(p_details, '{}'::jsonb)::text), 0) > 2000 then
    raise exception 'Activity details are too large.';
  end if;
  insert into public.admin_audit_logs (actor_id, actor_name, actor_level, action, target_type, target_id, details)
  values (actor, coalesce(actor_display_name, 'Portal user'), actor_level,
    left(coalesce(nullif(p_action, ''), 'action_recorded'), 80),
    left(coalesce(nullif(p_target_type, ''), 'portal'), 60), left(coalesce(p_target_id, ''), 120), coalesce(p_details, '{}'::jsonb));
end;
$$;
revoke all on function public.log_admin_action(text, text, text, jsonb) from public, anon;
grant execute on function public.log_admin_action(text, text, text, jsonb) to authenticated;

create or replace function public.get_admin_audit_log(p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_portal_level(auth.uid()) < 2 then raise exception 'Activity logs are available to Managers and Directors.'; end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'actor_name', entry.actor_name, 'actor_level', entry.actor_level,
      'action', entry.action, 'target_type', entry.target_type, 'target_id', entry.target_id,
      'details', entry.details, 'created_at', entry.created_at
    ) order by entry.created_at desc)
    from (select * from public.admin_audit_logs order by created_at desc limit greatest(1, least(coalesce(p_limit, 200), 500))) entry
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_admin_audit_log(integer) from public, anon;
grant execute on function public.get_admin_audit_log(integer) to authenticated;

create or replace function public.get_admin_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_rank smallint := public.current_portal_level(auth.uid());
begin
  if caller_rank < 2 then raise exception 'Only Managers and Directors can manage portal users.'; end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'user_id', access.user_id, 'level', access.level,
      'display_name', coalesce(nullif(profile.display_name, ''), profile.email, 'Furgo user'),
      'email', profile.email, 'created_at', access.created_at
    ) order by access.level, profile.display_name)
    from public.portal_access access
    join public.profiles profile on profile.id = access.user_id
    where case access.level when 'director' then 3 when 'manager' then 2 else 1 end < caller_rank
       or (caller_rank = 3 and access.level = 'director')
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_admin_team() from public, anon;
grant execute on function public.get_admin_team() to authenticated;

create or replace function public.manage_admin_team_member(p_email text, p_level text default null, p_action text default 'add')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_rank smallint := public.current_portal_level(auth.uid());
  target uuid;
  target_rank smallint;
  requested_rank smallint;
  requested_level public.portal_level;
  action_name text := lower(coalesce(p_action, 'add'));
begin
  if caller_rank < 2 then raise exception 'Only Managers and Directors can manage portal users.'; end if;
  if action_name not in ('add', 'update', 'remove') then raise exception 'Unsupported team action.'; end if;
  select profile.id into target from public.profiles profile where lower(profile.email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if target is null then raise exception 'No Furgo account was found for that email. The person must register first.'; end if;
  if target = caller then raise exception 'You cannot change your own portal level.'; end if;
  target_rank := public.current_portal_level(target);

  if action_name = 'remove' then
    if target_rank > caller_rank or (target_rank = caller_rank and not (caller_rank = 3 and target_rank = 3)) then
      raise exception 'You can only remove users below your own level. Directors may remove another Director, but not themselves.';
    end if;
    delete from public.portal_access where user_id = target;
    delete from public.user_roles where user_id = target and role::text in ('staff', 'admin');
    perform public.log_admin_action('portal_access_removed', 'team_member', target::text,
      pg_catalog.jsonb_build_object('email', lower(trim(p_email)), 'previous_level', case target_rank when 3 then 'director' when 2 then 'manager' when 1 then 'executive' else 'customer' end));
    return pg_catalog.jsonb_build_object('ok', true, 'action', action_name);
  end if;

  if target_rank >= caller_rank then raise exception 'You can only edit users below your own level.'; end if;

  requested_rank := case lower(coalesce(p_level, '')) when 'executive' then 1 when 'manager' then 2 when 'director' then 3 else 0 end;
  if requested_rank = 0 then raise exception 'Choose a valid portal level.'; end if;
  if requested_rank > caller_rank or (requested_rank = caller_rank and caller_rank <> 3) then
    raise exception 'You can only assign levels at or below your own. Only Directors can add other Directors.';
  end if;
  requested_level := lower(p_level)::public.portal_level;
  delete from public.user_roles where user_id = target and role::text in ('staff', 'admin');
  insert into public.user_roles (user_id, role)
  values (target, case when requested_level = 'director' then 'admin'::public.app_role else 'staff'::public.app_role end);
  insert into public.portal_access (user_id, level, assigned_by, updated_at)
  values (target, requested_level, caller, now())
  on conflict (user_id) do update set level = excluded.level, assigned_by = excluded.assigned_by, updated_at = now();
  perform public.log_admin_action(case when action_name = 'add' then 'portal_access_added' else 'portal_access_level_changed' end,
    'team_member', target::text, pg_catalog.jsonb_build_object('email', lower(trim(p_email)), 'level', requested_level));
  return pg_catalog.jsonb_build_object('ok', true, 'action', action_name, 'level', requested_level);
end;
$$;
revoke all on function public.manage_admin_team_member(text, text, text) from public, anon;
grant execute on function public.manage_admin_team_member(text, text, text) to authenticated;
