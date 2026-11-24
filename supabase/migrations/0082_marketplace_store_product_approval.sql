-- Directors choose whether new Store Marketplace products require review.
-- Approval is required by default to preserve the current publishing behavior.
create table if not exists public.marketplace_store_product_settings (
  setting_key text primary key check (setting_key = 'store_product_approval'),
  approval_required boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.marketplace_store_product_settings enable row level security;
revoke all on public.marketplace_store_product_settings from public, anon, authenticated;

insert into public.marketplace_store_product_settings (setting_key, approval_required)
values ('store_product_approval', true)
on conflict (setting_key) do nothing;

create or replace function public.get_marketplace_store_product_approval()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  required boolean;
begin
  if public.current_portal_level(auth.uid()) < 3 then
    raise exception 'Only Directors can view Store product publishing settings.';
  end if;
  select settings.approval_required into required
  from public.marketplace_store_product_settings settings
  where settings.setting_key = 'store_product_approval';
  return jsonb_build_object('approval_required', coalesce(required, true));
end;
$$;
revoke all on function public.get_marketplace_store_product_approval() from public, anon;
grant execute on function public.get_marketplace_store_product_approval() to authenticated;

create or replace function public.set_marketplace_store_product_approval(p_approval_required boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_portal_level(auth.uid()) < 3 then
    raise exception 'Only Directors can change Store product publishing settings.';
  end if;
  if p_approval_required is null then raise exception 'Choose whether Store products need approval.'; end if;

  insert into public.marketplace_store_product_settings (setting_key, approval_required, updated_by, updated_at)
  values ('store_product_approval', p_approval_required, auth.uid(), now())
  on conflict (setting_key) do update
    set approval_required = excluded.approval_required,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  return jsonb_build_object('approval_required', p_approval_required);
end;
$$;
revoke all on function public.set_marketplace_store_product_approval(boolean) from public, anon;
grant execute on function public.set_marketplace_store_product_approval(boolean) to authenticated;

-- New product requests either remain in the Director queue or are published
-- to the shared Marketplace catalog immediately, based on the saved setting.
create or replace function public.submit_marketplace_supplier_product(
  p_action text,
  p_product_id text,
  p_product_data jsonb
)
returns public.marketplace_product_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplier public.marketplace_supplier_access;
  submission public.marketplace_product_submissions;
  catalog jsonb;
  product jsonb;
  product_variant jsonb;
  approved_variants jsonb := '[]'::jsonb;
  approval_required boolean := true;
  catalog_record_id text := 'shared:furgo-demo-marketplace-products:shared';
begin
  select * into supplier
  from public.marketplace_supplier_access access
  where access.supplier_user_id = auth.uid();
  if not found then raise exception 'This account is not linked to a Store.'; end if;
  if p_action is distinct from 'add' then raise exception 'Use the product edit or listing management action for this change.'; end if;
  if jsonb_typeof(p_product_data) is distinct from 'object'
    or coalesce(trim(p_product_data->>'name'), '') = ''
    or jsonb_typeof(p_product_data->'variants') is distinct from 'array'
    or jsonb_array_length(p_product_data->'variants') = 0 then
    raise exception 'Product name and at least one variant are required.';
  end if;

  select settings.approval_required into approval_required
  from public.marketplace_store_product_settings settings
  where settings.setting_key = 'store_product_approval';
  approval_required := coalesce(approval_required, true);

  if not approval_required then
    select coalesce(data.payload, '[]'::jsonb) into catalog
    from public.app_data data
    where data.record_id = catalog_record_id
    for update;
    catalog := coalesce(catalog, '[]'::jsonb);
    if jsonb_typeof(catalog) is distinct from 'array' then raise exception 'Marketplace catalog data is not an array.'; end if;
  end if;

  insert into public.marketplace_product_submissions (supplier_user_id, supplier_name, action, product_id, product_data)
  values (auth.uid(), supplier.supplier_name, 'add', null, p_product_data)
  returning * into submission;

  if not approval_required then
    for product_variant in select value from jsonb_array_elements(p_product_data->'variants') loop
      if coalesce(product_variant->>'price', '') !~ '^[0-9]+([.][0-9]{1,2})?$'
        or coalesce(product_variant->>'stock', '') !~ '^[0-9]+$'
        or coalesce(trim(product_variant->>'label'), '') = '' then
        raise exception 'A product variant has invalid price, stock, or package details.';
      end if;
      product_variant := jsonb_set(product_variant, '{supplierId}', to_jsonb(supplier.supplier_name), true);
      product_variant := jsonb_set(product_variant, '{supplier}', to_jsonb(supplier.supplier_name), true);
      product_variant := jsonb_set(product_variant, '{cost}', '0'::jsonb, true);
      approved_variants := approved_variants || jsonb_build_array(product_variant);
    end loop;

    product := jsonb_set(p_product_data, '{id}', to_jsonb('supplier-' || submission.id::text), true);
    product := jsonb_set(product, '{hidden}', 'false'::jsonb, true);
    product := jsonb_set(product, '{variants}', approved_variants, true);
    if exists (select 1 from jsonb_array_elements(catalog) entry where entry->>'id' = product->>'id') then
      raise exception 'This product request has already been published.';
    end if;

    insert into public.app_data (record_id, scope, storage_key, owner_id, payload, updated_at)
    values (catalog_record_id, 'shared', 'furgo-demo-marketplace-products', null, catalog || jsonb_build_array(product), now())
    on conflict (record_id) do update set payload = excluded.payload, updated_at = now();

    update public.marketplace_product_submissions
    set status = 'Approved', reviewed_at = now()
    where id = submission.id
    returning * into submission;

    -- The insertion trigger creates a review notification. Since this setting
    -- publishes immediately, clear that not-needed review alert in this transaction.
    delete from public.portal_notifications
    where event_type = 'marketplace_product_request'
      and entity_id = submission.id::text;
  end if;

  return submission;
end;
$$;
revoke all on function public.submit_marketplace_supplier_product(text, text, jsonb) from public, anon;
grant execute on function public.submit_marketplace_supplier_product(text, text, jsonb) to authenticated;
