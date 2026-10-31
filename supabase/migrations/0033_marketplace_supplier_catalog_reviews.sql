-- Supplier catalog listing and Director-reviewed add/edit/hide/delete requests.
alter table public.marketplace_product_submissions
  add column if not exists action text not null default 'add',
  add column if not exists product_id text;

alter table public.marketplace_product_submissions
  drop constraint if exists marketplace_product_submissions_action_check;
alter table public.marketplace_product_submissions
  add constraint marketplace_product_submissions_action_check
  check (action in ('add', 'edit', 'hide', 'delete'));

drop policy if exists "Assigned suppliers submit products" on public.marketplace_product_submissions;
revoke insert on public.marketplace_product_submissions from authenticated;

create or replace function public.get_marketplace_supplier_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  supplier_name text;
  catalog jsonb;
begin
  select access.supplier_name into supplier_name
  from public.marketplace_supplier_access access
  where access.supplier_user_id = auth.uid();
  if supplier_name is null then raise exception 'This account is not linked to a supplier.'; end if;

  select data.payload into catalog
  from public.app_data data
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared';
  if jsonb_typeof(catalog) is distinct from 'array' then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(
      jsonb_set(product, '{variants}', coalesce((
        select jsonb_agg(variant)
        from jsonb_array_elements(coalesce(product->'variants', '[]'::jsonb)) variant
        where lower(coalesce(variant->>'supplierId', variant->>'supplier', '')) = lower(supplier_name)
      ), '[]'::jsonb), true)
      order by lower(coalesce(product->>'name', ''))
    )
    from jsonb_array_elements(catalog) product
    where exists (
      select 1 from jsonb_array_elements(coalesce(product->'variants', '[]'::jsonb)) variant
      where lower(coalesce(variant->>'supplierId', variant->>'supplier', '')) = lower(supplier_name)
    )
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_marketplace_supplier_catalog() from public, anon;
grant execute on function public.get_marketplace_supplier_catalog() to authenticated;

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
  catalog jsonb;
  current_product jsonb;
  submission public.marketplace_product_submissions;
begin
  select * into supplier from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid();
  if not found then raise exception 'This account is not linked to a supplier.'; end if;
  if p_action is null or p_action not in ('add', 'edit', 'hide', 'delete') then raise exception 'Choose a valid product change.'; end if;
  if jsonb_typeof(p_product_data) is distinct from 'object' then raise exception 'Product details are required.'; end if;

  select coalesce(data.payload, '[]'::jsonb) into catalog
  from public.app_data data where data.record_id = 'shared:furgo-demo-marketplace-products:shared' for update;
  if catalog is null then catalog := '[]'::jsonb; end if;
  if jsonb_typeof(catalog) is distinct from 'array' then raise exception 'Marketplace catalog data is invalid.'; end if;

  if p_action = 'add' then
    if coalesce(trim(p_product_data->>'name'), '') = '' or jsonb_typeof(p_product_data->'variants') is distinct from 'array' or jsonb_array_length(p_product_data->'variants') = 0 then
      raise exception 'Product name and at least one variant are required.';
    end if;
  else
    select product into current_product
    from jsonb_array_elements(catalog) product
    where product->>'id' = p_product_id
      and exists (
        select 1 from jsonb_array_elements(coalesce(product->'variants', '[]'::jsonb)) variant
        where lower(coalesce(variant->>'supplierId', variant->>'supplier', '')) = lower(supplier.supplier_name)
      )
    limit 1;
    if current_product is null then raise exception 'That product is not assigned to your supplier account.'; end if;
    if exists (
      select 1 from public.marketplace_product_submissions pending
      where pending.supplier_user_id = auth.uid() and pending.product_id = p_product_id and pending.status = 'Pending Review'
    ) then raise exception 'A change for this product is already waiting for Director review.'; end if;
  end if;

  if p_action in ('edit', 'hide', 'delete') and coalesce(trim(p_product_id), '') = '' then raise exception 'Choose a product to change.'; end if;
  insert into public.marketplace_product_submissions (supplier_user_id, supplier_name, action, product_id, product_data)
  values (auth.uid(), supplier.supplier_name, p_action, nullif(p_product_id, ''), p_product_data)
  returning * into submission;
  return submission;
end;
$$;
revoke all on function public.submit_marketplace_supplier_product(text, text, jsonb) from public, anon;
grant execute on function public.submit_marketplace_supplier_product(text, text, jsonb) to authenticated;

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
      if coalesce(trim(product->>'name'), '') = '' or jsonb_typeof(product->'variants') is distinct from 'array' or jsonb_array_length(product->'variants') = 0 then
        raise exception 'The submitted product details are incomplete.';
      end if;
      for product_variant in select value from jsonb_array_elements(product->'variants') loop
        if coalesce(product_variant->>'price', '') !~ '^[0-9]+([.][0-9]{1,2})?$' or coalesce(product_variant->>'stock', '') !~ '^[0-9]+$' or coalesce(trim(product_variant->>'label'), '') = '' then
          raise exception 'A product variant has invalid price, stock, or package details.';
        end if;
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
      if not exists (select 1 from jsonb_array_elements(coalesce(existing_product->'variants', '[]'::jsonb)) variant where lower(coalesce(variant->>'supplierId', variant->>'supplier', '')) = lower(submission.supplier_name)) then
        raise exception 'This supplier no longer owns the product.';
      end if;
      if submission.action = 'edit' then
        product := submission.product_data;
        if coalesce(trim(product->>'name'), '') = '' or jsonb_typeof(product->'variants') is distinct from 'array' or jsonb_array_length(product->'variants') = 0 then raise exception 'The edited product details are incomplete.'; end if;
        product_variant := product->'variants'->0;
        if coalesce(product_variant->>'price', '') !~ '^[0-9]+([.][0-9]{1,2})?$' or coalesce(product_variant->>'stock', '') !~ '^[0-9]+$' or coalesce(trim(product_variant->>'label'), '') = '' then
          raise exception 'The edited variant has invalid price, stock, or package details.';
        end if;
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
