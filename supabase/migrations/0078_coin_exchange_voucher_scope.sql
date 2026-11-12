-- Scope Furgo Coin voucher rewards to a checkout category and snapshot the offer
-- details and a unique code when a customer redeems it.

alter table public.furgo_coin_exchange_items
  add column if not exists voucher_category text not null default 'marketplace',
  add column if not exists voucher_discount_type text not null default 'fixed',
  add column if not exists voucher_discount_value numeric(10, 2) not null default 5,
  add column if not exists voucher_minimum_spend numeric(10, 2) not null default 0;

alter table public.furgo_coin_exchange_items
  drop constraint if exists furgo_coin_exchange_items_voucher_category_check,
  add constraint furgo_coin_exchange_items_voucher_category_check
    check (voucher_category in ('marketplace', 'grooming', 'pet-hotel', 'pet-daycare', 'pet-taxi')),
  drop constraint if exists furgo_coin_exchange_items_voucher_discount_type_check,
  add constraint furgo_coin_exchange_items_voucher_discount_type_check
    check (voucher_discount_type in ('fixed', 'percent')),
  drop constraint if exists furgo_coin_exchange_items_voucher_discount_value_check,
  add constraint furgo_coin_exchange_items_voucher_discount_value_check
    check (voucher_discount_value > 0 and (voucher_discount_type <> 'percent' or voucher_discount_value <= 100)),
  drop constraint if exists furgo_coin_exchange_items_voucher_minimum_spend_check,
  add constraint furgo_coin_exchange_items_voucher_minimum_spend_check
    check (voucher_minimum_spend >= 0);

alter table public.furgo_coin_exchange_redemptions
  add column if not exists voucher_code text,
  add column if not exists voucher_category text,
  add column if not exists voucher_discount_type text,
  add column if not exists voucher_discount_value numeric(10, 2),
  add column if not exists voucher_minimum_spend numeric(10, 2),
  add column if not exists used_at timestamptz,
  add column if not exists used_order_id text;

create unique index if not exists furgo_coin_exchange_redemptions_voucher_code_uidx
  on public.furgo_coin_exchange_redemptions(voucher_code)
  where voucher_code is not null;

create or replace function public.redeem_furgo_coin_exchange_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  reward public.furgo_coin_exchange_items%rowtype;
  current_balance bigint;
  per_user_redemptions integer;
  issued_voucher_code text;
  redemption_id uuid;
begin
  if caller is null then raise exception 'Sign in to redeem a Furgo Coins reward.'; end if;

  select * into reward from public.furgo_coin_exchange_items
   where id = p_item_id for update;
  if not found or not reward.is_active or reward.starts_at > now()
     or (reward.expires_at is not null and reward.expires_at <= now())
     or reward.redeemed_count >= reward.max_redemptions then
    raise exception 'This reward is no longer available.';
  end if;

  select count(*)::integer into per_user_redemptions
    from public.furgo_coin_exchange_redemptions
   where item_id = reward.id and user_id = caller;
  if per_user_redemptions >= reward.per_user_limit then
    raise exception 'You have reached the redemption limit for this reward.';
  end if;

  insert into public.furgo_coin_wallets(user_id, balance) values (caller, 0)
    on conflict (user_id) do nothing;
  select balance into current_balance from public.furgo_coin_wallets
   where user_id = caller for update;
  if current_balance < reward.coin_cost then
    raise exception 'You do not have enough Furgo Coins for this reward.';
  end if;

  if reward.reward_type = 'voucher' then
    issued_voucher_code := 'FCV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  end if;
  update public.furgo_coin_wallets
     set balance = balance - reward.coin_cost, updated_at = now()
   where user_id = caller returning balance into current_balance;
  insert into public.furgo_coin_exchange_redemptions(
    item_id, reward_name, user_id, coin_cost, voucher_code, voucher_category,
    voucher_discount_type, voucher_discount_value, voucher_minimum_spend
  ) values (
    reward.id, reward.name, caller, reward.coin_cost, issued_voucher_code,
    case when issued_voucher_code is not null then reward.voucher_category end,
    case when issued_voucher_code is not null then reward.voucher_discount_type end,
    case when issued_voucher_code is not null then reward.voucher_discount_value end,
    case when issued_voucher_code is not null then reward.voucher_minimum_spend end
  ) returning id into redemption_id;
  update public.furgo_coin_exchange_items
     set redeemed_count = redeemed_count + 1, updated_at = now()
   where id = reward.id;
  insert into public.pet_assistant_energy_ledger(user_id, entry_type, coin_delta)
    values (caller, 'coin_exchange', -reward.coin_cost);

  return pg_catalog.jsonb_build_object(
    'ok', true, 'item_id', reward.id, 'redemption_id', redemption_id,
    'coin_cost', reward.coin_cost, 'coin_balance', current_balance,
    'voucher_code', issued_voucher_code, 'voucher_category', reward.voucher_category
  );
end;
$$;

revoke all on function public.redeem_furgo_coin_exchange_item(uuid) from public, anon;
grant execute on function public.redeem_furgo_coin_exchange_item(uuid) to authenticated;
