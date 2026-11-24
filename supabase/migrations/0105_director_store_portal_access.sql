-- Allow Directors to open a selected Store Portal from Manage Store.
-- Regular Store accounts remain limited to accounts in their shared warehouse.

create or replace function public.marketplace_store_can_access_owner(p_owner_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner_user_id is not null and (
    coalesce(public.current_portal_level(auth.uid()), 0) >= 3
    or exists (
      select 1
      from public.marketplace_store_account_history caller
      join public.marketplace_store_account_history owner_account
        on owner_account.store_id = caller.store_id
      where caller.user_id = auth.uid()
        and caller.removed_at is null
        and owner_account.user_id = p_owner_user_id
        and owner_account.removed_at is null
    )
    or exists (
      select 1
      from public.marketplace_supplier_access caller
      join public.marketplace_supplier_access owner_access
        on lower(btrim(owner_access.supplier_name)) = lower(btrim(caller.supplier_name))
      where caller.supplier_user_id = auth.uid()
        and owner_access.supplier_user_id = p_owner_user_id
    )
  );
$$;
revoke all on function public.marketplace_store_can_access_owner(uuid) from public, anon;
grant execute on function public.marketplace_store_can_access_owner(uuid) to authenticated;

drop policy if exists "Store members add warehouse products" on public.warehouse_products;
create policy "Store members add warehouse products"
  on public.warehouse_products for insert to authenticated
  with check (
    (created_by = (select auth.uid()) or coalesce(public.current_portal_level(auth.uid()), 0) >= 3)
    and public.marketplace_store_can_access_owner(created_by)
  );

drop policy if exists "Store members add warehouse inventory" on public.warehouse_inventory_lots;
create policy "Store members add warehouse inventory"
  on public.warehouse_inventory_lots for insert to authenticated
  with check (
    (created_by = (select auth.uid()) or coalesce(public.current_portal_level(auth.uid()), 0) >= 3)
    and public.marketplace_store_can_access_owner(created_by)
    and (warehouse_product_id is null or exists (
      select 1 from public.warehouse_products product
      where product.id = warehouse_product_id
        and public.marketplace_store_can_access_owner(product.created_by)
    ))
  );

-- A Director's catalog view is explicitly scoped to the Store selected in Manage Store.
create or replace function public.get_marketplace_store_catalog(p_supplier_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  store_name text := btrim(coalesce(p_supplier_name, ''));
  catalog jsonb;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Only Directors can open a Store catalog this way.';
  end if;
  if store_name = '' then raise exception 'Choose a Store first.'; end if;

  select data.payload into catalog
  from public.app_data data
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared';
  if jsonb_typeof(catalog) is distinct from 'array' then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(
      jsonb_set(product, '{variants}', coalesce((
        select jsonb_agg(variant)
        from jsonb_array_elements(coalesce(product->'variants', '[]'::jsonb)) variant
        where lower(coalesce(variant->>'supplierId', variant->>'supplier', '')) = lower(store_name)
      ), '[]'::jsonb), true)
      order by lower(coalesce(product->>'name', ''))
    )
    from jsonb_array_elements(catalog) product
    where exists (
      select 1 from jsonb_array_elements(coalesce(product->'variants', '[]'::jsonb)) variant
      where lower(coalesce(variant->>'supplierId', variant->>'supplier', '')) = lower(store_name)
    )
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_marketplace_store_catalog(text) from public, anon;
grant execute on function public.get_marketplace_store_catalog(text) to authenticated;

create or replace function public.get_marketplace_store_warehouse_owner_ids(p_store_name text)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  store_id_value uuid;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Only Directors can open a Store warehouse this way.';
  end if;
  select store.id into store_id_value
  from public.marketplace_stores store
  where store.store_key = lower(btrim(coalesce(p_store_name, '')));
  if store_id_value is null then raise exception 'The selected Store could not be found.'; end if;

  return query
    select history.user_id
    from public.marketplace_store_account_history history
    where history.store_id = store_id_value
    union
    select access.supplier_user_id
    from public.marketplace_supplier_access access
    where lower(btrim(access.supplier_name)) = lower(btrim(p_store_name));
end;
$$;
revoke all on function public.get_marketplace_store_warehouse_owner_ids(text) from public, anon;
grant execute on function public.get_marketplace_store_warehouse_owner_ids(text) to authenticated;

-- Directors may upload warehouse photos under the selected warehouse owner path.
drop policy if exists "Managers upload marketplace product images" on storage.objects;
create policy "Managers upload marketplace product images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marketplace-submissions'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or coalesce(public.current_portal_level(auth.uid()), 0) >= 3
    )
    and coalesce(public.current_portal_level(auth.uid()), 0) >= 2
  );
