-- Section: Pet Assistant Energy billing
-- Function: Convert Furgo Coins into a cost-backed Energy balance and settle
--           each successful OpenAI response against its server-reported usage.

create table if not exists public.furgo_coin_wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

-- Carry forward existing per-account Furgo Coin balances from prototype storage.
-- The 99,999,999 value was used as a temporary visual test balance and is not a real wallet balance.
insert into public.furgo_coin_wallets (user_id, balance)
select owner_id, greatest(0, floor((payload #>> '{}')::numeric))::bigint
from public.app_data
where scope = 'customer'
  and storage_key = 'furgo-demo-token-balance'
  and owner_id is not null
  and jsonb_typeof(payload) = 'number'
  and payload <> '99999999'::jsonb
on conflict (user_id) do nothing;

create table if not exists public.pet_assistant_energy_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  energy_balance numeric(20, 8) not null default 0 check (energy_balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.pet_assistant_energy_reservations (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  reserved_energy numeric(20, 8) not null check (reserved_energy > 0),
  status text not null default 'pending' check (status in ('pending', 'settled', 'released')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes')
);

create index if not exists pet_assistant_energy_reservations_pending_idx
  on public.pet_assistant_energy_reservations (user_id, expires_at)
  where status = 'pending';

create table if not exists public.pet_assistant_energy_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_type text not null check (entry_type in ('coin_top_up', 'ai_usage', 'reservation_release')),
  coin_delta bigint not null default 0,
  energy_delta numeric(20, 8) not null default 0,
  pet_id uuid references public.pet_profiles (id) on delete set null,
  response_id text unique,
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_myr numeric(20, 12) not null default 0 check (cost_myr >= 0),
  created_at timestamptz not null default now()
);

create index if not exists pet_assistant_energy_ledger_user_created_idx
  on public.pet_assistant_energy_ledger (user_id, created_at desc);

alter table public.pet_assistant_usage
  add column if not exists estimated_cost_myr numeric(20, 12) not null default 0,
  add column if not exists usd_to_myr_rate numeric(12, 6) not null default 4.058700,
  add column if not exists energy_deducted numeric(20, 8) not null default 0;

alter table public.furgo_coin_wallets enable row level security;
alter table public.pet_assistant_energy_accounts enable row level security;
alter table public.pet_assistant_energy_reservations enable row level security;
alter table public.pet_assistant_energy_ledger enable row level security;

revoke all on public.furgo_coin_wallets, public.pet_assistant_energy_accounts,
  public.pet_assistant_energy_reservations, public.pet_assistant_energy_ledger from anon, authenticated;
grant select, insert, update on public.furgo_coin_wallets to service_role;
grant select, insert, update on public.pet_assistant_energy_accounts to service_role;
grant select, insert, update on public.pet_assistant_energy_reservations to service_role;
grant select, insert, update on public.pet_assistant_energy_ledger to service_role;

create or replace function public.release_expired_pet_assistant_energy_reservations(_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _reservation public.pet_assistant_energy_reservations%rowtype;
begin
  for _reservation in
    select * from public.pet_assistant_energy_reservations
    where user_id = _user_id and status = 'pending' and expires_at <= now()
    for update
  loop
    update public.pet_assistant_energy_accounts
      set energy_balance = energy_balance + _reservation.reserved_energy, updated_at = now()
      where user_id = _user_id;
    update public.pet_assistant_energy_reservations
      set status = 'released' where id = _reservation.id;
    insert into public.pet_assistant_energy_ledger (user_id, entry_type, energy_delta)
      values (_user_id, 'reservation_release', _reservation.reserved_energy);
  end loop;
end;
$$;

create or replace function public.get_furgo_coin_energy_balance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _coins bigint;
  _energy numeric(20, 8);
begin
  if _user_id is null then raise exception 'Sign in to view your balance.'; end if;
  insert into public.furgo_coin_wallets (user_id) values (_user_id) on conflict do nothing;
  insert into public.pet_assistant_energy_accounts (user_id) values (_user_id) on conflict do nothing;
  perform public.release_expired_pet_assistant_energy_reservations(_user_id);
  select balance into _coins from public.furgo_coin_wallets where user_id = _user_id;
  select energy_balance into _energy from public.pet_assistant_energy_accounts where user_id = _user_id;
  return jsonb_build_object('coin_balance', _coins, 'energy_balance', _energy);
end;
$$;

create or replace function public.purchase_pet_assistant_energy()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _coins bigint;
  _energy numeric(20, 8);
begin
  if _user_id is null then raise exception 'Sign in to add Energy.'; end if;
  insert into public.furgo_coin_wallets (user_id) values (_user_id) on conflict do nothing;
  insert into public.pet_assistant_energy_accounts (user_id) values (_user_id) on conflict do nothing;
  perform public.release_expired_pet_assistant_energy_reservations(_user_id);
  select balance into _coins from public.furgo_coin_wallets where user_id = _user_id for update;
  if _coins < 1 then raise exception 'You need 1 Furgo Coin to add 100 Energy.'; end if;
  update public.furgo_coin_wallets set balance = balance - 1, updated_at = now()
    where user_id = _user_id returning balance into _coins;
  update public.pet_assistant_energy_accounts set energy_balance = energy_balance + 100, updated_at = now()
    where user_id = _user_id returning energy_balance into _energy;
  insert into public.pet_assistant_energy_ledger (user_id, entry_type, coin_delta, energy_delta)
    values (_user_id, 'coin_top_up', -1, 100);
  return jsonb_build_object('coin_balance', _coins, 'energy_balance', _energy);
end;
$$;

create or replace function public.reserve_pet_assistant_energy(_user_id uuid, _reservation_id uuid, _amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _energy numeric(20, 8);
begin
  if _amount <= 0 or _amount > 10000 then raise exception 'Invalid Energy reservation.'; end if;
  insert into public.pet_assistant_energy_accounts (user_id) values (_user_id) on conflict do nothing;
  perform public.release_expired_pet_assistant_energy_reservations(_user_id);
  select energy_balance into _energy from public.pet_assistant_energy_accounts where user_id = _user_id for update;
  if _energy < _amount then
    return jsonb_build_object('ok', false, 'energy_balance', _energy);
  end if;
  update public.pet_assistant_energy_accounts set energy_balance = energy_balance - _amount, updated_at = now()
    where user_id = _user_id returning energy_balance into _energy;
  insert into public.pet_assistant_energy_reservations (id, user_id, reserved_energy)
    values (_reservation_id, _user_id, _amount);
  return jsonb_build_object('ok', true, 'energy_balance', _energy);
end;
$$;

create or replace function public.settle_pet_assistant_energy(
  _user_id uuid, _reservation_id uuid, _response_id text, _pet_id uuid, _model text,
  _input_tokens integer, _cached_input_tokens integer, _output_tokens integer,
  _input_usd_per_million numeric, _cached_input_usd_per_million numeric,
  _output_usd_per_million numeric, _estimated_cost_usd numeric,
  _estimated_cost_myr numeric, _usd_to_myr_rate numeric, _energy_deducted numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _reservation public.pet_assistant_energy_reservations%rowtype;
  _energy numeric(20, 8);
  _refund numeric(20, 8);
begin
  select * into _reservation from public.pet_assistant_energy_reservations
    where id = _reservation_id and user_id = _user_id for update;
  if not found then raise exception 'Energy reservation was not found.'; end if;
  if _reservation.status = 'settled' then
    select energy_balance into _energy from public.pet_assistant_energy_accounts where user_id = _user_id;
    return jsonb_build_object('energy_balance', _energy, 'energy_deducted', _energy_deducted);
  end if;
  if _reservation.status <> 'pending' then raise exception 'Energy reservation is no longer active.'; end if;
  if _energy_deducted < 0 or _energy_deducted > _reservation.reserved_energy then
    raise exception 'Actual Energy exceeded the reserved amount.';
  end if;
  _refund := _reservation.reserved_energy - _energy_deducted;
  update public.pet_assistant_energy_accounts
    set energy_balance = energy_balance + _refund, updated_at = now()
    where user_id = _user_id returning energy_balance into _energy;
  update public.pet_assistant_energy_reservations set status = 'settled' where id = _reservation_id;
  insert into public.pet_assistant_energy_ledger (
    user_id, entry_type, energy_delta, pet_id, response_id, model, input_tokens, cached_input_tokens,
    output_tokens, cost_myr
  ) values (
    _user_id, 'ai_usage', -_energy_deducted, _pet_id, _response_id, _model,
    _input_tokens, _cached_input_tokens, _output_tokens, _estimated_cost_myr
  );
  insert into public.pet_assistant_usage (
    user_id, pet_id, model, response_id, input_tokens, cached_input_tokens, output_tokens,
    total_tokens, input_usd_per_million, cached_input_usd_per_million, output_usd_per_million,
    estimated_cost_usd, estimated_cost_myr, usd_to_myr_rate, energy_deducted
  ) values (
    _user_id, _pet_id, _model, _response_id, _input_tokens, _cached_input_tokens, _output_tokens,
    _input_tokens + _output_tokens, _input_usd_per_million, _cached_input_usd_per_million,
    _output_usd_per_million, _estimated_cost_usd, _estimated_cost_myr, _usd_to_myr_rate, _energy_deducted
  );
  return jsonb_build_object('energy_balance', _energy, 'energy_deducted', _energy_deducted);
end;
$$;

create or replace function public.release_pet_assistant_energy(_user_id uuid, _reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _reservation public.pet_assistant_energy_reservations%rowtype;
begin
  select * into _reservation from public.pet_assistant_energy_reservations
    where id = _reservation_id and user_id = _user_id for update;
  if not found or _reservation.status <> 'pending' then return; end if;
  update public.pet_assistant_energy_accounts
    set energy_balance = energy_balance + _reservation.reserved_energy, updated_at = now()
    where user_id = _user_id;
  update public.pet_assistant_energy_reservations set status = 'released' where id = _reservation_id;
  insert into public.pet_assistant_energy_ledger (user_id, entry_type, energy_delta)
    values (_user_id, 'reservation_release', _reservation.reserved_energy);
end;
$$;

revoke all on function public.release_expired_pet_assistant_energy_reservations(uuid) from public, anon, authenticated;
revoke all on function public.get_furgo_coin_energy_balance() from public, anon;
revoke all on function public.purchase_pet_assistant_energy() from public, anon;
revoke all on function public.reserve_pet_assistant_energy(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.settle_pet_assistant_energy(uuid, uuid, text, uuid, text, integer, integer, integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.release_pet_assistant_energy(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_furgo_coin_energy_balance() to authenticated;
grant execute on function public.purchase_pet_assistant_energy() to authenticated;
grant execute on function public.reserve_pet_assistant_energy(uuid, uuid, numeric) to service_role;
grant execute on function public.settle_pet_assistant_energy(uuid, uuid, text, uuid, text, integer, integer, integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to service_role;
grant execute on function public.release_pet_assistant_energy(uuid, uuid) to service_role;
