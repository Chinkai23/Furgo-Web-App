-- Support multiple customer-selectable options per Marketplace product.
-- Stock remains editable live; option/price/label changes follow the existing
-- Store product approval setting.

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
  proposed_variant jsonb;
  old_variant jsonb;
  updated_variant jsonb;
  submitted_variants jsonb;
  variant_id text;
  variant_changed boolean := false;
  stock_changed boolean := false;
  variant_pending boolean := false;
  approval_required boolean := true;
  variant_count integer := 0;
begin
  select * into supplier from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid();
  if not found then raise exception 'This account is not linked to a Store.'; end if;
  if coalesce(trim(p_product_id), '') = '' or jsonb_typeof(p_product_data) is distinct from 'object' then raise exception 'Product details are required.'; end if;
  if coalesce(trim(p_product_data->>'name'), '') = '' or jsonb_typeof(p_product_data->'variants') is distinct from 'array' then
    raise exception 'Product name and option details are required.';
  end if;
  variant_count := jsonb_array_length(p_product_data->'variants');
  if variant_count < 1 or variant_count > 30 then raise exception 'A product must have between 1 and 30 options.'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_product_data->'variants') proposed
    where coalesce(trim(proposed->>'label'), '') = ''
      or coalesce(proposed->>'price', '') !~ '^[0-9]+([.][0-9]{1,2})?$'
      or coalesce(proposed->>'stock', '') !~ '^[0-9]+$'
  ) then raise exception 'Each option needs a name, valid price, and whole-number stock.'; end if;
  if exists (
    select lower(trim(value->>'label')) from jsonb_array_elements(p_product_data->'variants') value
    group by lower(trim(value->>'label')) having count(*) > 1
  ) then raise exception 'Each product option needs a different name.'; end if;

  select settings.approval_required into approval_required
  from public.marketplace_store_product_settings settings where settings.setting_key = 'store_product_approval';
  approval_required := coalesce(approval_required, true);

  select coalesce(data.payload, '[]'::jsonb) into catalog
  from public.app_data data where data.record_id = 'shared:furgo-demo-marketplace-products:shared' for update;
  catalog := coalesce(catalog, '[]'::jsonb);
  if jsonb_typeof(catalog) is distinct from 'array' then raise exception 'Marketplace catalog data is not an array.'; end if;
  select entry into current_product from jsonb_array_elements(catalog) entry where entry->>'id' = p_product_id limit 1;
  if current_product is null then raise exception 'The Marketplace product could not be found.'; end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) variant
    where lower(coalesce(variant->>'supplierId', variant->>'supplier', '')) = lower(supplier.supplier_name)
  ) then raise exception 'That product is not assigned to your store account.'; end if;

  -- Detect catalog changes separately from stock changes.
  for proposed_variant in select value from jsonb_array_elements(p_product_data->'variants') loop
    variant_id := coalesce(proposed_variant->>'id', '');
    old_variant := null;
    select value into old_variant from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) value where value->>'id' = variant_id limit 1;
    if old_variant is null then
      if variant_id <> '' and exists (
        select 1 from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) value where value->>'id' = variant_id
      ) then raise exception 'That option belongs to another Store.'; end if;
      variant_changed := true;
    else
      if lower(coalesce(old_variant->>'supplierId', old_variant->>'supplier', '')) <> lower(supplier.supplier_name) then raise exception 'That option belongs to another Store.'; end if;
      if coalesce(old_variant->>'label', '') is distinct from coalesce(proposed_variant->>'label', '')
        or coalesce(old_variant->>'price', '') is distinct from coalesce(proposed_variant->>'price', '')
        or coalesce(old_variant->>'sku', '') is distinct from coalesce(proposed_variant->>'sku', '')
        or coalesce(old_variant->>'supplierSku', '') is distinct from coalesce(proposed_variant->>'supplierSku', '') then
        variant_changed := true;
      end if;
      if coalesce(old_variant->>'stock', '') is distinct from coalesce(proposed_variant->>'stock', '') then stock_changed := true; end if;
    end if;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) existing
    where lower(coalesce(existing->>'supplierId', existing->>'supplier', '')) = lower(supplier.supplier_name)
      and not exists (select 1 from jsonb_array_elements(p_product_data->'variants') proposed where proposed->>'id' = existing->>'id')
  ) then variant_changed := true; end if;

  current_variants := coalesce(current_product->'variants', '[]'::jsonb);
  if variant_changed and approval_required then
    if exists (
      select 1 from public.marketplace_product_submissions pending
      where pending.supplier_user_id = auth.uid() and pending.product_id = p_product_id and pending.status = 'Pending Review'
    ) then raise exception 'A product option change is already waiting for Director review.'; end if;

    submitted_variants := p_product_data->'variants';
    insert into public.marketplace_product_submissions (supplier_user_id, supplier_name, action, product_id, product_data)
    values (auth.uid(), supplier.supplier_name, 'edit_variant', p_product_id,
      jsonb_build_object('name', p_product_data->>'name', 'variants', submitted_variants));
    variant_pending := true;

    -- Apply stock-only edits immediately for already published options.
    if stock_changed then
      select coalesce(jsonb_agg(
        case when exists (
          select 1 from jsonb_array_elements(p_product_data->'variants') proposed
          where proposed->>'id' = existing.value->>'id'
            and lower(coalesce(existing.value->>'supplierId', existing.value->>'supplier', '')) = lower(supplier.supplier_name)
        ) then jsonb_set(existing.value, '{stock}', (
          select proposed->'stock' from jsonb_array_elements(p_product_data->'variants') proposed where proposed->>'id' = existing.value->>'id' limit 1
        ), true) else existing.value end order by existing.ordinality), '[]'::jsonb)
      into current_variants
      from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) with ordinality existing(value, ordinality);
    end if;
  else
    -- Replace this Store's option list, preserving non-Store options and
    -- keeping existing cost/frozen values for options already in the catalog.
    select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb) into current_variants
    from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) with ordinality rows(value, ordinality)
    where lower(coalesce(value->>'supplierId', value->>'supplier', '')) <> lower(supplier.supplier_name);
    for proposed_variant in select value from jsonb_array_elements(p_product_data->'variants') loop
      variant_id := coalesce(proposed_variant->>'id', '');
      old_variant := null;
      select value into old_variant from jsonb_array_elements(coalesce(current_product->'variants', '[]'::jsonb)) value where value->>'id' = variant_id limit 1;
      if old_variant is not null and lower(coalesce(old_variant->>'supplierId', old_variant->>'supplier', '')) <> lower(supplier.supplier_name) then raise exception 'That option belongs to another Store.'; end if;
      if old_variant is null then
        updated_variant := proposed_variant;
        updated_variant := jsonb_set(updated_variant, '{supplierId}', to_jsonb(supplier.supplier_name), true);
        updated_variant := jsonb_set(updated_variant, '{supplier}', to_jsonb(supplier.supplier_name), true);
        updated_variant := jsonb_set(updated_variant, '{cost}', '0'::jsonb, true);
        updated_variant := jsonb_set(updated_variant, '{frozen}', 'false'::jsonb, true);
      else
        updated_variant := old_variant || proposed_variant;
        updated_variant := jsonb_set(updated_variant, '{id}', old_variant->'id', true);
        updated_variant := jsonb_set(updated_variant, '{supplierId}', to_jsonb(supplier.supplier_name), true);
        updated_variant := jsonb_set(updated_variant, '{supplier}', to_jsonb(supplier.supplier_name), true);
        updated_variant := jsonb_set(updated_variant, '{cost}', coalesce(old_variant->'cost', '0'::jsonb), true);
        updated_variant := jsonb_set(updated_variant, '{frozen}', coalesce(old_variant->'frozen', 'false'::jsonb), true);
      end if;
      current_variants := current_variants || jsonb_build_array(updated_variant);
    end loop;

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
  end if;

  updated_product := p_product_data || jsonb_build_object(
    'id', p_product_id,
    'hidden', coalesce(current_product->'hidden', 'false'::jsonb),
    'frozenByAdmin', coalesce(current_product->'frozenByAdmin', 'false'::jsonb),
    'variants', current_variants
  );
  catalog := (select coalesce(jsonb_agg(case when entry->>'id' = p_product_id then updated_product else entry end order by ordinal), '[]'::jsonb)
    from jsonb_array_elements(catalog) with ordinality rows(entry, ordinal));
  insert into public.app_data (record_id, scope, storage_key, owner_id, payload, updated_at)
  values ('shared:furgo-demo-marketplace-products:shared', 'shared', 'furgo-demo-marketplace-products', null, catalog, now())
  on conflict (record_id) do update set payload = excluded.payload, updated_at = now();
  return jsonb_build_object('variant_change_pending', variant_pending, 'product_id', p_product_id);
