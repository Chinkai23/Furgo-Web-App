-- Keep Google-powered Local Finder place searches within a shared monthly cap.
create table if not exists public.local_finder_share_search_usage (
  month_start date primary key,
  request_count integer not null default 0 check (request_count between 0 and 2000),
  updated_at timestamptz not null default now()
);

alter table public.local_finder_share_search_usage enable row level security;
revoke all on public.local_finder_share_search_usage from anon, authenticated;

create or replace function public.consume_local_finder_share_search()
returns table(allowed boolean, requests_used integer, monthly_limit integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  month_floor date := date_trunc('month', now() at time zone 'Asia/Kuala_Lumpur')::date;
  used_count integer;
begin
  if caller is null or not (
       (public.has_role(caller, 'customer'::public.app_role) and coalesce(public.current_portal_level(caller), 0) = 0)
       or coalesce(public.current_portal_level(caller), 0) >= 2
     ) then
    raise exception 'Customer or Local Finder admin sign-in is required to search for a place.' using errcode = '42501';
  end if;

  insert into public.local_finder_share_search_usage as usage (month_start, request_count, updated_at)
  values (month_floor, 1, now())
  on conflict (month_start) do update
    set request_count = usage.request_count + 1,
        updated_at = now()
    where usage.request_count < 2000
  returning request_count into used_count;

  if used_count is not null then
    return query select true, used_count, 2000, ((month_floor + interval '1 month')::timestamp at time zone 'Asia/Kuala_Lumpur');
    return;
  end if;

  select usage.request_count into used_count
  from public.local_finder_share_search_usage as usage
  where usage.month_start = month_floor;

  return query select false, coalesce(used_count, 2000), 2000, ((month_floor + interval '1 month')::timestamp at time zone 'Asia/Kuala_Lumpur');
end;
$$;

create or replace function public.get_local_finder_share_search_quota()
returns table(allowed boolean, requests_used integer, monthly_limit integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  month_floor date := date_trunc('month', now() at time zone 'Asia/Kuala_Lumpur')::date;
  used_count integer;
begin
  if caller is null or not (
       (public.has_role(caller, 'customer'::public.app_role) and coalesce(public.current_portal_level(caller), 0) = 0)
       or coalesce(public.current_portal_level(caller), 0) >= 2
     ) then
    raise exception 'Customer or Local Finder admin sign-in is required to share a place.' using errcode = '42501';
  end if;

  select usage.request_count into used_count
  from public.local_finder_share_search_usage as usage
  where usage.month_start = month_floor;

  used_count := coalesce(used_count, 0);
  return query select used_count < 2000, used_count, 2000, ((month_floor + interval '1 month')::timestamp at time zone 'Asia/Kuala_Lumpur');
end;
$$;

revoke all on function public.consume_local_finder_share_search() from public, anon;
revoke all on function public.get_local_finder_share_search_quota() from public, anon;
grant execute on function public.consume_local_finder_share_search() to authenticated;
grant execute on function public.get_local_finder_share_search_quota() to authenticated;
