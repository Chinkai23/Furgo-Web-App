-- Furgo Coins rewards catalogue and secure customer redemption.

create table if not exists public.furgo_coin_exchange_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1200),
  reward_type text not null default 'voucher' check (reward_type in ('voucher', 'physical-gift', 'digital-reward', 'other')),
  coin_cost bigint not null check (coin_cost > 0),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  max_redemptions integer not null check (max_redemptions > 0),
  redeemed_count integer not null default 0 check (redeemed_count >= 0 and redeemed_count <= max_redemptions),
  per_user_limit integer not null default 1 check (per_user_limit between 1 and 100),
  image_url text not null default '',
  terms text not null default '' check (char_length(terms) <= 1200),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists furgo_coin_exchange_active_idx
  on public.furgo_coin_exchange_items(is_active, starts_at, expires_at);

create table if not exists public.furgo_coin_exchange_redemptions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.furgo_coin_exchange_items(id) on delete restrict,
  reward_name text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  coin_cost bigint not null check (coin_cost > 0),
  status text not null default 'pending' check (status in ('pending', 'fulfilled')),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create index if not exists furgo_coin_exchange_redemptions_user_idx
  on public.furgo_coin_exchange_redemptions(user_id, created_at desc);
create index if not exists furgo_coin_exchange_redemptions_item_idx
  on public.furgo_coin_exchange_redemptions(item_id, created_at desc);

alter table public.furgo_coin_exchange_items enable row level security;
alter table public.furgo_coin_exchange_redemptions enable row level security;
revoke all on public.furgo_coin_exchange_items, public.furgo_coin_exchange_redemptions from public, anon, authenticated;
grant select, insert, update, delete on public.furgo_coin_exchange_items to authenticated;
grant select on public.furgo_coin_exchange_redemptions to authenticated;

drop policy if exists "Customers read available Furgo Coin rewards" on public.furgo_coin_exchange_items;
create policy "Customers read available Furgo Coin rewards"
  on public.furgo_coin_exchange_items for select to authenticated
  using (is_active and starts_at <= now() and (expires_at is null or expires_at > now()) and redeemed_count < max_redemptions
    or (select public.current_portal_level(auth.uid())) >= 2);

drop policy if exists "Managers manage Furgo Coin rewards" on public.furgo_coin_exchange_items;
create policy "Managers manage Furgo Coin rewards"
  on public.furgo_coin_exchange_items for all to authenticated
  using ((select public.current_portal_level(auth.uid())) >= 2)
  with check ((select public.current_portal_level(auth.uid())) >= 2);

drop policy if exists "Customers and managers read Furgo Coin redemptions" on public.furgo_coin_exchange_redemptions;
create policy "Customers and managers read Furgo Coin redemptions"
  on public.furgo_coin_exchange_redemptions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.current_portal_level(auth.uid())) >= 2);

create or replace function public.fulfill_furgo_coin_exchange_redemption(p_redemption_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  redemption public.furgo_coin_exchange_redemptions%rowtype;
begin
  if caller is null or public.current_portal_level(caller) < 2 then
    raise exception 'Manager or Director access is required to update coin redemptions.';
  end if;
  update public.furgo_coin_exchange_redemptions
     set status = 'fulfilled', fulfilled_at = now()
   where id = p_redemption_id and status = 'pending'
   returning * into redemption;
  if not found then raise exception 'This redemption is already fulfilled or no longer exists.'; end if;
  return pg_catalog.jsonb_build_object('ok', true, 'redemption_id', redemption.id, 'status', redemption.status);
end;
$$;
revoke all on function public.fulfill_furgo_coin_exchange_redemption(uuid) from public, anon;
grant execute on function public.fulfill_furgo_coin_exchange_redemption(uuid) to authenticated;

alter table public.pet_assistant_energy_ledger
  drop constraint if exists pet_assistant_energy_ledger_entry_type_check;
alter table public.pet_assistant_energy_ledger
  add constraint pet_assistant_energy_ledger_entry_type_check
  check (entry_type in ('coin_top_up', 'ai_usage', 'reservation_release', 'coin_exchange'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('furgo-coin-rewards', 'furgo-coin-rewards', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Public can view Furgo Coin reward images" on storage.objects;
create policy "Public can view Furgo Coin reward images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'furgo-coin-rewards');
drop policy if exists "Managers upload Furgo Coin reward images" on storage.objects;
create policy "Managers upload Furgo Coin reward images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'furgo-coin-rewards' and public.current_portal_level(auth.uid()) >= 2);
drop policy if exists "Managers update Furgo Coin reward images" on storage.objects;
create policy "Managers update Furgo Coin reward images"
  on storage.objects for update to authenticated
  using (bucket_id = 'furgo-coin-rewards' and public.current_portal_level(auth.uid()) >= 2)
  with check (bucket_id = 'furgo-coin-rewards' and public.current_portal_level(auth.uid()) >= 2);
drop policy if exists "Managers delete Furgo Coin reward images" on storage.objects;
create policy "Managers delete Furgo Coin reward images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'furgo-coin-rewards' and public.current_portal_level(auth.uid()) >= 2);

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

  update public.furgo_coin_wallets
     set balance = balance - reward.coin_cost, updated_at = now()
   where user_id = caller returning balance into current_balance;
  insert into public.furgo_coin_exchange_redemptions(item_id, reward_name, user_id, coin_cost)
    values (reward.id, reward.name, caller, reward.coin_cost);
  update public.furgo_coin_exchange_items
     set redeemed_count = redeemed_count + 1, updated_at = now()
   where id = reward.id;
  insert into public.pet_assistant_energy_ledger(user_id, entry_type, coin_delta)
    values (caller, 'coin_exchange', -reward.coin_cost);

  return pg_catalog.jsonb_build_object('ok', true, 'item_id', reward.id,
    'coin_cost', reward.coin_cost, 'coin_balance', current_balance);
end;
$$;

revoke all on function public.redeem_furgo_coin_exchange_item(uuid) from public, anon;
grant execute on function public.redeem_furgo_coin_exchange_item(uuid) to authenticated;
