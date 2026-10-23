-- Allow Managers and Directors to grant/remove Driver portal access from the
-- existing-account team manager. Driver access is an app role, not a portal
-- level, and is listed alongside admin portal members for team management.

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
      'user_id', member.user_id,
      'level', member.level,
      'display_name', member.display_name,
      'email', member.email,
      'created_at', member.created_at
    ) order by member.sort_rank, member.display_name)
    from (
      select access.user_id, access.level::text as level,
        coalesce(nullif(profile.display_name, ''), profile.email, 'Furgo user') as display_name,
        profile.email, access.created_at,
        case access.level when 'director' then 1 when 'manager' then 2 else 3 end as sort_rank
      from public.portal_access access
      join public.profiles profile on profile.id = access.user_id
      where case access.level when 'director' then 3 when 'manager' then 2 else 1 end < caller_rank
         or (caller_rank = 3 and access.level = 'director')
      union all
      select role_entry.user_id, 'driver'::text as level,
        coalesce(nullif(profile.display_name, ''), profile.email, 'Furgo user') as display_name,
        profile.email, role_entry.created_at, 4 as sort_rank
      from public.user_roles role_entry
      join public.profiles profile on profile.id = role_entry.user_id
      where role_entry.role::text = 'driver'
        and caller_rank >= 2
    ) member
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
  requested_type text := lower(coalesce(p_level, ''));
begin
  if caller_rank < 2 then raise exception 'Only Managers and Directors can manage portal users.'; end if;
  if action_name not in ('add', 'update', 'remove') then raise exception 'Unsupported team action.'; end if;
  select profile.id into target
  from public.profiles profile
  where lower(profile.email) = lower(trim(coalesce(p_email, '')))
  limit 1;
  if target is null then raise exception 'No Furgo account was found for that email. The person must register first.'; end if;
  if target = caller then raise exception 'You cannot change your own portal level.'; end if;
  target_rank := public.current_portal_level(target);

  if requested_type = 'driver' then
    if action_name = 'update' then raise exception 'Driver access cannot be changed with the admin-level editor.'; end if;
    if action_name = 'remove' then
      delete from public.user_roles where user_id = target and role::text = 'driver';
      if not found then raise exception 'This account does not have Driver access.'; end if;
      perform public.log_admin_action('portal_access_removed', 'team_member', target::text,
        pg_catalog.jsonb_build_object('email', lower(trim(p_email)), 'account_type', 'driver'));
      return pg_catalog.jsonb_build_object('ok', true, 'action', action_name, 'level', 'driver');
    end if;
    if target_rank > 0 then raise exception 'Accounts with an admin portal level cannot also be assigned as Drivers.'; end if;
    insert into public.user_roles (user_id, role)
    values (target, 'driver'::public.app_role)
    on conflict (user_id, role) do nothing;
    perform public.log_admin_action('portal_access_added', 'team_member', target::text,
      pg_catalog.jsonb_build_object('email', lower(trim(p_email)), 'account_type', 'driver'));
    return pg_catalog.jsonb_build_object('ok', true, 'action', action_name, 'level', 'driver');
  end if;

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
  requested_rank := case requested_type when 'executive' then 1 when 'manager' then 2 when 'director' then 3 else 0 end;
  if requested_rank = 0 then raise exception 'Choose a valid portal level.'; end if;
  if requested_rank > caller_rank or (requested_rank = caller_rank and caller_rank <> 3) then
    raise exception 'You can only assign levels at or below your own. Only Directors can add other Directors.';
  end if;
  requested_level := requested_type::public.portal_level;
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
