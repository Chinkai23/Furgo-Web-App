-- Preserve Store records independently from account membership so a Store can
-- remain in Manage Store with zero accounts and retain its warehouse ownership.
create table if not exists public.marketplace_stores (
  id uuid primary key default gen_random_uuid(),
  store_key text not null unique,
  store_name text not null check (char_length(btrim(store_name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (store_key = lower(btrim(store_name)))
);

create table if not exists public.marketplace_store_account_history (
  user_id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid not null references public.marketplace_stores(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  assigned_by uuid references auth.users(id) on delete set null
);
create index if not exists marketplace_store_account_history_store_idx
  on public.marketplace_store_account_history(store_id, removed_at);

insert into public.marketplace_stores(store_key, store_name)
select lower(btrim(access.supplier_name)), min(btrim(access.supplier_name))
from public.marketplace_supplier_access access
where char_length(btrim(access.supplier_name)) between 1 and 100
group by lower(btrim(access.supplier_name))
on conflict (store_key) do nothing;

insert into public.marketplace_store_account_history(user_id, store_id, assigned_at, assigned_by)
select access.supplier_user_id, store.id, access.created_at, access.assigned_by
from public.marketplace_supplier_access access
join public.marketplace_stores store on store.store_key = lower(btrim(access.supplier_name))
on conflict (user_id) do update
set store_id = excluded.store_id, removed_at = null, assigned_at = excluded.assigned_at,
    assigned_by = excluded.assigned_by;

alter table public.marketplace_stores enable row level security;
alter table public.marketplace_store_account_history enable row level security;
revoke all on public.marketplace_stores from public, anon, authenticated;
revoke all on public.marketplace_store_account_history from public, anon, authenticated;

create or replace function public.marketplace_store_can_access_owner(p_owner_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner_user_id is not null and exists (
    select 1
    from public.marketplace_store_account_history caller
    join public.marketplace_store_account_history owner_account
      on owner_account.store_id = caller.store_id
    where caller.user_id = auth.uid()
      and caller.removed_at is null
      and owner_account.user_id = p_owner_user_id
  );
$$;
revoke all on function public.marketplace_store_can_access_owner(uuid) from public, anon;
grant execute on function public.marketplace_store_can_access_owner(uuid) to authenticated;

create or replace function public.assign_marketplace_store_accounts(p_emails text[], p_supplier_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_email text;
  target_user uuid;
  target_store_id uuid;
  assigned_count integer := 0;
  store_name text := btrim(coalesce(p_supplier_name, ''));
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then raise exception 'Only Directors can assign Store accounts.'; end if;
  if char_length(store_name) not between 1 and 100 then raise exception 'Store name must be 1 to 100 characters.'; end if;
  if coalesce(array_length(p_emails, 1), 0) = 0 then raise exception 'Enter an account email.'; end if;

  insert into public.marketplace_stores(store_key, store_name)
  values (lower(store_name), store_name)
  on conflict (store_key) do nothing;
  select id into target_store_id from public.marketplace_stores where store_key = lower(store_name) for update;

  foreach target_email in array p_emails loop
    target_email := lower(btrim(coalesce(target_email, '')));
    if target_email = '' then continue; end if;
    select profile.id into target_user
    from public.profiles profile
    where lower(profile.email) = target_email limit 1;
    if target_user is null then raise exception 'No Furgo account uses %. Ask the user to register first.', target_email; end if;

    insert into public.marketplace_supplier_access (supplier_user_id, supplier_name, assigned_by, updated_at)
    values (target_user, store_name, auth.uid(), now())
    on conflict (supplier_user_id) do update
      set supplier_name = excluded.supplier_name, assigned_by = excluded.assigned_by, updated_at = now();
    insert into public.marketplace_store_account_history(user_id, store_id, assigned_at, removed_at, assigned_by)
    values (target_user, target_store_id, now(), null, auth.uid())
    on conflict (user_id) do update
      set store_id = excluded.store_id, assigned_at = now(), removed_at = null, assigned_by = auth.uid();
    assigned_count := assigned_count + 1;
  end loop;
  if assigned_count = 0 then raise exception 'Enter one valid account email.'; end if;
  return jsonb_build_object('ok', true, 'assigned_count', assigned_count, 'supplier_name', store_name);
end;
$$;
revoke all on function public.assign_marketplace_store_accounts(text[], text) from public, anon;
grant execute on function public.assign_marketplace_store_accounts(text[], text) to authenticated;

create or replace function public.remove_marketplace_store_account(p_supplier_name text, p_supplier_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  store_id_value uuid;
  account_email text;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then raise exception 'Only Directors can remove Store accounts.'; end if;
  select store.id into store_id_value
  from public.marketplace_stores store
  where store.store_key = lower(btrim(coalesce(p_supplier_name, '')));
  if store_id_value is null then raise exception 'Store could not be found.'; end if;
  select profile.email into account_email
  from public.marketplace_supplier_access access
  left join public.profiles profile on profile.id = access.supplier_user_id
  where access.supplier_user_id = p_supplier_user_id
    and lower(btrim(access.supplier_name)) = lower(btrim(p_supplier_name));
  if not found then raise exception 'This account is not assigned to the selected Store.'; end if;

  update public.marketplace_store_account_history
  set removed_at = now()
  where user_id = p_supplier_user_id and store_id = store_id_value;
  delete from public.marketplace_supplier_access
  where supplier_user_id = p_supplier_user_id
    and lower(btrim(supplier_name)) = lower(btrim(p_supplier_name));
  return jsonb_build_object('ok', true, 'store_name', p_supplier_name, 'account_email', account_email);
end;
$$;
revoke all on function public.remove_marketplace_store_account(text, uuid) from public, anon;
grant execute on function public.remove_marketplace_store_account(text, uuid) to authenticated;

drop function if exists public.get_marketplace_supplier_accounts();
create function public.get_marketplace_supplier_accounts()
returns table (
  supplier_user_id uuid, supplier_name text, created_at timestamptz,
  display_name text, email text, phone_e164 text,
  supplier_contact_phone text, avatar_path text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Only Directors can view Store account details.';
  end if;
  return query
  select access.supplier_user_id, store.store_name, access.created_at,
    profile.display_name, profile.email, profile.phone_e164,
    profile.supplier_contact_phone, profile.avatar_path
  from public.marketplace_stores store
  left join public.marketplace_supplier_access access
    on lower(btrim(access.supplier_name)) = store.store_key
  left join public.profiles profile on profile.id = access.supplier_user_id
  order by store.store_name, profile.email nulls first;
end;
$$;
revoke all on function public.get_marketplace_supplier_accounts() from public, anon;
grant execute on function public.get_marketplace_supplier_accounts() to authenticated;

create or replace function public.get_marketplace_store_warehouse_summaries()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare summaries jsonb;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Only Directors can view Store warehouse summaries.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'store_key', store.store_key,
    'store_name', store.store_name,
    'product_types', coalesce(products.product_types, 0),
    'total_stock', coalesce(stock.total_stock, 0)
  ) order by store.store_name), '[]'::jsonb)
  into summaries
  from public.marketplace_stores store
  left join lateral (
    select array_agg(account.user_id) as owner_ids
    from public.marketplace_store_account_history account
    where account.store_id = store.id
  ) owners on true
  left join lateral (
    select count(*)::integer as product_types
    from public.warehouse_products product where product.created_by = any(owners.owner_ids)
  ) products on true
  left join lateral (
    select coalesce(sum(lot.quantity), 0)::bigint as total_stock
    from public.warehouse_inventory_lots lot
    where lot.created_by = any(owners.owner_ids)
      or lot.warehouse_product_id in (
        select product.id from public.warehouse_products product where product.created_by = any(owners.owner_ids)
      )
  ) stock on true;
  return summaries;
end;
$$;
revoke all on function public.get_marketplace_store_warehouse_summaries() from public, anon;
grant execute on function public.get_marketplace_store_warehouse_summaries() to authenticated;

create or replace function public.rename_marketplace_store(p_current_store_name text, p_supplier_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  old_name text := btrim(coalesce(p_current_store_name, ''));
  new_name text := btrim(coalesce(p_supplier_name, ''));
  old_key text;
  new_key text;
  store_id_value uuid;
  catalog jsonb;
  renamed_catalog jsonb;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then raise exception 'Only Directors can edit Store names.'; end if;
  if char_length(old_name) not between 1 and 100 then raise exception 'Choose a Store to rename.'; end if;
  if char_length(new_name) not between 1 and 100 then raise exception 'Store name must be 1 to 100 characters.'; end if;
  old_key := lower(old_name); new_key := lower(new_name);
  select store.id into store_id_value from public.marketplace_stores store where store.store_key = old_key for update;
  if store_id_value is null then raise exception 'Store could not be found.'; end if;
  if old_key = new_key then
    update public.marketplace_stores set store_name = new_name, updated_at = now() where id = store_id_value;
    update public.marketplace_supplier_access set supplier_name = new_name, updated_at = now() where lower(btrim(supplier_name)) = old_key;
    return jsonb_build_object('ok', true, 'supplier_name', new_name);
  end if;
  if exists (select 1 from public.marketplace_stores where store_key = new_key) then
    raise exception 'Another Store already uses that name.';
  end if;

  select coalesce(payload, '[]'::jsonb) into catalog
  from public.app_data where record_id = 'shared:furgo-demo-marketplace-products:shared' for update;
  if catalog is not null then
    if jsonb_typeof(catalog) <> 'array' then raise exception 'Marketplace catalog data is not an array.'; end if;
    select coalesce(jsonb_agg(
      case when jsonb_typeof(product.value->'variants') = 'array' then
        jsonb_set(product.value, '{variants}', coalesce((
          select jsonb_agg(
            case when lower(btrim(coalesce(variant.value->>'supplierId', variant.value->>'supplier', ''))) = old_key
              then jsonb_set(jsonb_set(variant.value, '{supplierId}', to_jsonb(new_name), true), '{supplier}', to_jsonb(new_name), true)
              else variant.value end order by variant.ordinality
          ) from jsonb_array_elements(product.value->'variants') with ordinality as variant(value, ordinality)
        ), '[]'::jsonb), true)
      else product.value end order by product.ordinality
    ), '[]'::jsonb) into renamed_catalog
    from jsonb_array_elements(catalog) with ordinality as product(value, ordinality);
    update public.app_data set payload = renamed_catalog, updated_at = now()
    where record_id = 'shared:furgo-demo-marketplace-products:shared';
  end if;

  update public.marketplace_product_submissions submission
  set supplier_name = new_name,
      product_data = case when jsonb_typeof(submission.product_data->'variants') = 'array' then
        jsonb_set(submission.product_data, '{variants}', coalesce((
          select jsonb_agg(
            case when lower(btrim(coalesce(variant.value->>'supplierId', variant.value->>'supplier', old_name))) = old_key
              then jsonb_set(jsonb_set(variant.value, '{supplierId}', to_jsonb(new_name), true), '{supplier}', to_jsonb(new_name), true)
              else variant.value end order by variant.ordinality
          ) from jsonb_array_elements(submission.product_data->'variants') with ordinality as variant(value, ordinality)
        ), '[]'::jsonb), true)
      else submission.product_data end
  where lower(btrim(submission.supplier_name)) = old_key
    and exists (select 1 from public.warehouse_products product
      where product.id::text = nullif(btrim(submission.product_data->>'warehouseProductId'), ''));
  update public.marketplace_product_submissions submission set supplier_name = new_name
  where lower(btrim(submission.supplier_name)) = old_key
    and not exists (select 1 from public.warehouse_products product
      where product.id::text = nullif(btrim(submission.product_data->>'warehouseProductId'), ''));

  update public.marketplace_order_items lines
  set item = case when lower(btrim(coalesce(lines.item->>'supplierId', lines.item->>'supplier', ''))) = old_key
    then jsonb_set(jsonb_set(lines.item, '{supplierId}', to_jsonb(new_name), true), '{supplier}', to_jsonb(new_name), true)
    else lines.item end
  where lower(btrim(coalesce(lines.item->>'supplierId', lines.item->>'supplier', ''))) = old_key;
  update public.marketplace_item_returns set supplier_name = new_name, updated_at = now()
  where lower(btrim(supplier_name)) = old_key;
  if exists (
    select 1 from public.marketplace_orders order_row
    where coalesce(order_row.details->'supplierShipments', '{}'::jsonb) ? old_key
      and coalesce(order_row.details->'supplierShipments', '{}'::jsonb) ? new_key
  ) then raise exception 'Shipment records already use the new Store name. Resolve the duplicate before renaming.'; end if;
  update public.marketplace_orders order_row
  set details = jsonb_set(coalesce(order_row.details, '{}'::jsonb), '{supplierShipments}',
    (coalesce(order_row.details->'supplierShipments', '{}'::jsonb) - old_key)
      || case when coalesce(order_row.details->'supplierShipments', '{}'::jsonb) ? old_key
        then jsonb_build_object(new_key, order_row.details->'supplierShipments'->old_key) else '{}'::jsonb end, true)
  where coalesce(order_row.details->'supplierShipments', '{}'::jsonb) ? old_key;
  update public.marketplace_stores set store_name = new_name, store_key = new_key, updated_at = now()
  where id = store_id_value;
  update public.marketplace_supplier_access set supplier_name = new_name, updated_at = now()
  where lower(btrim(supplier_name)) = old_key;
  return jsonb_build_object('ok', true, 'supplier_name', new_name);
end;
$$;
revoke all on function public.rename_marketplace_store(text, text) from public, anon;
grant execute on function public.rename_marketplace_store(text, text) to authenticated;

create or replace function public.delete_marketplace_store(p_supplier_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  store_name text := btrim(coalesce(p_supplier_name, ''));
  store_key_value text;
  store_id_value uuid;
  members uuid[];
  product_ids text[];
  stock_total bigint;
  account_count integer;
  catalog jsonb;
  remaining_catalog jsonb;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then raise exception 'Only Directors can delete a Store.'; end if;
  if char_length(store_name) not between 1 and 100 then raise exception 'Choose a valid Store.'; end if;
  store_key_value := lower(store_name);
  select store.id into store_id_value from public.marketplace_stores store where store.store_key = store_key_value for update;
  if store_id_value is null then raise exception 'Store could not be found.'; end if;
  select coalesce(array_agg(account.user_id), array[]::uuid[]) into members
  from public.marketplace_store_account_history account where account.store_id = store_id_value;
  select count(*)::integer into account_count from public.marketplace_supplier_access access
  where lower(btrim(access.supplier_name)) = store_key_value;

  select coalesce(sum(lot.quantity), 0)::bigint into stock_total
  from public.warehouse_inventory_lots lot
  where lot.created_by = any(members)
     or lot.warehouse_product_id in (select product.id from public.warehouse_products product where product.created_by = any(members));
  if stock_total > 0 then
    raise exception 'This Store has % units in stock. Reduce all batches to zero before deleting the Store.', stock_total;
  end if;

  select coalesce(array_agg(product.marketplace_product_id), array[]::text[]) into product_ids
  from public.warehouse_products product
  where product.created_by = any(members) and nullif(trim(product.marketplace_product_id), '') is not null;
  select coalesce(payload, '[]'::jsonb) into catalog
  from public.app_data where record_id = 'shared:furgo-demo-marketplace-products:shared' for update;
  if catalog is not null then
    if jsonb_typeof(catalog) <> 'array' then raise exception 'Marketplace catalog data is not an array.'; end if;
    select coalesce(jsonb_agg(product.value order by product.ordinality), '[]'::jsonb) into remaining_catalog
    from jsonb_array_elements(catalog) with ordinality as product(value, ordinality)
    where not (coalesce(product.value->>'id', '') = any(product_ids))
      and not exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(product.value->'variants') = 'array' then product.value->'variants' else '[]'::jsonb end) as variant(value)
        where lower(btrim(coalesce(variant.value->>'supplierId', variant.value->>'supplier', ''))) = store_key_value
      );
    update public.app_data set payload = remaining_catalog, updated_at = now()
    where record_id = 'shared:furgo-demo-marketplace-products:shared';
  end if;
  delete from public.warehouse_inventory_lots lot
  where lot.created_by = any(members)
     or lot.warehouse_product_id in (select product.id from public.warehouse_products product where product.created_by = any(members));
  delete from public.warehouse_products product where product.created_by = any(members);
  delete from public.marketplace_supplier_access access where lower(btrim(access.supplier_name)) = store_key_value;
  delete from public.marketplace_store_account_history account where account.store_id = store_id_value;
  delete from public.marketplace_stores store where store.id = store_id_value;
  return jsonb_build_object('ok', true, 'store_name', store_name, 'accounts_removed', account_count, 'stock', stock_total);
end;
$$;
revoke all on function public.delete_marketplace_store(text) from public, anon;
grant execute on function public.delete_marketplace_store(text) to authenticated;
