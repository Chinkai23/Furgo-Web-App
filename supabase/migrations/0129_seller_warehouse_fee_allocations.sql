-- Assign storage types and allocated quantities to each seller. Warehouse fees
-- are calculated as the sum of each saved monthly rate times its allocated
-- amount. An empty allocation list means no warehouse fee. The saved rate is
-- snapshotted so later catalogue edits do not change an existing fee.

create table if not exists public.marketplace_seller_warehouse_fee_allocations (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.marketplace_seller_profiles(id) on delete cascade,
  rule_id uuid not null references public.marketplace_warehouse_fee_rules(id) on delete restrict,
  storage_type text not null,
  billing_unit text not null,
  price_per_unit numeric(12,2) not null check (price_per_unit >= 0),
  unit_amount numeric(12,2) not null check (unit_amount > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create index if not exists marketplace_seller_warehouse_allocations_current_idx
  on public.marketplace_seller_warehouse_fee_allocations (seller_id, effective_from desc)
  where effective_to is null;

alter table public.marketplace_seller_warehouse_fee_allocations enable row level security;
revoke all on public.marketplace_seller_warehouse_fee_allocations from anon, authenticated;

create or replace function public.admin_marketplace_seller_get_fee_configuration(p_seller_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare configuration jsonb;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;
  if not exists (
    select 1 from public.marketplace_seller_profiles seller
    where seller.id = p_seller_id and seller.deleted_at is null
  ) then
    raise exception 'Seller was not found.';
  end if;

  select jsonb_build_object(
    'warehouse_fee_enabled', coalesce(fee.warehouse_fee_enabled, false),
    'warehouse_fee_per_unit', coalesce(fee.warehouse_fee_per_unit, 0),
    'pack_ship_fee_per_unit', coalesce(fee.pack_ship_fee_per_unit, 0),
    'marketplace_fee_percent', coalesce(fee.commission_percent, 0),
    'payout_basis', coalesce(fee.payout_basis, 'net_after_fees'),
    'effective_from', fee.effective_from,
    'warehouse_allocations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', allocation.id,
        'rule_id', allocation.rule_id,
        'storage_type', allocation.storage_type,
        'billing_unit', allocation.billing_unit,
        'price_per_unit', allocation.price_per_unit,
        'unit_amount', allocation.unit_amount,
        'line_fee', allocation.price_per_unit * allocation.unit_amount,
        'is_active', rule.is_active
      ) order by rule.sort_order, allocation.storage_type, allocation.billing_unit)
      from public.marketplace_seller_warehouse_fee_allocations allocation
      join public.marketplace_warehouse_fee_rules rule on rule.id = allocation.rule_id
      where allocation.seller_id = p_seller_id
        and allocation.effective_from <= now()
        and (allocation.effective_to is null or allocation.effective_to > now())
    ), '[]'::jsonb),
    'warehouse_fee_total', coalesce((
      select sum(allocation.price_per_unit * allocation.unit_amount)
      from public.marketplace_seller_warehouse_fee_allocations allocation
      where allocation.seller_id = p_seller_id
        and allocation.effective_from <= now()
        and (allocation.effective_to is null or allocation.effective_to > now())
    ), 0)
  )
  into configuration
  from (select p_seller_id as id) selected_seller
  left join lateral (
    select current_fee.*
    from public.marketplace_seller_fee_rules current_fee
    where current_fee.seller_id = selected_seller.id and current_fee.effective_to is null
    order by current_fee.effective_from desc
    limit 1
  ) fee on true;

  return configuration;
end;
$$;

revoke all on function public.admin_marketplace_seller_get_fee_configuration(uuid) from public, anon;
grant execute on function public.admin_marketplace_seller_get_fee_configuration(uuid) to authenticated;

