-- Let outlet staff view admins assigned to the same outlet, and provide
-- Directors with the company-wide list used by the portal filters.
create or replace function public.get_admin_team()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  caller_rank smallint := public.current_portal_level(auth.uid());
  caller_outlet uuid := public.current_admin_outlet_id(auth.uid());
begin
  if caller_rank < 1 then raise exception 'Only outlet admins can view portal users.'; end if;
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
      where caller_rank = 3
         or (caller_rank in (1, 2) and access.level in ('executive', 'manager') and access.outlet_id = caller_outlet)
      union all
      select role_entry.user_id, 'driver'::text, coalesce(nullif(profile.display_name, ''), profile.email, 'Furgo user'),
        profile.email, role_entry.created_at, null::uuid, null::text, null::text, 4
      from public.user_roles role_entry
      join public.profiles profile on profile.id = role_entry.user_id
      where role_entry.role::text = 'driver' and caller_rank = 3
    ) member
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_admin_team() from public, anon;
grant execute on function public.get_admin_team() to authenticated;
