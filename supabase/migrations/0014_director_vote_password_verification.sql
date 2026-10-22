-- Require a fresh password-authenticated session for every Director removal vote.
-- The trigger protects the vote RPC itself, so callers cannot bypass the UI prompt.
create or replace function public.require_recent_director_vote_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.decision is null then return new; end if;
  if tg_op = 'UPDATE' then
    if old.decision is not distinct from new.decision then return new; end if;
  end if;

  if public.current_portal_level(auth.uid()) <> 3 then
    raise exception 'Only Directors can vote on Director removal requests.';
  end if;
  if coalesce((auth.jwt() ->> 'auth_time')::bigint, 0) < extract(epoch from now())::bigint - 300 then
    raise exception 'Please verify your password again before approving or rejecting a Director removal.';
  end if;
  return new;
end;
$$;
revoke all on function public.require_recent_director_vote_auth() from public, anon, authenticated;

create trigger director_removal_vote_requires_recent_auth
before insert or update of decision on public.director_removal_approvals
for each row execute function public.require_recent_director_vote_auth();