create or replace function public.admin_marketplace_seller_save_fee_configuration(
  p_seller_id uuid,
  p_pack_ship_fee_per_unit numeric,
  p_marketplace_fee_percent numeric,
  p_payout_basis text,
  p_warehouse_allocations jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  allocation_rule_id uuid;
  allocation_amount numeric(12,2);
  selected_rule public.marketplace_warehouse_fee_rules%rowtype;
  allocation_count integer;
  distinct_rule_count integer;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;
  if not exists (
    select 1 from public.marketplace_seller_profiles seller
    where seller.id = p_seller_id and seller.deleted_at is null
  ) then
    raise exception 'Seller was not found.';
  end if;
  if jsonb_typeof(coalesce(p_warehouse_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'Warehouse allocations must be a list.';
  end if;

  select count(*), count(distinct value->>'rule_id')
    into allocation_count, distinct_rule_count
  from jsonb_array_elements(coalesce(p_warehouse_allocations, '[]'::jsonb)) as rows(value);
  if allocation_count <> distinct_rule_count then
    raise exception 'Choose each storage type only once.';
  end if;

  -- Validate the entire allocation list before changing either fee settings
  -- or the effective-dated allocation history.
  for item in select value from jsonb_array_elements(coalesce(p_warehouse_allocations, '[]'::jsonb)) as rows(value)
  loop
    begin
      allocation_rule_id := nullif(item->>'rule_id', '')::uuid;
      allocation_amount := nullif(btrim(item->>'unit_amount'), '')::numeric;
    exception when others then
      raise exception 'Enter a valid storage type and allocated amount.';
    end;
    if allocation_rule_id is null or coalesce(allocation_amount, 0) <= 0 then
      raise exception 'Each selected storage type needs an allocated amount greater than zero.';
    end if;

    select rule.* into selected_rule
    from public.marketplace_warehouse_fee_rules rule
    where rule.id = allocation_rule_id;
    if not found then
      raise exception 'A selected storage type no longer exists.';
    end if;
    if not selected_rule.is_active and not exists (
      select 1 from public.marketplace_seller_warehouse_fee_allocations current_allocation
      where current_allocation.seller_id = p_seller_id
        and current_allocation.rule_id = allocation_rule_id
        and current_allocation.effective_to is null
    ) then
      raise exception 'A new allocation must use an active storage type.';
    end if;
  end loop;

  perform public.admin_marketplace_seller_set_fee_configuration(
    p_seller_id, false, 0, p_pack_ship_fee_per_unit,
    p_marketplace_fee_percent, p_payout_basis
  );

  update public.marketplace_seller_warehouse_fee_allocations
  set effective_to = now()
  where seller_id = p_seller_id and effective_to is null;

  for item in select value from jsonb_array_elements(coalesce(p_warehouse_allocations, '[]'::jsonb)) as rows(value)
  loop
    allocation_rule_id := nullif(item->>'rule_id', '')::uuid;
    allocation_amount := nullif(btrim(item->>'unit_amount'), '')::numeric;
    select rule.* into selected_rule
    from public.marketplace_warehouse_fee_rules rule
    where rule.id = allocation_rule_id;

    insert into public.marketplace_seller_warehouse_fee_allocations (
      seller_id, rule_id, storage_type, billing_unit, price_per_unit,
      unit_amount, created_by
    ) values (
      p_seller_id, selected_rule.id, selected_rule.storage_type,
      selected_rule.billing_unit, selected_rule.price_per_unit,
      allocation_amount, auth.uid()
    );
  end loop;
end;
$$;

revoke all on function public.admin_marketplace_seller_save_fee_configuration(uuid, numeric, numeric, text, jsonb) from public, anon;
grant execute on function public.admin_marketplace_seller_save_fee_configuration(uuid, numeric, numeric, text, jsonb) to authenticated;

create or replace function public.seller_portal_fee_schedule()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  seller_scope uuid := public.seller_portal_require_scope();
  schedule jsonb;
begin
  select jsonb_build_object(
    'warehouse_fee_enabled', coalesce(fee.warehouse_fee_enabled, false),
    'warehouse_fee_per_unit', coalesce(fee.warehouse_fee_per_unit, 0),
    'marketplace_fee_percent', coalesce(fee.commission_percent, 0),
    'effective_from', fee.effective_from,
    'warehouse_allocations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', allocation.id,
        'rule_id', allocation.rule_id,
        'storage_type', allocation.storage_type,
        'billing_unit', allocation.billing_unit,
        'price_per_unit', allocation.price_per_unit,
        'unit_amount', allocation.unit_amount,
        'line_fee', allocation.price_per_unit * allocation.unit_amount
      ) order by allocation.storage_type, allocation.billing_unit)
      from public.marketplace_seller_warehouse_fee_allocations allocation
      where allocation.seller_id = seller_scope
        and allocation.effective_from <= now()
        and (allocation.effective_to is null or allocation.effective_to > now())
    ), '[]'::jsonb),
    'warehouse_fee_total', coalesce((
      select sum(allocation.price_per_unit * allocation.unit_amount)
      from public.marketplace_seller_warehouse_fee_allocations allocation
      where allocation.seller_id = seller_scope
        and allocation.effective_from <= now()
        and (allocation.effective_to is null or allocation.effective_to > now())
    ), 0)
  )
  into schedule
  from (select seller_scope as id) scoped_seller
  left join lateral (
    select current_fee.*
    from public.marketplace_seller_fee_rules current_fee
    where current_fee.seller_id = scoped_seller.id
      and current_fee.effective_from <= now()
      and (current_fee.effective_to is null or current_fee.effective_to > now())
    order by current_fee.effective_from desc
    limit 1
  ) fee on true;

  return schedule;
end;
$$;

revoke all on function public.seller_portal_fee_schedule() from public, anon;
grant execute on function public.seller_portal_fee_schedule() to authenticated;
