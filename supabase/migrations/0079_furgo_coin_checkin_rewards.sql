-- Award server-side Furgo Coin rewards for the seven-day check-in cycle.
-- Day 1-4: 1 coin each; Day 5-6: 5 coins each; Day 7: 20 coins.

alter table public.pet_assistant_energy_ledger
  drop constraint if exists pet_assistant_energy_ledger_entry_type_check;
alter table public.pet_assistant_energy_ledger
  add constraint pet_assistant_energy_ledger_entry_type_check
  check (entry_type in ('coin_top_up', 'ai_usage', 'reservation_release', 'coin_exchange', 'coin_checkin'));

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

  streak_anchor := case when checked_today then malaysia_today else malaysia_today - 1 end;

  with recursive consecutive_days(checkin_date, days_back) as (
    select streak_anchor, 0
     where exists (
       select 1 from public.furgo_coin_checkins
        where user_id = caller and checkin_date = streak_anchor
     )
    union all
    select consecutive_days.checkin_date - 1, consecutive_days.days_back + 1
      from consecutive_days
     where consecutive_days.days_back < 36500
       and exists (
         select 1 from public.furgo_coin_checkins
          where user_id = caller
            and checkin_date = consecutive_days.checkin_date - 1
       )
  )
  select count(*)::integer into streak_count from consecutive_days;

  -- A completed seventh day is shown as day 7 today, then resets to day 0
  -- tomorrow so the next check-in starts a fresh cycle at day 1.
  if checked_today and streak_count > 0 and streak_count % 7 = 0 then
    streak_count := 7;
  else
    streak_count := streak_count % 7;
  end if;

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
  checkin_day integer := 1;
  reward_coins integer := 1;
  current_balance bigint := 0;
  state_before jsonb;
  result jsonb;
begin
  if caller is null then
    raise exception 'Sign in before checking in.';
  end if;

  state_before := public.get_furgo_coin_checkin_state();

  insert into public.furgo_coin_checkins (user_id, checkin_date)
  values (caller, malaysia_today)
  on conflict (user_id, checkin_date) do nothing;
  get diagnostics inserted_rows = row_count;

  if inserted_rows = 1 then
    checkin_day := mod(coalesce((state_before->>'streak')::integer, 0), 7) + 1;
    reward_coins := case when checkin_day <= 4 then 1 when checkin_day <= 6 then 5 else 20 end;

    insert into public.furgo_coin_wallets (user_id, balance)
    values (caller, reward_coins)
    on conflict (user_id) do update
      set balance = public.furgo_coin_wallets.balance + excluded.balance,
          updated_at = now()
    returning balance into current_balance;

    insert into public.pet_assistant_energy_ledger (user_id, entry_type, coin_delta)
    values (caller, 'coin_checkin', reward_coins);
  else
    reward_coins := 0;
    select balance into current_balance
      from public.furgo_coin_wallets
     where user_id = caller;
    current_balance := coalesce(current_balance, 0);
  end if;

  result := public.get_furgo_coin_checkin_state();
  return result || jsonb_build_object(
    'checked_in_now', inserted_rows = 1,
    'checkin_day', case when inserted_rows = 1 then checkin_day else null end,
    'reward_coins', reward_coins,
    'coin_balance', current_balance
  );
end;
$$;

revoke all on function public.get_furgo_coin_checkin_state() from public, anon;
revoke all on function public.claim_furgo_coin_checkin() from public, anon;
grant execute on function public.get_furgo_coin_checkin_state() to authenticated;
grant execute on function public.claim_furgo_coin_checkin() to authenticated;
