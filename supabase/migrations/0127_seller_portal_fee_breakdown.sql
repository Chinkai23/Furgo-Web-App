-- Expose the seller's current fee breakdown without exposing another
-- seller's settings or the internal fee-rule table.
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
    'warehouse_fee_enabled', fee.warehouse_fee_enabled,
    'warehouse_fee_per_unit', fee.warehouse_fee_per_unit,
    'marketplace_fee_percent', fee.commission_percent,
    'effective_from', fee.effective_from
  )
  into schedule
  from public.marketplace_seller_fee_rules as fee
  where fee.seller_id = seller_scope
    and fee.effective_from <= now()
    and (fee.effective_to is null or fee.effective_to > now())
  order by fee.effective_from desc
  limit 1;

  return coalesce(schedule, jsonb_build_object(
    'warehouse_fee_enabled', false,
    'warehouse_fee_per_unit', 0,
    'marketplace_fee_percent', 0
  ));
end;
$$;

revoke all on function public.seller_portal_fee_schedule() from public, anon;
grant execute on function public.seller_portal_fee_schedule() to authenticated;
