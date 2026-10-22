-- Shared customer support inbox with private customer ownership and admin-only replies.
create table public.support_enquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null check (char_length(topic) between 1 and 120),
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now(),
  reply text check (reply is null or char_length(reply) between 1 and 3000),
  replied_at timestamptz,
  replied_by uuid references auth.users (id) on delete set null,
  replied_by_name text
);
create index support_enquiries_created_at_idx on public.support_enquiries (created_at desc);
create index support_enquiries_user_created_idx on public.support_enquiries (user_id, created_at desc);
alter table public.support_enquiries enable row level security;
revoke all on public.support_enquiries from public, anon, authenticated;
create policy "Customers read own enquiries and admins read inbox"
  on public.support_enquiries for select to authenticated
  using (user_id = (select auth.uid()) or (select public.current_portal_level(auth.uid())) >= 1);
grant select on public.support_enquiries to authenticated;

-- Bring forward customer requests stored in the older flexible app_data inbox.
insert into public.support_enquiries (user_id, topic, message, created_at, reply, replied_at, replied_by_name)
select source.owner_id,
  left(coalesce(nullif(btrim(item.value->>'topic'), ''), 'General enquiry'), 120),
  left(coalesce(item.value->>'message', ''), 1000),
  case when coalesce(item.value->>'timestamp', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
    then (item.value->>'timestamp')::timestamptz else source.updated_at end,
  nullif(left(item.value->>'reply', 3000), ''),
  case when coalesce(item.value->>'repliedAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
    then (item.value->>'repliedAt')::timestamptz else null end,
  nullif(left(item.value->>'repliedByName', 200), '')
from public.app_data source
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(source.payload) = 'array' then source.payload else '[]'::jsonb end
) as item(value)
where source.scope = 'operation'
  and source.storage_key = 'furgo-demo-support-requests'
  and source.owner_id is not null
  and coalesce(item.value->>'message', '') <> '';

create or replace function public.submit_support_enquiry(p_topic text, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  created_id uuid;
  topic_text text := btrim(coalesce(p_topic, ''));
  message_text text := btrim(coalesce(p_message, ''));
begin
  if caller is null then raise exception 'Sign in before sending an enquiry.'; end if;
  if public.current_portal_level(caller) > 0 then raise exception 'Use the Admin Help inbox to reply to customer enquiries.'; end if;
  if char_length(topic_text) not between 1 and 120 then raise exception 'Choose a valid enquiry topic.'; end if;
  if char_length(message_text) not between 1 and 1000 then raise exception 'Your message must be between 1 and 1000 characters.'; end if;
  insert into public.support_enquiries (user_id, topic, message)
  values (caller, topic_text, message_text)
  returning id into created_id;
  return jsonb_build_object('id', created_id, 'ok', true);
end;
$$;
revoke all on function public.submit_support_enquiry(text, text) from public, anon;
grant execute on function public.submit_support_enquiry(text, text) to authenticated;

create or replace function public.reply_to_support_enquiry(p_enquiry_id uuid, p_reply text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  actor_rank smallint;
  actor_name text;
  reply_text text := btrim(coalesce(p_reply, ''));
  enquiry_topic text;
begin
  actor_rank := coalesce(public.current_portal_level(caller), 0);
  if actor_rank < 1 then raise exception 'Admin portal access is required to reply.'; end if;
  if char_length(reply_text) not between 1 and 3000 then raise exception 'A reply must be between 1 and 3000 characters.'; end if;
  select coalesce(nullif(profile.display_name, ''), profile.email, 'Portal user') into actor_name
  from public.profiles profile where profile.id = caller;
  update public.support_enquiries enquiry
  set reply = reply_text, replied_at = now(), replied_by = caller, replied_by_name = coalesce(actor_name, 'Portal user')
  where enquiry.id = p_enquiry_id
  returning enquiry.topic into enquiry_topic;
  if not found then raise exception 'This enquiry could not be found.'; end if;
  insert into public.admin_audit_logs (actor_id, actor_name, actor_level, action, target_type, target_id, details)
  values (caller, coalesce(actor_name, 'Portal user'),
    case actor_rank when 3 then 'director'::public.portal_level when 2 then 'manager'::public.portal_level else 'executive'::public.portal_level end,
    'enquiry_replied', 'support_enquiry', p_enquiry_id::text, jsonb_build_object('topic', enquiry_topic));
  return jsonb_build_object('ok', true, 'topic', enquiry_topic);
end;
$$;
revoke all on function public.reply_to_support_enquiry(uuid, text) from public, anon;
grant execute on function public.reply_to_support_enquiry(uuid, text) to authenticated;

-- Executives can see Executive actions only; Managers and Directors retain the complete audit view.
create or replace function public.get_admin_audit_log(p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_rank smallint := public.current_portal_level(auth.uid());
begin
  if caller_rank < 1 then raise exception 'Activity logs are available to portal users.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'actor_name', entry.actor_name, 'actor_level', entry.actor_level,
      'action', entry.action, 'target_type', entry.target_type, 'target_id', entry.target_id,
      'details', entry.details, 'created_at', entry.created_at
    ) order by entry.created_at desc)
    from (
      select * from public.admin_audit_logs
      where caller_rank >= 2 or actor_level = 'executive'::public.portal_level
      order by created_at desc
      limit greatest(1, least(coalesce(p_limit, 200), 500))
    ) entry
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_admin_audit_log(integer) from public, anon;
grant execute on function public.get_admin_audit_log(integer) to authenticated;
