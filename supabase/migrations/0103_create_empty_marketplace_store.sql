create or replace function public.create_marketplace_store(p_supplier_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  store_name text := btrim(coalesce(p_supplier_name, ''));
  store_key_value text;
  store_id_value uuid;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Only Directors can create Stores.';
  end if;
  if char_length(store_name) not between 1 and 100 then
    raise exception 'Store name must be 1 to 100 characters.';
  end if;
  store_key_value := lower(store_name);
  if exists (select 1 from public.marketplace_stores where store_key = store_key_value) then
    raise exception 'A Store with this name already exists.';
  end if;
  insert into public.marketplace_stores(store_key, store_name)
  values (store_key_value, store_name)
  returning id into store_id_value;
  return jsonb_build_object('ok', true, 'store_id', store_id_value, 'store_name', store_name, 'account_count', 0);
end;
$$;
revoke all on function public.create_marketplace_store(text) from public, anon;
grant execute on function public.create_marketplace_store(text) to authenticated;
