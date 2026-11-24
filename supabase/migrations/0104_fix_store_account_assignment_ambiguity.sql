-- Avoid collision between the PL/pgSQL local name and marketplace_stores.store_name.
create or replace function public.assign_marketplace_store_accounts(p_emails text[], p_supplier_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
  target_user uuid;
  target_store_id uuid;
  assigned_count integer := 0;
  v_store_name text := btrim(coalesce(p_supplier_name, ''));
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Only Directors can assign Store accounts.';
  end if;
  if char_length(v_store_name) not between 1 and 100 then
    raise exception 'Store name must be 1 to 100 characters.';
  end if;
  if coalesce(array_length(p_emails, 1), 0) = 0 then
    raise exception 'Enter an account email.';
  end if;

  insert into public.marketplace_stores (store_key, store_name)
  values (lower(v_store_name), v_store_name)
  on conflict (store_key) do nothing;

  select store.id into target_store_id
  from public.marketplace_stores as store
  where store.store_key = lower(v_store_name)
  for update;

  foreach target_email in array p_emails loop
    target_email := lower(btrim(coalesce(target_email, '')));
    if target_email = '' then continue; end if;

    select profile.id into target_user
    from public.profiles as profile
    where lower(profile.email) = target_email
    limit 1;
    if target_user is null then
      raise exception 'No Furgo account uses %. Ask the user to register first.', target_email;
    end if;

    insert into public.marketplace_supplier_access (supplier_user_id, supplier_name, assigned_by, updated_at)
    values (target_user, v_store_name, auth.uid(), now())
    on conflict (supplier_user_id) do update
      set supplier_name = excluded.supplier_name,
          assigned_by = excluded.assigned_by,
          updated_at = now();

    insert into public.marketplace_store_account_history (user_id, store_id, assigned_at, removed_at, assigned_by)
    values (target_user, target_store_id, now(), null, auth.uid())
    on conflict (user_id) do update
      set store_id = excluded.store_id,
          assigned_at = excluded.assigned_at,
          removed_at = null,
          assigned_by = auth.uid();

    assigned_count := assigned_count + 1;
  end loop;

  if assigned_count = 0 then
    raise exception 'Enter one valid account email.';
  end if;
  return jsonb_build_object('ok', true, 'assigned_count', assigned_count, 'supplier_name', v_store_name);
end;
$$;

revoke all on function public.assign_marketplace_store_accounts(text[], text) from public, anon;
grant execute on function public.assign_marketplace_store_accounts(text[], text) to authenticated;
