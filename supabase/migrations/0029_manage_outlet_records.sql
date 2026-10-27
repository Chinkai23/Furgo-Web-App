-- Allow Directors to edit and remove outlets from Manage Outlets.
-- Removed outlets are archived so historical order records retain their outlet text.

create or replace function public.update_admin_outlet(p_id uuid, p_name text, p_shortform text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_outlet public.admin_outlets%rowtype;
  previous_name text;
begin
  if public.current_portal_level(auth.uid()) < 3 then
    raise exception 'Only Directors can edit outlets.';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 100 then
    raise exception 'Enter an outlet name between 2 and 100 characters.';
  end if;
  if upper(trim(coalesce(p_shortform, ''))) !~ '^[A-Z0-9]{2,8}$' then
    raise exception 'Use a shortform with 2 to 8 letters or numbers.';
  end if;

  select name into previous_name from public.admin_outlets where id = p_id and active for update;
  if previous_name is null then
    raise exception 'This outlet no longer exists.';
  end if;

  update public.admin_outlets
  set name = trim(p_name), shortform = upper(trim(p_shortform))
  where id = p_id and active
  returning * into updated_outlet;

  if not found then
    raise exception 'This outlet no longer exists.';
  end if;

  update public.grooming_bookings
  set outlet = updated_outlet.name,
      details = jsonb_set(coalesce(details, '{}'::jsonb), '{outlet}', to_jsonb(updated_outlet.name), true),
      updated_at = now()
  where lower(trim(outlet)) = lower(trim(previous_name));

  update public.pet_hotel_bookings
  set outlet = updated_outlet.name,
      details = jsonb_set(coalesce(details, '{}'::jsonb), '{outlet}', to_jsonb(updated_outlet.name), true),
      updated_at = now()
  where lower(trim(outlet)) = lower(trim(previous_name));

  update public.pet_daycare_bookings
  set outlet = updated_outlet.name,
      details = jsonb_set(coalesce(details, '{}'::jsonb), '{outlet}', to_jsonb(updated_outlet.name), true),
      updated_at = now()
  where lower(trim(outlet)) = lower(trim(previous_name));

  update public.marketplace_orders
  set outlet = updated_outlet.name,
      details = jsonb_set(
        case when lower(trim(coalesce(details->>'fulfillmentOutlet', ''))) = lower(trim(previous_name))
          then jsonb_set(coalesce(details, '{}'::jsonb), '{fulfillmentOutlet}', to_jsonb(updated_outlet.name), true)
          else coalesce(details, '{}'::jsonb)
        end,
        '{outlet}', to_jsonb(updated_outlet.name),
        true
      ),
      updated_at = now()
  where lower(trim(outlet)) = lower(trim(previous_name));

  return jsonb_build_object('id', updated_outlet.id, 'name', updated_outlet.name, 'shortform', updated_outlet.shortform);
exception
  when unique_violation then
    raise exception 'Another outlet already uses that name or shortform.';
end;
$$;

revoke all on function public.update_admin_outlet(uuid, text, text) from public, anon;
grant execute on function public.update_admin_outlet(uuid, text, text) to authenticated;

create or replace function public.delete_admin_outlet(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  unassigned_count integer;
  deleted_name text;
begin
  if public.current_portal_level(auth.uid()) < 3 then
    raise exception 'Only Directors can delete outlets.';
  end if;

  select name into deleted_name
  from public.admin_outlets
  where id = p_id and active
  for update;
  if deleted_name is null then
    raise exception 'This outlet no longer exists.';
  end if;
  if (select count(*) from public.admin_outlets where active) <= 1 then
    raise exception 'Keep at least one active outlet. Add another outlet before deleting this one.';
  end if;

  update public.portal_access
  set outlet_id = null
  where outlet_id = p_id;
  get diagnostics unassigned_count = row_count;

  update public.admin_outlets
  set active = false
  where id = p_id;

  return jsonb_build_object('name', deleted_name, 'unassigned_admins', unassigned_count);
end;
$$;

revoke all on function public.delete_admin_outlet(uuid) from public, anon;
grant execute on function public.delete_admin_outlet(uuid) to authenticated;
