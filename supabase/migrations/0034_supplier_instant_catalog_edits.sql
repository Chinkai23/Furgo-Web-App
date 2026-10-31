-- Suppliers can manage listing visibility directly. Product text updates are immediate;
-- price and variant edits stay in the Director review queue.
alter table public.marketplace_product_submissions
  drop constraint if exists marketplace_product_submissions_action_check;
alter table public.marketplace_product_submissions
  add constraint marketplace_product_submissions_action_check
  check (action in ('add', 'edit', 'edit_variant', 'hide', 'delete'));

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
begin
  select * into supplier from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid();
  if not found then raise exception 'This account is not linked to a supplier.'; end if;
  if p_action is distinct from 'add' then raise exception 'Use the product edit or listing management action for this change.'; end if;
  if jsonb_typeof(p_product_data) is distinct from 'object'
    or coalesce(trim(p_product_data->>'name'), '') = ''
    or jsonb_typeof(p_product_data->'variants') is distinct from 'array'
    or jsonb_array_length(p_product_data->'variants') = 0 then
    raise exception 'Product name and at least one variant are required.';
  end if;
  insert into public.marketplace_product_submissions (supplier_user_id, supplier_name, action, product_id, product_data)
  values (auth.uid(), supplier.supplier_name, 'add', null, p_product_data)
  returning * into submission;
  return submission;
end;
$$;
revoke all on function public.submit_marketplace_supplier_product(text, text, jsonb) from public, anon;
grant execute on function public.submit_marketplace_supplier_product(text, text, jsonb) to authenticated;

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
  variant_changed boolean := false;
  variant_pending boolean := false;
  variant_id text;
begin
  select * into supplier from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid();
  if not found then raise exception 'This account is not linked to a supplier.'; end if;
  if coalesce(trim(p_product_id), '') = '' or jsonb_typeof(p_product_data) is distinct from 'object' then raise exception 'Product details are required.'; end if;
  if coalesce(trim(p_product_data->>'name'), '') = '' or jsonb_typeof(p_product_data->'variants') is distinct from 'array' or jsonb_array_length(p_product_data->'variants') = 0 then
    raise exception 'Product name and variant details are required.';
  end if;

  select coalesce(data.payload, '[]'::jsonb) into catalog
  from public.app_data data where data.record_id = 'shared:furgo-demo-marketplace-products:shared' for update;
  if catalog is null then catalog := '[]'::jsonb; end if;
  select entry into current_product from jsonb_array_elements(catalog) entry where entry->>'id' = p_product_id limit 1;
  if current_product is null then raise exception 'The Marketplace product could not be found.'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) variant where lower(coalesce(variant->>'supplierId', variant->>'supplier', '')) = lower(supplier.supplier_name)) then
    raise exception 'That product is not assigned to your supplier account.';
  end if;

  new_variant := p_product_data->'variants'->0;
  variant_id := coalesce(new_variant->>'id', '');
  select value into old_variant from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) value where value->>'id' = variant_id limit 1;
  if old_variant is null or lower(coalesce(old_variant->>'supplierId', old_variant->>'supplier', '')) <> lower(supplier.supplier_name) then
    raise exception 'The selected product variant is unavailable for this supplier.';
  end if;
  if coalesce(new_variant->>'price', '') !~ '^[0-9]+([.][0-9]{1,2})?$'
    or coalesce(new_variant->>'stock', '') !~ '^[0-9]+$'
    or coalesce(trim(new_variant->>'label'), '') = '' then
    raise exception 'Variant price, stock, or package details are invalid.';
  end if;

  variant_changed := coalesce(old_variant->>'price', '') is distinct from coalesce(new_variant->>'price', '')
    or coalesce(old_variant->>'label', '') is distinct from coalesce(new_variant->>'label', '')
    or coalesce(old_variant->>'stock', '') is distinct from coalesce(new_variant->>'stock', '')
    or coalesce(old_variant->>'sku', '') is distinct from coalesce(new_variant->>'sku', '')
    or coalesce(old_variant->>'supplierSku', '') is distinct from coalesce(new_variant->>'supplierSku', '');
  if variant_changed then
    if exists (select 1 from public.marketplace_product_submissions pending where pending.supplier_user_id = auth.uid() and pending.product_id = p_product_id and pending.status = 'Pending Review') then
      raise exception 'A price or variant change for this product is already waiting for Director review.';
    end if;
    insert into public.marketplace_product_submissions (supplier_user_id, supplier_name, action, product_id, product_data)
    values (auth.uid(), supplier.supplier_name, 'edit_variant', p_product_id, jsonb_build_object('name', current_product->>'name', 'variants', jsonb_build_array(new_variant)));
    variant_pending := true;
  end if;

  current_variants := current_product->'variants';
  updated_product := p_product_data || jsonb_build_object(
    'id', p_product_id,
    'hidden', coalesce(current_product->'hidden', 'false'::jsonb),
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

create or replace function public.manage_marketplace_supplier_product(p_action text, p_product_id text)
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
begin
  select * into supplier from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid();
  if not found then raise exception 'This account is not linked to a supplier.'; end if;
  if p_action is null or p_action not in ('hide', 'show', 'delete') then raise exception 'Choose hide, show, or delete.'; end if;
  if coalesce(trim(p_product_id), '') = '' then raise exception 'Choose a product to manage.'; end if;

  select coalesce(data.payload, '[]'::jsonb) into catalog
  from public.app_data data where data.record_id = 'shared:furgo-demo-marketplace-products:shared' for update;
  if catalog is null then catalog := '[]'::jsonb; end if;
  select entry into current_product from jsonb_array_elements(catalog) entry where entry->>'id' = p_product_id limit 1;
  if current_product is null or not exists (
    select 1 from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) variant
    where lower(coalesce(variant->>'supplierId', variant->>'supplier', '')) = lower(supplier.supplier_name)
  ) then raise exception 'That product is not assigned to your supplier account.'; end if;

  if p_action = 'delete' then
    catalog := (select coalesce(jsonb_agg(entry order by ordinal), '[]'::jsonb)
      from jsonb_array_elements(catalog) with ordinality as rows(entry, ordinal) where entry->>'id' <> p_product_id);
  else
    updated_product := jsonb_set(current_product, '{hidden}', to_jsonb(p_action = 'hide'), true);
    catalog := (select coalesce(jsonb_agg(case when entry->>'id' = p_product_id then updated_product else entry end order by ordinal), '[]'::jsonb)
      from jsonb_array_elements(catalog) with ordinality as rows(entry, ordinal));
  end if;
  insert into public.app_data (record_id, scope, storage_key, owner_id, payload, updated_at)
  values ('shared:furgo-demo-marketplace-products:shared', 'shared', 'furgo-demo-marketplace-products', null, catalog, now())
  on conflict (record_id) do update set payload = excluded.payload, updated_at = now();
  return jsonb_build_object('action', p_action, 'product_id', p_product_id);
