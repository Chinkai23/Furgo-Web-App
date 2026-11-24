-- Allow Directors to permanently delete warehouse fee rules that are not
-- referenced by seller allocations. Allocation rows snapshot the original
-- rate and remain financial history, so referenced rules are protected.

create or replace function public.admin_warehouse_fee_rule_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;

  if not exists (
    select 1 from public.marketplace_warehouse_fee_rules as rule
    where rule.id = p_id
  ) then
    raise exception 'Warehouse fee rule was not found.';
  end if;

  if exists (
    select 1 from public.marketplace_seller_warehouse_fee_allocations as allocation
    where allocation.rule_id = p_id
  ) then
    raise exception 'This warehouse fee rule is used in a seller allocation and cannot be deleted. Set it to Inactive to keep its fee history.';
  end if;

  delete from public.marketplace_warehouse_fee_rules as rule
  where rule.id = p_id;
end;
$$;

revoke all on function public.admin_warehouse_fee_rule_delete(uuid) from public, anon;
grant execute on function public.admin_warehouse_fee_rule_delete(uuid) to authenticated;

notify pgrst, 'reload schema';
