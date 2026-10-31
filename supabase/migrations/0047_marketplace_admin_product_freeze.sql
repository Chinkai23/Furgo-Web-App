-- Keep Admin freeze state separate from supplier hide requests, synchronize the
-- shared catalog, and notify the supplier account whenever that state changes.
alter table public.portal_notifications
  drop constraint if exists portal_notifications_event_type_check;

alter table public.portal_notifications
  add constraint portal_notifications_event_type_check
  check (event_type in (
    'marketplace_product_request',
    'marketplace_order',
    'marketplace_product_status'
  ));

create or replace function public.set_marketplace_product_frozen(
  p_product_id text,
  p_is_frozen boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog_record_id text := 'shared:furgo-demo-marketplace-products:shared';
  catalog jsonb;
  product jsonb;
  product_name text;
  supplier_names text[];
  previous_state boolean;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 1 then
    raise exception 'Admin access is required to freeze Marketplace products.';
  end if;
  if coalesce(trim(p_product_id), '') = '' or p_is_frozen is null then
    raise exception 'Choose a product and a valid freeze status.';
  end if;

  select data.payload into catalog
  from public.app_data data
  where data.record_id = catalog_record_id
  for update;
  if not found or jsonb_typeof(catalog) is distinct from 'array' then
    raise exception 'The Marketplace catalog could not be loaded.';
  end if;

  select entry.value into product
  from jsonb_array_elements(catalog) as entry(value)
  where entry.value->>'id' = p_product_id
  limit 1;
  if product is null then
    raise exception 'That Marketplace product was not found.';
  end if;

  previous_state := coalesce((product->>'frozenByAdmin')::boolean, false);
  if previous_state = p_is_frozen then return catalog; end if;

  product_name := coalesce(nullif(trim(product->>'name'), ''), 'Marketplace product');
  select coalesce(array_agg(distinct lower(trim(coalesce(variant->>'supplierId', variant->>'supplier')))), array[]::text[])
  into supplier_names
  from jsonb_array_elements(coalesce(product->'variants', '[]'::jsonb)) as variants(variant)
  where coalesce(trim(coalesce(variant->>'supplierId', variant->>'supplier')), '') <> '';

  select coalesce(jsonb_agg(
    case when entry.value->>'id' = p_product_id
      then jsonb_set(entry.value, '{frozenByAdmin}', to_jsonb(p_is_frozen), true)
      else entry.value
    end order by entry.ordinality
  ), '[]'::jsonb)
  into catalog
  from jsonb_array_elements(catalog) with ordinality as entry(value, ordinality);

  update public.app_data
  set payload = catalog, updated_at = now()
  where record_id = catalog_record_id;

  insert into public.portal_notifications (recipient_user_id, event_type, title, message, entity_id)
  select access.supplier_user_id,
         'marketplace_product_status',
         case when p_is_frozen then 'Marketplace product frozen' else 'Marketplace product is live' end,
         product_name || case when p_is_frozen
           then ' was frozen by Furgo. It is no longer visible to customers.'
           else ' is live in the Furgo Marketplace again.'
         end,
         p_product_id || ':' || case when p_is_frozen then 'frozen:' else 'live:' end || gen_random_uuid()::text
  from public.marketplace_supplier_access access
  where lower(trim(access.supplier_name)) = any(supplier_names)
  on conflict (recipient_user_id, event_type, entity_id) do nothing;

  return catalog;
end;
$$;

revoke all on function public.set_marketplace_product_frozen(text, boolean) from public, anon;
grant execute on function public.set_marketplace_product_frozen(text, boolean) to authenticated;
