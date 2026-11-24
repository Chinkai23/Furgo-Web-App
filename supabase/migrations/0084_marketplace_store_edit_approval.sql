-- Use the Store product approval setting for edits as well as new listings.
-- With approval disabled, price/package/stock changes go live in the same transaction.
create or replace function public.edit_marketplace_supplier_product(p_product_id text, p_product_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplier public.marketplace_supplier_access;
  catalog jsonb;
  current_product jsonb;
  updated_product jsonb;
  current_variants jsonb;
  old_variant jsonb;
  new_variant jsonb;
  updated_variant jsonb;
  variant_changed boolean := false;
  stock_changed boolean := false;
  variant_pending boolean := false;
  approval_required boolean := true;
  variant_id text;
  review_variant jsonb;
begin
  select * into supplier from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid();
  if not found then raise exception 'This account is not linked to a Store.'; end if;
  if coalesce(trim(p_product_id), '') = '' or jsonb_typeof(p_product_data) is distinct from 'object' then raise exception 'Product details are required.'; end if;
  if coalesce(trim(p_product_data->>'name'), '') = '' or jsonb_typeof(p_product_data->'variants') is distinct from 'array' or jsonb_array_length(p_product_data->'variants') = 0 then
    raise exception 'Product name and variant details are required.';
  end if;

  select settings.approval_required into approval_required
  from public.marketplace_store_product_settings settings
  where settings.setting_key = 'store_product_approval';
  approval_required := coalesce(approval_required, true);

  select coalesce(data.payload, '[]'::jsonb) into catalog
  from public.app_data data where data.record_id = 'shared:furgo-demo-marketplace-products:shared' for update;
  if catalog is null then catalog := '[]'::jsonb; end if;
  select entry into current_product from jsonb_array_elements(catalog) entry where entry->>'id' = p_product_id limit 1;
  if current_product is null then raise exception 'The Marketplace product could not be found.'; end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) variant
    where lower(coalesce(variant->>'supplierId', variant->>'supplier', '')) = lower(supplier.supplier_name)
  ) then raise exception 'That product is not assigned to your store account.'; end if;

  new_variant := p_product_data->'variants'->0;
  variant_id := coalesce(new_variant->>'id', '');
  select value into old_variant from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) value where value->>'id' = variant_id limit 1;
  if old_variant is null or lower(coalesce(old_variant->>'supplierId', old_variant->>'supplier', '')) <> lower(supplier.supplier_name) then
    raise exception 'The selected product variant is unavailable for this store.';
  end if;
  if coalesce(new_variant->>'price', '') !~ '^[0-9]+([.][0-9]{1,2})?$'
    or coalesce(new_variant->>'stock', '') !~ '^[0-9]+$'
    or coalesce(trim(new_variant->>'label'), '') = '' then
    raise exception 'Variant price, stock, or package details are invalid.';
  end if;

  variant_changed := coalesce(old_variant->>'price', '') is distinct from coalesce(new_variant->>'price', '')
    or coalesce(old_variant->>'label', '') is distinct from coalesce(new_variant->>'label', '')
    or coalesce(old_variant->>'sku', '') is distinct from coalesce(new_variant->>'sku', '')
    or coalesce(old_variant->>'supplierSku', '') is distinct from coalesce(new_variant->>'supplierSku', '');
  stock_changed := coalesce(old_variant->>'stock', '') is distinct from coalesce(new_variant->>'stock', '');

  if variant_changed and approval_required then
    if exists (
      select 1 from public.marketplace_product_submissions pending
      where pending.supplier_user_id = auth.uid() and pending.product_id = p_product_id and pending.status = 'Pending Review'
    ) then raise exception 'A price or variant change for this product is already waiting for Director review.'; end if;
    review_variant := new_variant - 'stock';
    insert into public.marketplace_product_submissions (supplier_user_id, supplier_name, action, product_id, product_data)
    values (auth.uid(), supplier.supplier_name, 'edit_variant', p_product_id, jsonb_build_object('name', current_product->>'name', 'variants', jsonb_build_array(review_variant)));
    variant_pending := true;
    if stock_changed then
      updated_variant := jsonb_set(old_variant, '{stock}', new_variant->'stock', true);
      current_variants := (
        select coalesce(jsonb_agg(case when value->>'id' = variant_id then updated_variant else value end order by ordinal), '[]'::jsonb)
        from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) with ordinality as rows(value, ordinal)
      );
    end if;
  elsif variant_changed then
    -- A direct edit supersedes any older pending variant request for this product.
    delete from public.portal_notifications notification
    where notification.event_type = 'marketplace_product_request'
      and notification.entity_id in (
        select pending.id::text from public.marketplace_product_submissions pending
        where pending.supplier_user_id = auth.uid() and pending.product_id = p_product_id
          and pending.action in ('edit', 'edit_variant') and pending.status = 'Pending Review'
      );
    delete from public.marketplace_product_submissions pending
    where pending.supplier_user_id = auth.uid() and pending.product_id = p_product_id
      and pending.action in ('edit', 'edit_variant') and pending.status = 'Pending Review';

    updated_variant := old_variant || new_variant;
    updated_variant := jsonb_set(updated_variant, '{id}', coalesce(old_variant->'id', to_jsonb(variant_id)), true);
    updated_variant := jsonb_set(updated_variant, '{supplierId}', to_jsonb(supplier.supplier_name), true);
    updated_variant := jsonb_set(updated_variant, '{supplier}', to_jsonb(supplier.supplier_name), true);
    updated_variant := jsonb_set(updated_variant, '{cost}', coalesce(old_variant->'cost', '0'::jsonb), true);
    updated_variant := jsonb_set(updated_variant, '{frozen}', coalesce(old_variant->'frozen', 'false'::jsonb), true);
    updated_variant := jsonb_set(updated_variant, '{sku}', coalesce(new_variant->'sku', old_variant->'sku', 'null'::jsonb), true);
    updated_variant := jsonb_set(updated_variant, '{supplierSku}', coalesce(new_variant->'supplierSku', old_variant->'supplierSku', 'null'::jsonb), true);
    current_variants := (
      select coalesce(jsonb_agg(case when value->>'id' = variant_id then updated_variant else value end order by ordinal), '[]'::jsonb)
      from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) with ordinality as rows(value, ordinal)
    );
  elsif stock_changed then
    updated_variant := jsonb_set(old_variant, '{stock}', new_variant->'stock', true);
    current_variants := (
      select coalesce(jsonb_agg(case when value->>'id' = variant_id then updated_variant else value end order by ordinal), '[]'::jsonb)
      from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) with ordinality as rows(value, ordinal)
    );
  end if;

  if current_variants is null then current_variants := current_product->'variants'; end if;
  updated_product := p_product_data || jsonb_build_object(
    'id', p_product_id,
    'hidden', coalesce(current_product->'hidden', 'false'::jsonb),
    'frozenByAdmin', coalesce(current_product->'frozenByAdmin', 'false'::jsonb),
    'variants', current_variants
  );
  catalog := (select coalesce(jsonb_agg(case when entry->>'id' = p_product_id then updated_product else entry end order by ordinal), '[]'::jsonb)
    from jsonb_array_elements(catalog) with ordinality as rows(entry, ordinal));
  insert into public.app_data (record_id, scope, storage_key, owner_id, payload, updated_at)
  values ('shared:furgo-demo-marketplace-products:shared', 'shared', 'furgo-demo-marketplace-products', null, catalog, now())
  on conflict (record_id) do update set payload = excluded.payload, updated_at = now();
  return jsonb_build_object('variant_change_pending', variant_pending, 'product_id', p_product_id);