end;
$$;
revoke all on function public.edit_marketplace_supplier_product(text, jsonb) from public, anon;
grant execute on function public.edit_marketplace_supplier_product(text, jsonb) to authenticated;

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
  proposed_variant jsonb;
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
    catalog := coalesce(catalog, '[]'::jsonb);
    if jsonb_typeof(catalog) is distinct from 'array' then raise exception 'Marketplace catalog data is not an array.'; end if;

    if submission.action = 'add' then
      product := submission.product_data;
      if coalesce(trim(product->>'name'), '') = '' or jsonb_typeof(product->'variants') is distinct from 'array' or jsonb_array_length(product->'variants') = 0 then raise exception 'The submitted product details are incomplete.'; end if;
      for product_variant in select value from jsonb_array_elements(product->'variants') loop
        if coalesce(product_variant->>'price', '') !~ '^[0-9]+([.][0-9]{1,2})?$' or coalesce(product_variant->>'stock', '') !~ '^[0-9]+$' or coalesce(trim(product_variant->>'label'), '') = '' then raise exception 'A product option has invalid price, stock, or name.'; end if;
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
      if not exists (select 1 from jsonb_array_elements(coalesce(existing_product->'variants', '[]'::jsonb)) variant where lower(coalesce(variant->>'supplierId', variant->>'supplier', '')) = lower(submission.supplier_name)) then raise exception 'This Store no longer owns the product.'; end if;

      if submission.action in ('edit', 'edit_variant') then
        product := case when submission.action = 'edit' then submission.product_data else existing_product || jsonb_build_object('variants', submission.product_data->'variants') end;
        if coalesce(trim(product->>'name'), '') = '' or jsonb_typeof(product->'variants') is distinct from 'array' or jsonb_array_length(product->'variants') = 0 then raise exception 'The edited product details are incomplete.'; end if;
        if exists (
          select 1 from jsonb_array_elements(product->'variants') proposed
          where coalesce(trim(proposed->>'label'), '') = '' or coalesce(proposed->>'price', '') !~ '^[0-9]+([.][0-9]{1,2})?$' or coalesce(proposed->>'stock', '') !~ '^[0-9]+$'
        ) then raise exception 'An option has invalid price, stock, or name.'; end if;
        if exists (select lower(trim(value->>'label')) from jsonb_array_elements(product->'variants') value group by lower(trim(value->>'label')) having count(*) > 1)
          or exists (select value->>'id' from jsonb_array_elements(product->'variants') value where coalesce(value->>'id', '') <> '' group by value->>'id' having count(*) > 1) then
          raise exception 'Product option names and IDs must be unique.';
        end if;

        -- Preserve other Stores' options. Replace this Store's options with
        -- the reviewed list and retain latest live stock for existing IDs.
        select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb) into approved_variants
        from jsonb_array_elements(coalesce(existing_product->'variants', '[]'::jsonb)) with ordinality rows(value, ordinality)
        where lower(coalesce(value->>'supplierId', value->>'supplier', '')) <> lower(submission.supplier_name);
        for proposed_variant in select value from jsonb_array_elements(product->'variants') loop
          if lower(coalesce(proposed_variant->>'supplierId', proposed_variant->>'supplier', submission.supplier_name)) <> lower(submission.supplier_name) then raise exception 'Every option in this request must belong to the requesting Store.'; end if;
          old_variant := null;
          select value into old_variant from jsonb_array_elements(coalesce(existing_product->'variants', '[]'::jsonb)) value where value->>'id' = proposed_variant->>'id' limit 1;
          if old_variant is not null and lower(coalesce(old_variant->>'supplierId', old_variant->>'supplier', '')) <> lower(submission.supplier_name) then raise exception 'An option belongs to another Store.'; end if;
          if old_variant is not null then
            proposed_variant := jsonb_set(proposed_variant, '{stock}', coalesce(old_variant->'stock', '0'::jsonb), true);
            proposed_variant := jsonb_set(proposed_variant, '{cost}', coalesce(old_variant->'cost', '0'::jsonb), true);
            proposed_variant := jsonb_set(proposed_variant, '{frozen}', coalesce(old_variant->'frozen', 'false'::jsonb), true);
          else
            proposed_variant := jsonb_set(proposed_variant, '{cost}', coalesce(proposed_variant->'cost', '0'::jsonb), true);
          end if;
          proposed_variant := jsonb_set(proposed_variant, '{supplierId}', to_jsonb(submission.supplier_name), true);
          proposed_variant := jsonb_set(proposed_variant, '{supplier}', to_jsonb(submission.supplier_name), true);
          approved_variants := approved_variants || jsonb_build_array(proposed_variant);
        end loop;
        product := jsonb_set(product, '{id}', to_jsonb(submission.product_id), true);
        product := jsonb_set(product, '{hidden}', coalesce(existing_product->'hidden', 'false'::jsonb), true);
        product := jsonb_set(product, '{frozenByAdmin}', coalesce(existing_product->'frozenByAdmin', 'false'::jsonb), true);
        product := jsonb_set(product, '{variants}', approved_variants, true);
        catalog := (select coalesce(jsonb_agg(case when entry->>'id' = submission.product_id then product else entry end order by ordinal), '[]'::jsonb) from jsonb_array_elements(catalog) with ordinality rows(entry, ordinal));
      elsif submission.action = 'hide' then
        product := jsonb_set(existing_product, '{hidden}', 'true'::jsonb, true);
        catalog := (select coalesce(jsonb_agg(case when entry->>'id' = submission.product_id then product else entry end order by ordinal), '[]'::jsonb) from jsonb_array_elements(catalog) with ordinality rows(entry, ordinal));
      elsif submission.action = 'delete' then
        catalog := (select coalesce(jsonb_agg(entry order by ordinal), '[]'::jsonb) from jsonb_array_elements(catalog) with ordinality rows(entry, ordinal) where entry->>'id' <> submission.product_id);
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