end;
$$;
revoke all on function public.manage_marketplace_supplier_product(text, text) from public, anon;
grant execute on function public.manage_marketplace_supplier_product(text, text) to authenticated;

-- Preserve any old pending requests while adding the new variant-only review action.
create or replace function public.review_marketplace_product_submission(p_submission_id uuid, p_decision text, p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission public.marketplace_product_submissions;
  catalog jsonb;
  product jsonb;
  existing_product jsonb;
  product_variant jsonb;
  old_variant jsonb;
  approved_variants jsonb := '[]'::jsonb;
  matched_variant boolean := false;
  catalog_record_id text := 'shared:furgo-demo-marketplace-products:shared';
begin
  if public.current_portal_level(auth.uid()) < 3 then raise exception 'Only Directors can review supplier product changes.'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Choose approve or reject.'; end if;
  if p_decision = 'reject' and coalesce(trim(p_reason), '') = '' then raise exception 'A rejection reason is required.'; end if;
  select * into submission from public.marketplace_product_submissions where id = p_submission_id for update;
  if not found then raise exception 'Product request was not found.'; end if;
  if submission.status <> 'Pending Review' then raise exception 'This product request has already been reviewed.'; end if;

  if p_decision = 'approve' then
    select coalesce(data.payload, '[]'::jsonb) into catalog from public.app_data data where data.record_id = catalog_record_id for update;
    if catalog is null then catalog := '[]'::jsonb; end if;
    if jsonb_typeof(catalog) is distinct from 'array' then raise exception 'Marketplace catalog data is not an array.'; end if;

    if submission.action = 'add' then
      product := submission.product_data;
      if coalesce(trim(product->>'name'), '') = '' or jsonb_typeof(product->'variants') is distinct from 'array' or jsonb_array_length(product->'variants') = 0 then raise exception 'The submitted product details are incomplete.'; end if;
      for product_variant in select value from jsonb_array_elements(product->'variants') loop
        if coalesce(product_variant->>'price', '') !~ '^[0-9]+([.][0-9]{1,2})?$' or coalesce(product_variant->>'stock', '') !~ '^[0-9]+$' or coalesce(trim(product_variant->>'label'), '') = '' then raise exception 'A product variant has invalid price, stock, or package details.'; end if;
        product_variant := jsonb_set(product_variant, '{supplierId}', to_jsonb(submission.supplier_name), true);
        product_variant := jsonb_set(product_variant, '{supplier}', to_jsonb(submission.supplier_name), true);
        product_variant := jsonb_set(product_variant, '{cost}', '0'::jsonb, true);
        approved_variants := approved_variants || jsonb_build_array(product_variant);
      end loop;
      product := jsonb_set(product, '{id}', to_jsonb('supplier-' || submission.id::text), true);
      product := jsonb_set(product, '{hidden}', 'false'::jsonb, true);
      product := jsonb_set(product, '{variants}', approved_variants, true);
      if exists (select 1 from jsonb_array_elements(catalog) entry where entry->>'id' = product->>'id') then raise exception 'This product request has already been published.'; end if;
      catalog := catalog || jsonb_build_array(product);
    else
      select entry into existing_product from jsonb_array_elements(catalog) entry where entry->>'id' = submission.product_id limit 1;
      if existing_product is null then raise exception 'The Marketplace product was removed before this request was reviewed.'; end if;
      if not exists (select 1 from jsonb_array_elements(coalesce(existing_product->'variants', '[]'::jsonb)) variant where lower(coalesce(variant->>'supplierId', variant->>'supplier', '')) = lower(submission.supplier_name)) then raise exception 'This supplier no longer owns the product.'; end if;

      if submission.action in ('edit', 'edit_variant') then
        if submission.action = 'edit_variant' then
          product_variant := submission.product_data->'variants'->0;
          for old_variant in select value from jsonb_array_elements(coalesce(existing_product->'variants', '[]'::jsonb)) loop
            if old_variant->>'id' = coalesce(product_variant->>'id', '') then
              if lower(coalesce(old_variant->>'supplierId', old_variant->>'supplier', '')) <> lower(submission.supplier_name) then raise exception 'This supplier no longer owns the product variant.'; end if;
              product_variant := jsonb_set(product_variant, '{supplierId}', to_jsonb(submission.supplier_name), true);
              product_variant := jsonb_set(product_variant, '{supplier}', to_jsonb(submission.supplier_name), true);
              product_variant := jsonb_set(product_variant, '{cost}', coalesce(old_variant->'cost', '0'::jsonb), true);
              approved_variants := approved_variants || jsonb_build_array(product_variant);
              matched_variant := true;
            else
              approved_variants := approved_variants || jsonb_build_array(old_variant);
            end if;
          end loop;
          if not matched_variant then raise exception 'The selected product variant no longer exists.'; end if;
          product := jsonb_set(existing_product, '{variants}', approved_variants, true);
        else
          product := submission.product_data;
          if coalesce(trim(product->>'name'), '') = '' or jsonb_typeof(product->'variants') is distinct from 'array' or jsonb_array_length(product->'variants') = 0 then raise exception 'The edited product details are incomplete.'; end if;
          for old_variant in select value from jsonb_array_elements(coalesce(existing_product->'variants', '[]'::jsonb)) loop
            product_variant := old_variant;
            if old_variant->>'id' = coalesce(submission.product_data->'variants'->0->>'id', '') then
              select value into product_variant from jsonb_array_elements(submission.product_data->'variants') value limit 1;
              product_variant := jsonb_set(product_variant, '{id}', coalesce(old_variant->'id', to_jsonb('variant-' || submission.product_id)), true);
              product_variant := jsonb_set(product_variant, '{sku}', coalesce(old_variant->'sku', product_variant->'sku', 'null'::jsonb), true);
              product_variant := jsonb_set(product_variant, '{supplierId}', to_jsonb(submission.supplier_name), true);
              product_variant := jsonb_set(product_variant, '{supplier}', to_jsonb(submission.supplier_name), true);
              product_variant := jsonb_set(product_variant, '{cost}', coalesce(old_variant->'cost', '0'::jsonb), true);
              matched_variant := true;
            end if;
            approved_variants := approved_variants || jsonb_build_array(product_variant);
          end loop;
          if not matched_variant then raise exception 'The selected product variant no longer exists.'; end if;
          product := product || jsonb_build_object('id', submission.product_id, 'hidden', coalesce(existing_product->'hidden', 'false'::jsonb), 'variants', approved_variants);
        end if;
        catalog := (select coalesce(jsonb_agg(case when entry->>'id' = submission.product_id then product else entry end order by ordinal), '[]'::jsonb) from jsonb_array_elements(catalog) with ordinality as rows(entry, ordinal));
      elsif submission.action = 'hide' then
        product := jsonb_set(existing_product, '{hidden}', 'true'::jsonb, true);
        catalog := (select coalesce(jsonb_agg(case when entry->>'id' = submission.product_id then product else entry end order by ordinal), '[]'::jsonb) from jsonb_array_elements(catalog) with ordinality as rows(entry, ordinal));
      elsif submission.action = 'delete' then
        catalog := (select coalesce(jsonb_agg(entry order by ordinal), '[]'::jsonb) from jsonb_array_elements(catalog) with ordinality as rows(entry, ordinal) where entry->>'id' <> submission.product_id);
      end if;
    end if;
    insert into public.app_data (record_id, scope, storage_key, owner_id, payload, updated_at)
    values (catalog_record_id, 'shared', 'furgo-demo-marketplace-products', null, catalog, now())
    on conflict (record_id) do update set payload = excluded.payload, updated_at = now();
    update public.marketplace_product_submissions set status = 'Approved', rejection_reason = '', reviewed_by = auth.uid(), reviewed_at = now() where id = p_submission_id;
  else
    update public.marketplace_product_submissions set status = 'Rejected', rejection_reason = left(trim(p_reason), 1000), reviewed_by = auth.uid(), reviewed_at = now() where id = p_submission_id;
  end if;
  select to_jsonb(entry) into catalog from public.marketplace_product_submissions entry where entry.id = p_submission_id;
  return catalog;
end;
$$;
revoke all on function public.review_marketplace_product_submission(uuid, text, text) from public, anon;
grant execute on function public.review_marketplace_product_submission(uuid, text, text) to authenticated;
