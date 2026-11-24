-- Allow a seller to allocate the same storage type more than once, for
-- separate areas, zones, or warehouse allocations.

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

  -- Validate the entire allocation list before changing fee settings or
  -- effective-dated allocation history. Repeated rule_id values are allowed.
  for item in
    select value
    from jsonb_array_elements(coalesce(p_warehouse_allocations, '[]'::jsonb)) as rows(value)
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

  for item in
    select value
    from jsonb_array_elements(coalesce(p_warehouse_allocations, '[]'::jsonb)) as rows(value)
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