end;
$$;
revoke all on function public.edit_marketplace_supplier_product(text, jsonb) from public, anon;
grant execute on function public.edit_marketplace_supplier_product(text, jsonb) to authenticated;

-- If approval is disabled while a new listing is still pending, saving that
-- request publishes the edited listing directly instead of leaving it queued.
create or replace function public.update_marketplace_pending_product_request(
  p_submission_id uuid,
  p_product_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplier public.marketplace_supplier_access;
  submission public.marketplace_product_submissions;
  approval_required boolean := true;
  catalog jsonb;
  product jsonb;
  product_variant jsonb;
  approved_variants jsonb := '[]'::jsonb;
  published_product_id text;
  catalog_record_id text := 'shared:furgo-demo-marketplace-products:shared';
begin
  select * into supplier from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid();
  if not found then raise exception 'This account is not linked to a Store.'; end if;

  select * into submission from public.marketplace_product_submissions request where request.id = p_submission_id for update;
  if not found or submission.supplier_user_id <> auth.uid() then raise exception 'This product request does not belong to your account.'; end if;
  if submission.action <> 'add' or submission.status not in ('Pending Review', 'Rejected') then raise exception 'Only a pending or rejected new-product request can be edited.'; end if;
  if jsonb_typeof(p_product_data) is distinct from 'object'
    or coalesce(trim(p_product_data->>'name'), '') = ''
    or jsonb_typeof(p_product_data->'variants') is distinct from 'array'
    or jsonb_array_length(p_product_data->'variants') = 0 then
    raise exception 'Product name and at least one variant are required.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_product_data->'variants') variant
    where lower(trim(coalesce(variant->>'supplierId', variant->>'supplier', ''))) <> lower(trim(supplier.supplier_name))
  ) then raise exception 'The product must remain assigned to your Store account.'; end if;

  select settings.approval_required into approval_required
  from public.marketplace_store_product_settings settings where settings.setting_key = 'store_product_approval';
  approval_required := coalesce(approval_required, true);

  if approval_required then
    update public.marketplace_product_submissions
    set product_data = p_product_data,
        supplier_name = supplier.supplier_name,
        status = 'Pending Review',
        rejection_reason = '',
        reviewed_by = null,
        reviewed_at = null,
        submitted_at = now()
    where id = p_submission_id returning * into submission;
    update public.portal_notifications
    set title = 'Store product request',
        message = supplier.supplier_name || ' resubmitted a product for review: ' || coalesce(nullif(trim(p_product_data->>'name'), ''), 'Marketplace product'),
        read_at = null
    where event_type = 'marketplace_product_request' and entity_id = p_submission_id::text;
    return to_jsonb(submission);
  end if;

  select coalesce(data.payload, '[]'::jsonb) into catalog
  from public.app_data data where data.record_id = catalog_record_id for update;
  catalog := coalesce(catalog, '[]'::jsonb);
  if jsonb_typeof(catalog) is distinct from 'array' then raise exception 'Marketplace catalog data is not an array.'; end if;
  published_product_id := 'supplier-' || submission.id::text;
  if exists (select 1 from jsonb_array_elements(catalog) entry where entry->>'id' = published_product_id) then
    raise exception 'This product request has already been published.';
  end if;

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
  product := jsonb_set(p_product_data, '{id}', to_jsonb(published_product_id), true);
  product := jsonb_set(product, '{hidden}', 'false'::jsonb, true);
  product := jsonb_set(product, '{variants}', approved_variants, true);
  catalog := catalog || jsonb_build_array(product);

  insert into public.app_data (record_id, scope, storage_key, owner_id, payload, updated_at)
  values (catalog_record_id, 'shared', 'furgo-demo-marketplace-products', null, catalog, now())
  on conflict (record_id) do update set payload = excluded.payload, updated_at = now();
  update public.marketplace_product_submissions request
  set product_id = published_product_id, product_data = product, supplier_name = supplier.supplier_name,
      status = 'Approved', rejection_reason = '', reviewed_by = null, reviewed_at = now()
  where request.id = p_submission_id returning request.* into submission;
  delete from public.portal_notifications where event_type = 'marketplace_product_request' and entity_id = p_submission_id::text;
  return to_jsonb(submission);
end;
$$;
revoke all on function public.update_marketplace_pending_product_request(uuid, jsonb) from public, anon;
grant execute on function public.update_marketplace_pending_product_request(uuid, jsonb) to authenticated;
