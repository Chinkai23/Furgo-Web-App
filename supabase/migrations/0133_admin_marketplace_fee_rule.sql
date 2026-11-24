-- Director-managed Marketplace Fee percentage rule.
-- This central rule is editable from Admin Portal → Manage Fee & Payout.
-- Seller-specific fee schedules remain authoritative for payout calculations.

create table if not exists public.marketplace_fee_settings (
  singleton boolean primary key default true check (singleton),
  fee_percent numeric(7,4) not null default 0
    check (fee_percent >= 0 and fee_percent <= 100),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.marketplace_fee_settings (singleton, fee_percent)
values (true, 0)
on conflict (singleton) do nothing;

alter table public.marketplace_fee_settings enable row level security;
revoke all on public.marketplace_fee_settings from anon, authenticated;

create or replace function public.admin_marketplace_fee_rule_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare fee_percent_value numeric(7,4);
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;

  select settings.fee_percent
    into fee_percent_value
  from public.marketplace_fee_settings as settings
  where settings.singleton = true;

  return jsonb_build_object('fee_percent', coalesce(fee_percent_value, 0));
end;
$$;

create or replace function public.admin_marketplace_fee_rule_save(p_fee_percent numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;
  if p_fee_percent is null or p_fee_percent < 0 or p_fee_percent > 100 then
    raise exception 'Enter a Marketplace Fee percentage from 0 to 100.';
  end if;

  insert into public.marketplace_fee_settings (
    singleton, fee_percent, updated_by, updated_at
  ) values (
    true, p_fee_percent, auth.uid(), now()
  )
  on conflict (singleton) do update
    set fee_percent = excluded.fee_percent,
        updated_by = auth.uid(),
        updated_at = now();
end;
$$;

revoke all on function public.admin_marketplace_fee_rule_get() from public, anon;
revoke all on function public.admin_marketplace_fee_rule_save(numeric) from public, anon;
grant execute on function public.admin_marketplace_fee_rule_get() to authenticated;
grant execute on function public.admin_marketplace_fee_rule_save(numeric) to authenticated;

notify pgrst, 'reload schema';
