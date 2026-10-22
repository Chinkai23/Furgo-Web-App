-- Directors must receive unanimous approval from every other Director before peer removal.
create table public.director_removal_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  approvals_required integer not null check (approvals_required > 0),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  check (requester_id <> target_id)
);
create unique index director_removal_one_pending_target_idx
  on public.director_removal_requests (target_id) where status = 'pending';
create index director_removal_requests_requester_idx
  on public.director_removal_requests (requester_id, created_at desc);

create table public.director_removal_approvals (
  request_id uuid not null references public.director_removal_requests (id) on delete cascade,
  director_id uuid not null references auth.users (id) on delete cascade,
  decision text check (decision in ('approve', 'reject')),
  voted_at timestamptz,
  primary key (request_id, director_id)
);
alter table public.director_removal_requests enable row level security;
alter table public.director_removal_approvals enable row level security;
revoke all on public.director_removal_requests, public.director_removal_approvals from public, anon, authenticated;

create or replace function public.request_director_removal(p_target_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target uuid;
  target_email text;
  requester_name text;
  approver_count integer;
  request_id uuid;
begin
  -- Serialize request/vote operations so membership snapshots and approvals cannot race.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('furgo_director_removal_workflow'));
  if public.current_portal_level(caller) <> 3 then raise exception 'Only Directors can request removal of a Director.'; end if;
  if coalesce((auth.jwt() ->> 'auth_time')::bigint, 0) < extract(epoch from now())::bigint - 300 then
    raise exception 'Please verify your password again before requesting Director removal.';
  end if;
  select profile.id, profile.email into target, target_email
  from public.profiles profile
  where lower(profile.email) = lower(trim(coalesce(p_target_email, '')))
  limit 1;
  if target is null then raise exception 'No Furgo account was found for that email.'; end if;
  if target = caller then raise exception 'You cannot request removal of your own Director access.'; end if;
  if public.current_portal_level(target) <> 3 then raise exception 'The selected account is not a Director.'; end if;
  if exists (select 1 from public.director_removal_requests request where request.target_id = target and request.status = 'pending') then
    raise exception 'A Director removal request is already pending for this account.';
  end if;

  select count(*)::integer into approver_count
  from public.portal_access access
  where access.level = 'director' and access.user_id not in (caller, target);
  if approver_count = 0 then
    raise exception 'At least one other Director, besides the requester and target, must be available to approve this request.';
  end if;

  insert into public.director_removal_requests (requester_id, target_id, approvals_required)
  values (caller, target, approver_count)
  returning id into request_id;
  insert into public.director_removal_approvals (request_id, director_id)
  select request_id, access.user_id
  from public.portal_access access
  where access.level = 'director' and access.user_id not in (caller, target);

  select coalesce(nullif(profile.display_name, ''), profile.email, 'Director') into requester_name
  from public.profiles profile where profile.id = caller;
  insert into public.admin_audit_logs (actor_id, actor_name, actor_level, action, target_type, target_id, details)
  values (caller, coalesce(requester_name, 'Director'), 'director', 'director_removal_requested', 'director', target::text,
    pg_catalog.jsonb_build_object('request_id', request_id, 'target_email', target_email, 'approvals_required', approver_count));
  return pg_catalog.jsonb_build_object('ok', true, 'request_id', request_id, 'approvals_required', approver_count);
end;
$$;
revoke all on function public.request_director_removal(text) from public, anon;
grant execute on function public.request_director_removal(text) to authenticated;

create or replace function public.get_director_removal_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  result jsonb;
begin
  if public.current_portal_level(caller) <> 3 then raise exception 'Only Directors can view Director removal requests.'; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', request.id,
    'target_id', request.target_id,
    'target_name', coalesce(nullif(target_profile.display_name, ''), target_profile.email, 'Director'),
    'target_email', target_profile.email,
    'requester_name', coalesce(nullif(requester_profile.display_name, ''), requester_profile.email, 'Director'),
    'requester_email', requester_profile.email,
    'status', request.status,
    'created_at', request.created_at,
    'approvals_required', request.approvals_required,
    'approvals_received', (select count(*)::integer from public.director_removal_approvals completed where completed.request_id = request.id and completed.decision = 'approve'),
    'my_vote', my_approval.decision,
    'is_requester', request.requester_id = caller
  ) order by request.created_at desc), '[]'::jsonb) into result
  from public.director_removal_requests request
  join public.profiles target_profile on target_profile.id = request.target_id
  join public.profiles requester_profile on requester_profile.id = request.requester_id
  left join public.director_removal_approvals my_approval
    on my_approval.request_id = request.id and my_approval.director_id = caller
  where (request.status = 'pending' and (request.requester_id = caller or my_approval.director_id = caller))
     or (request.requester_id = caller and request.status <> 'pending' and request.created_at > now() - interval '30 days')
     or (my_approval.director_id = caller and request.status <> 'pending' and request.created_at > now() - interval '30 days');
  return result;
end;
$$;
revoke all on function public.get_director_removal_requests() from public, anon;
grant execute on function public.get_director_removal_requests() to authenticated;

