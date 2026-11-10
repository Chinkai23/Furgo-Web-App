-- Server-authoritative daily Furgo Coins check-ins.
-- The date is always calculated in Malaysia time; callers cannot submit a date.

create table if not exists public.furgo_coin_checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  checked_at timestamptz not null default now(),
  primary key (user_id, checkin_date)
);

alter table public.furgo_coin_checkins enable row level security;
revoke all on public.furgo_coin_checkins from public, anon, authenticated;

create or replace function public.get_furgo_coin_checkin_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  malaysia_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  last_checkin date;
  streak_anchor date;
  streak_count integer := 0;
  checked_today boolean := false;
begin
  if caller is null then
    raise exception 'Sign in to view your check-in status.';
  end if;

  select max(checkin_date)
    into last_checkin
    from public.furgo_coin_checkins
   where user_id = caller;

  select exists (
    select 1
      from public.furgo_coin_checkins
     where user_id = caller
       and checkin_date = malaysia_today
  ) into checked_today;

  streak_anchor := case
    when checked_today then malaysia_today
    else malaysia_today - 1
  end;

  with recursive consecutive_days(checkin_date, days_back) as (
    select streak_anchor, 0
     where exists (
       select 1
         from public.furgo_coin_checkins
        where user_id = caller
          and checkin_date = streak_anchor
     )
    union all
    select consecutive_days.checkin_date - 1,
           consecutive_days.days_back + 1
      from consecutive_days
     where consecutive_days.days_back < 36500
       and exists (
         select 1
           from public.furgo_coin_checkins
          where user_id = caller
            and checkin_date = consecutive_days.checkin_date - 1
       )
  )
  select count(*)::integer
    into streak_count
    from consecutive_days;

  return jsonb_build_object(
    'today', malaysia_today,
    'checked_in_today', checked_today,
    'streak', streak_count,
    'last_checkin_date', last_checkin
  );
end;
$$;

create or replace function public.claim_furgo_coin_checkin()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  malaysia_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  inserted_rows integer := 0;
  result jsonb;
begin
  if caller is null then
    raise exception 'Sign in before checking in.';
  end if;

  insert into public.furgo_coin_checkins (user_id, checkin_date)
  values (caller, malaysia_today)
  on conflict (user_id, checkin_date) do nothing;

  get diagnostics inserted_rows = row_count;
  result := public.get_furgo_coin_checkin_state();
  return result || jsonb_build_object('checked_in_now', inserted_rows = 1);
end;
$$;

revoke all on function public.get_furgo_coin_checkin_state() from public, anon;
revoke all on function public.claim_furgo_coin_checkin() from public, anon;
grant execute on function public.get_furgo_coin_checkin_state() to authenticated;
grant execute on function public.claim_furgo_coin_checkin() to authenticated;
