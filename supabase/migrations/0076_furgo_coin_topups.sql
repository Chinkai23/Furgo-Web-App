-- Furgo Coins top-up requests. Coin balances are credited only after a Manager
-- or Director verifies payment; the browser cannot directly edit wallet balances.

create table if not exists public.furgo_coin_topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_myr numeric(10, 2) not null check (amount_myr >= 1 and amount_myr <= 5000),
  coin_amount bigint not null check (coin_amount > 0),
  payment_method text not null check (payment_method in ('bank-transfer', 'online-payment')),
  status text not null default 'pending-verification' check (status in ('pending-verification', 'approved', 'rejected')),
  transfer_slip jsonb,
  decision_reason text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coin_amount = round(amount_myr * 100)::bigint),
  check (payment_method <> 'bank-transfer' or transfer_slip is not null)
);

create index if not exists furgo_coin_topup_requests_user_created_idx
  on public.furgo_coin_topup_requests(user_id, created_at desc);
create index if not exists furgo_coin_topup_requests_pending_idx
  on public.furgo_coin_topup_requests(created_at desc)
  where status = 'pending-verification';

alter table public.furgo_coin_topup_requests enable row level security;
revoke all on public.furgo_coin_topup_requests from public, anon, authenticated;
grant select on public.furgo_coin_topup_requests to authenticated;

drop policy if exists "Customers and portal managers read coin top-up requests" on public.furgo_coin_topup_requests;
create policy "Customers and portal managers read coin top-up requests"
  on public.furgo_coin_topup_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.current_portal_level(auth.uid())) >= 2);

create or replace function public.create_furgo_coin_topup_request(
  p_amount_myr numeric,
  p_payment_method text,
  p_transfer_slip jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  normalized_amount numeric(10, 2);
  result public.furgo_coin_topup_requests%rowtype;
begin
  if caller is null then raise exception 'Sign in before requesting a Furgo Coins top-up.'; end if;
  if p_amount_myr is null or p_amount_myr < 1 or p_amount_myr > 5000 or round(p_amount_myr, 2) <> p_amount_myr then
    raise exception 'Choose a top-up amount from MYR 1.00 to MYR 5,000.00.';
  end if;
  if p_payment_method <> 'bank-transfer' then
    raise exception 'Online top-ups are unavailable until Furgo connects a payment gateway. Use manual bank transfer.';
  end if;
  if p_payment_method = 'bank-transfer' and p_transfer_slip is null then
    raise exception 'Upload your bank transfer slip before submitting.';
  end if;
  if coalesce(pg_catalog.octet_length(coalesce(p_transfer_slip, '{}'::jsonb)::text), 0) > 2200000 then
    raise exception 'The transfer slip is too large. Upload a file under 1.5 MB.';
  end if;

  normalized_amount := p_amount_myr::numeric(10, 2);
  insert into public.furgo_coin_topup_requests (
    user_id, amount_myr, coin_amount, payment_method, transfer_slip
  ) values (
    caller, normalized_amount, round(normalized_amount * 100)::bigint, p_payment_method, p_transfer_slip
  ) returning * into result;

  return pg_catalog.jsonb_build_object(
    'id', result.id, 'amount_myr', result.amount_myr, 'coin_amount', result.coin_amount,
    'payment_method', result.payment_method, 'status', result.status, 'created_at', result.created_at
  );
end;
$$;

create or replace function public.review_furgo_coin_topup(p_request_id uuid, p_decision text, p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  request_row public.furgo_coin_topup_requests%rowtype;
  new_balance bigint;
begin
  if caller is null or public.current_portal_level(caller) < 2 then
    raise exception 'Manager or Director access is required to review Furgo Coins top-ups.';
  end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Choose approve or reject.'; end if;
  if p_decision = 'reject' and length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Enter a reason before rejecting this top-up.';
  end if;

  select * into request_row
    from public.furgo_coin_topup_requests
   where id = p_request_id
   for update;
  if not found then raise exception 'Top-up request was not found.'; end if;
  if request_row.status <> 'pending-verification' then raise exception 'This top-up request has already been reviewed.'; end if;

  if p_decision = 'approve' then
    insert into public.furgo_coin_wallets(user_id, balance) values (request_row.user_id, 0)
      on conflict (user_id) do nothing;
    update public.furgo_coin_wallets
       set balance = balance + request_row.coin_amount, updated_at = now()
     where user_id = request_row.user_id
     returning balance into new_balance;
    insert into public.pet_assistant_energy_ledger(user_id, entry_type, coin_delta)
      values (request_row.user_id, 'coin_top_up', request_row.coin_amount);
    update public.furgo_coin_topup_requests
       set status = 'approved', reviewed_by = caller, reviewed_at = now(), updated_at = now(), decision_reason = ''
     where id = request_row.id;
  else
    update public.furgo_coin_topup_requests
       set status = 'rejected', reviewed_by = caller, reviewed_at = now(), updated_at = now(), decision_reason = left(btrim(p_reason), 500)
     where id = request_row.id;
  end if;

  return pg_catalog.jsonb_build_object('id', request_row.id, 'status', case when p_decision = 'approve' then 'approved' else 'rejected' end, 'coin_balance', new_balance);
end;
$$;

revoke all on function public.create_furgo_coin_topup_request(numeric, text, jsonb) from public, anon;
revoke all on function public.review_furgo_coin_topup(uuid, text, text) from public, anon;
grant execute on function public.create_furgo_coin_topup_request(numeric, text, jsonb) to authenticated;
grant execute on function public.review_furgo_coin_topup(uuid, text, text) to authenticated;
