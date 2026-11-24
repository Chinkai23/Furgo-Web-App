-- Structural permission checks for migration 0113. Run after applying the
-- migration with a role allowed to inspect PostgreSQL privileges.
do $$
declare
  private_tables text[] := array[
    'marketplace_seller_profiles',
    'marketplace_seller_users',
    'marketplace_seller_products',
    'marketplace_seller_fee_rules',
    'marketplace_seller_sale_lines',
    'marketplace_seller_restocks',
    'marketplace_seller_payouts'
  ];
  table_name text;
begin
  foreach table_name in array private_tables loop
    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') then
      raise exception 'Seller-private table % is directly readable by browser roles.', table_name;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.seller_portal_snapshot()', 'EXECUTE') then
    raise exception 'Anonymous users can execute the seller snapshot RPC.';
  end if;
  if not has_function_privilege('authenticated', 'public.seller_portal_snapshot()', 'EXECUTE') then
    raise exception 'Authenticated sellers cannot execute their scoped snapshot RPC.';
  end if;
  if has_function_privilege('anon', 'public.admin_marketplace_sellers()', 'EXECUTE') then
    raise exception 'Anonymous users can execute seller administration.';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_marketplace_sellers()', 'EXECUTE') then
    raise exception 'Authenticated Directors cannot execute seller administration RPC.';
  end if;
  if has_function_privilege('anon', 'public.admin_marketplace_seller_record_payout(uuid,date,date,numeric,text,text)', 'EXECUTE') then
    raise exception 'Anonymous users can record seller payouts.';
  end if;
end;
$$;
