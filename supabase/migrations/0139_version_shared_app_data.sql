begin;

-- These are global configuration documents. Catalog, order, credit, and
-- service operation rows retain their existing write paths and policies.
create function public.is_versioned_shared_app_data_key(p_key text)
returns boolean language sql immutable strict set search_path = ''
as $$
  select p_key in (
    'furgo-demo-hotel-settings', 'furgo-demo-daycare-settings',
    'furgo-demo-pet-taxi-settings', 'furgo-demo-service-banners',
    'furgo-demo-marketplace-offers', 'furgo-demo-promotions',
    'furgo-demo-help-center-details', 'furgo-demo-home-service-shortcuts'
  );
$$;
revoke all on function public.is_versioned_shared_app_data_key(text) from public, anon;
grant execute on function public.is_versioned_shared_app_data_key(text) to authenticated;

alter table public.app_data add column sync_version uuid;

update public.app_data
set sync_version = gen_random_uuid()
where scope = 'shared' and owner_id is null
  and record_id = 'shared:' || storage_key || ':shared'
  and public.is_versioned_shared_app_data_key(storage_key);

-- Issue a fresh opaque version even for privileged maintenance writes.
create function public.stamp_shared_app_data_version()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.scope = 'shared' and new.owner_id is null
     and new.record_id = 'shared:' || new.storage_key || ':shared'
     and public.is_versioned_shared_app_data_key(new.storage_key) then
    new.sync_version := gen_random_uuid();
  else
    new.sync_version := null;
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_shared_app_data_version() from public, anon, authenticated;
create trigger stamp_shared_app_data_version
before insert or update on public.app_data
for each row execute function public.stamp_shared_app_data_version();

-- Check both identities on INSERT and both sides of UPDATE. An old client
-- cannot rename a row or supply a different scope to avoid the write guard.
create policy "Versioned app data insert uses the settings RPC" on public.app_data
as restrictive for insert to authenticated
with check (
  not public.is_versioned_shared_app_data_key(storage_key)
  and not public.is_versioned_shared_app_data_key(split_part(record_id, ':', 2))
);
create policy "Versioned app data update uses the settings RPC" on public.app_data
as restrictive for update to authenticated
using (
  not public.is_versioned_shared_app_data_key(storage_key)
  and not public.is_versioned_shared_app_data_key(split_part(record_id, ':', 2))
)
with check (
  not public.is_versioned_shared_app_data_key(storage_key)
  and not public.is_versioned_shared_app_data_key(split_part(record_id, ':', 2))
);
create policy "Versioned app data cannot be removed by clients" on public.app_data
as restrictive for delete to authenticated
using (
  not public.is_versioned_shared_app_data_key(storage_key)
  and not public.is_versioned_shared_app_data_key(split_part(record_id, ':', 2))
);

create function public.save_versioned_shared_app_data(
  p_actor uuid, p_key text, p_expected_version uuid, p_payload jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target_id text := 'shared:' || p_key || ':shared';
  saved_version uuid;
begin
  -- 0026 restricts Staff from writing global snapshots. These keys have no
  -- outlet/store column, so only a Director with the existing admin grant
  -- can replace a global document. Never take a role from the browser.
  if actor is null or actor is distinct from p_actor
     or public.current_portal_level(actor) <> 3
     or not public.has_role(actor, 'admin') then
    raise exception 'Director access is required to save global settings.' using errcode = '42501';
  end if;
  if not coalesce(public.is_versioned_shared_app_data_key(p_key), false) then
    raise exception 'This key is not a versioned shared setting.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload) is distinct from
     (case when p_key in ('furgo-demo-promotions', 'furgo-demo-home-service-shortcuts')
          then 'array' else 'object' end) then
    raise exception 'Invalid shared settings payload.' using errcode = '22023';
  end if;

  if p_expected_version is null then
    insert into public.app_data(record_id, scope, storage_key, owner_id, payload)
    values (target_id, 'shared', p_key, null, p_payload)
    on conflict (record_id) do nothing
    returning sync_version into saved_version;
  else
    update public.app_data set payload = p_payload, updated_at = now()
    where record_id = target_id and scope = 'shared' and storage_key = p_key
      and owner_id is null and sync_version = p_expected_version
    returning sync_version into saved_version;
  end if;
  if saved_version is null then
    raise exception 'These settings changed. Reload to review the latest version.' using errcode = 'PT409';
  end if;
  return saved_version;
end;
$$;
revoke all on function public.save_versioned_shared_app_data(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.save_versioned_shared_app_data(uuid, text, uuid, jsonb) to authenticated;

commit;
