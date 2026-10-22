-- Remove recent-password checks from privileged portal changes. Role checks
-- and unanimous approval for Director removal remain enforced in the RPCs.
do $$
declare
  function_definition text;
  old_check text;
begin
  select pg_get_functiondef('public.manage_admin_team_member(text,text,text)'::regprocedure)
    into function_definition;
  old_check := $check$
  if requested_rank >= 2 and coalesce((auth.jwt() ->> 'auth_time')::bigint, 0) < extract(epoch from now())::bigint - 300 then
    raise exception 'Please verify your password again before granting Manager or Director access.';
  end if;
$check$;
  if position(old_check in function_definition) = 0 then
    raise exception 'Expected password verification block was not found in manage_admin_team_member.';
  end if;
  execute replace(function_definition, old_check, '');

  select pg_get_functiondef('public.request_director_removal(text)'::regprocedure)
    into function_definition;
  old_check := $check$
  if coalesce((auth.jwt() ->> 'auth_time')::bigint, 0) < extract(epoch from now())::bigint - 300 then
    raise exception 'Please verify your password again before requesting Director removal.';
  end if;
$check$;
  if position(old_check in function_definition) = 0 then
    raise exception 'Expected password verification block was not found in request_director_removal.';
  end if;
  execute replace(function_definition, old_check, '');
end;
$$;

-- Earlier migration 0014 added a trigger that enforced password verification
-- for approve/reject votes. Remove that trigger and its helper function.
drop trigger if exists director_removal_vote_requires_recent_auth on public.director_removal_approvals;
drop function if exists public.require_recent_director_vote_auth();

notify pgrst, 'reload schema';
