-- Directors may remove another Director's portal access after password confirmation in the portal.
-- They still cannot edit another Director's access or remove their own access.
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
notify pgrst, 'reload schema';
