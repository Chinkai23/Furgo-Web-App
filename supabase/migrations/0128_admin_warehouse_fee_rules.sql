-- Central warehouse storage fee catalogue. Seller-specific storage allocations
-- and fee calculations will reference these rules in a later migration.

create table if not exists public.marketplace_warehouse_fee_rules (
  id uuid primary key default gen_random_uuid(),
  storage_type text not null check (length(btrim(storage_type)) between 1 and 100),
  billing_unit text not null check (length(btrim(billing_unit)) between 1 and 60),
  price_per_unit numeric(12,2) not null default 0 check (price_per_unit >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_warehouse_fee_rules_active_order_idx
  on public.marketplace_warehouse_fee_rules (is_active, sort_order, created_at);

alter table public.marketplace_warehouse_fee_rules enable row level security;
revoke all on public.marketplace_warehouse_fee_rules from anon, authenticated;

create or replace function public.admin_warehouse_fee_rules_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare rules jsonb;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rule.id,
    'storage_type', rule.storage_type,
    'billing_unit', rule.billing_unit,
    'price_per_unit', rule.price_per_unit,
    'is_active', rule.is_active,
    'sort_order', rule.sort_order,
    'created_at', rule.created_at,
    'updated_at', rule.updated_at
  ) order by rule.sort_order, rule.created_at, rule.id), '[]'::jsonb)
  into rules
  from public.marketplace_warehouse_fee_rules as rule;

  return rules;
end;
$$;

create or replace function public.admin_warehouse_fee_rule_save(
  p_id uuid,
  p_storage_type text,
  p_billing_unit text,
  p_price_per_unit numeric,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare saved_id uuid;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;
  if length(btrim(coalesce(p_storage_type, ''))) not between 1 and 100
    or length(btrim(coalesce(p_billing_unit, ''))) not between 1 and 60
    or coalesce(p_price_per_unit, -1) < 0 then
    raise exception 'Enter a storage type, billing unit, and a non-negative monthly price.';
  end if;

  if p_id is null then
    insert into public.marketplace_warehouse_fee_rules (
      storage_type, billing_unit, price_per_unit, is_active, created_by
    ) values (
      btrim(p_storage_type), btrim(p_billing_unit), p_price_per_unit, coalesce(p_is_active, true), auth.uid()
    ) returning id into saved_id;
  else
    update public.marketplace_warehouse_fee_rules as rule
    set storage_type = btrim(p_storage_type),
        billing_unit = btrim(p_billing_unit),
        price_per_unit = p_price_per_unit,
        is_active = coalesce(p_is_active, true),
        updated_at = now()
    where rule.id = p_id
    returning rule.id into saved_id;
    if saved_id is null then
      raise exception 'Warehouse fee rule was not found.';
    end if;
  end if;

  return saved_id;
end;
$$;

-- Archive rather than hard-delete rules so future seller fee history can retain
-- a stable reference to the rate that applied at the time.
create or replace function public.admin_warehouse_fee_rule_archive(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;

  update public.marketplace_warehouse_fee_rules as rule
  set is_active = false, updated_at = now()
  where rule.id = p_id;

  if not found then
    raise exception 'Warehouse fee rule was not found.';
  end if;
end;
$$;

revoke all on function public.admin_warehouse_fee_rules_list() from public, anon;
revoke all on function public.admin_warehouse_fee_rule_save(uuid, text, text, numeric, boolean) from public, anon;
revoke all on function public.admin_warehouse_fee_rule_archive(uuid) from public, anon;
grant execute on function public.admin_warehouse_fee_rules_list() to authenticated;
grant execute on function public.admin_warehouse_fee_rule_save(uuid, text, text, numeric, boolean) to authenticated;
grant execute on function public.admin_warehouse_fee_rule_archive(uuid) to authenticated;