create or replace function public.vote_director_removal_request(p_request_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  request public.director_removal_requests%rowtype;
  target_rank smallint;
  target_email text;
  actor_name text;
  approved_count integer;
  eligible_vote text;
  decision_name text := lower(coalesce(p_decision, ''));
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('furgo_director_removal_workflow'));
  if public.current_portal_level(caller) <> 3 then raise exception 'Only Directors can vote on Director removal requests.'; end if;
  if decision_name not in ('approve', 'reject') then raise exception 'Choose approve or reject.'; end if;
  select * into request from public.director_removal_requests where id = p_request_id for update;
  if not found then raise exception 'This Director removal request was not found.'; end if;
  if request.status <> 'pending' then raise exception 'This Director removal request is already closed.'; end if;
  select approval.decision into eligible_vote
  from public.director_removal_approvals approval
  where approval.request_id = request.id and approval.director_id = caller
  for update;
  if not found or eligible_vote is not null then
    raise exception 'You are not an eligible approver for this request, or you already voted.';
  end if;

  update public.director_removal_approvals
  set decision = decision_name, voted_at = now()
  where request_id = request.id and director_id = caller;
  select coalesce(nullif(profile.display_name, ''), profile.email, 'Director') into actor_name
  from public.profiles profile where profile.id = caller;

  if decision_name = 'reject' then
    update public.director_removal_requests set status = 'rejected', resolved_at = now(), resolved_by = caller where id = request.id;
    insert into public.admin_audit_logs (actor_id, actor_name, actor_level, action, target_type, target_id, details)
    values (caller, coalesce(actor_name, 'Director'), 'director', 'director_removal_rejected', 'director', request.target_id::text,
      pg_catalog.jsonb_build_object('request_id', request.id, 'requester_id', request.requester_id));
    return pg_catalog.jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  select count(*)::integer into approved_count
  from public.director_removal_approvals approval
  where approval.request_id = request.id and approval.decision = 'approve';
  if approved_count < request.approvals_required then
    insert into public.admin_audit_logs (actor_id, actor_name, actor_level, action, target_type, target_id, details)
    values (caller, coalesce(actor_name, 'Director'), 'director', 'director_removal_vote_approved', 'director', request.target_id::text,
      pg_catalog.jsonb_build_object('request_id', request.id, 'approvals_received', approved_count, 'approvals_required', request.approvals_required));
    return pg_catalog.jsonb_build_object('ok', true, 'status', 'pending', 'approvals_received', approved_count, 'approvals_required', request.approvals_required);
  end if;

  target_rank := public.current_portal_level(request.target_id);
  if target_rank <> 3 then
    update public.director_removal_requests set status = 'cancelled', resolved_at = now(), resolved_by = caller where id = request.id;
    return pg_catalog.jsonb_build_object('ok', true, 'status', 'cancelled');
  end if;
  -- If the Director being removed is still needed to decide another request, close it.
  -- Their already-submitted votes remain valid in other requests.
  with cancelled as (
    update public.director_removal_requests other_request
    set status = 'cancelled', resolved_at = now(), resolved_by = caller
    where other_request.id <> request.id
      and other_request.status = 'pending'
      and (
        other_request.requester_id = request.target_id
        or exists (
          select 1 from public.director_removal_approvals pending_vote
          where pending_vote.request_id = other_request.id
            and pending_vote.director_id = request.target_id
            and pending_vote.decision is null
        )
      )
    returning other_request.id, other_request.target_id, other_request.requester_id
  )
  insert into public.admin_audit_logs (actor_id, actor_name, actor_level, action, target_type, target_id, details)
  select caller, coalesce(actor_name, 'Director'), 'director', 'director_removal_cancelled_approver_removed',
    'director', cancelled.target_id::text,
    pg_catalog.jsonb_build_object('request_id', cancelled.id, 'requester_id', cancelled.requester_id, 'reason', 'An eligible Director was removed.')
  from cancelled;
  select profile.email into target_email from public.profiles profile where profile.id = request.target_id;
  delete from public.portal_access where user_id = request.target_id and level = 'director';
  delete from public.user_roles where user_id = request.target_id and role::text = 'admin';
  update public.director_removal_requests set status = 'approved', resolved_at = now(), resolved_by = caller where id = request.id;
  insert into public.admin_audit_logs (actor_id, actor_name, actor_level, action, target_type, target_id, details)
  values (caller, coalesce(actor_name, 'Director'), 'director', 'director_removal_completed', 'director', request.target_id::text,
    pg_catalog.jsonb_build_object('request_id', request.id, 'requester_id', request.requester_id, 'target_email', target_email, 'approvals_received', approved_count));
  return pg_catalog.jsonb_build_object('ok', true, 'status', 'approved', 'target_id', request.target_id);
end;
$$;
revoke all on function public.vote_director_removal_request(uuid, text) from public, anon;
grant execute on function public.vote_director_removal_request(uuid, text) to authenticated;

-- Keep Director peer removal exclusively inside the approval workflow.
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
  if target_rank >= caller_rank then raise exception 'You can only manage users below your own level. Director removal requires unanimous approval.'; end if;

  if action_name = 'remove' then
    delete from public.portal_access where user_id = target;
    delete from public.user_roles where user_id = target and role::text in ('staff', 'admin');
    perform public.log_admin_action('portal_access_removed', 'team_member', target::text,
      pg_catalog.jsonb_build_object('email', lower(trim(p_email)), 'previous_level', case target_rank when 3 then 'director' when 2 then 'manager' when 1 then 'executive' else 'customer' end));
    return pg_catalog.jsonb_build_object('ok', true, 'action', action_name);
  end if;

  requested_rank := case lower(coalesce(p_level, '')) when 'executive' then 1 when 'manager' then 2 when 'director' then 3 else 0 end;
  if requested_rank = 0 then raise exception 'Choose a valid portal level.'; end if;
  if requested_rank >= 2 and coalesce((auth.jwt() ->> 'auth_time')::bigint, 0) < extract(epoch from now())::bigint - 300 then
    raise exception 'Please verify your password again before granting Manager or Director access.';
  end if;
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
