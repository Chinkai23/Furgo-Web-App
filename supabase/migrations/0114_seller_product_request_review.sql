-- Seller submitted products are reviewed in Manage Sellers. Store Portal
-- warehouse submissions are no longer subject to the old approval queue.

alter table public.marketplace_seller_profiles
  add column if not exists business_address text not null default '';

create table if not exists public.marketplace_seller_product_submissions (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.marketplace_seller_profiles(id) on delete cascade,
  request_type text not null default 'New Product' check (request_type in ('New Product', 'Product Edit')),
  product_data jsonb not null check (jsonb_typeof(product_data) = 'object'),
  seller_details jsonb not null default '{}'::jsonb check (jsonb_typeof(seller_details) = 'object'),
  status text not null default 'Pending Review'
    check (status in ('Pending Review', 'Approved', 'Rejected', 'In Waiting List')),
  admin_note text not null default '' check (char_length(admin_note) <= 1000),
  warehouse_product_id uuid references public.warehouse_products(id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create index if not exists marketplace_seller_product_submissions_seller_idx
  on public.marketplace_seller_product_submissions(seller_id, submitted_at desc);
create index if not exists marketplace_seller_product_submissions_review_idx
  on public.marketplace_seller_product_submissions(status, submitted_at);

alter table public.marketplace_seller_product_submissions enable row level security;
revoke all on public.marketplace_seller_product_submissions from public, anon, authenticated;

create or replace function public.seller_portal_request_profile()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare sid uuid := public.seller_portal_require_scope(); result jsonb;
begin
  select jsonb_build_object('business_name', profile.business_name, 'contact_name', profile.contact_name,
    'contact_email', profile.contact_email, 'contact_phone', profile.contact_phone,
    'business_address', profile.business_address)
  into result from public.marketplace_seller_profiles profile where profile.id = sid;
  return coalesce(result, '{}'::jsonb);
end;
$$;
revoke all on function public.seller_portal_request_profile() from public, anon;
grant execute on function public.seller_portal_request_profile() to authenticated;

create or replace function public.seller_portal_product_requests()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', request.id, 'seller_id', request.seller_id, 'request_type', request.request_type, 'product_data', request.product_data,
    'seller_details', request.seller_details, 'status', request.status, 'admin_note', request.admin_note,
    'warehouse_product_id', request.warehouse_product_id, 'submitted_at', request.submitted_at,
    'reviewed_at', request.reviewed_at
  ) order by request.submitted_at desc), '[]'::jsonb)
  from public.marketplace_seller_product_submissions request
  where request.seller_id = public.seller_portal_require_scope();
$$;
revoke all on function public.seller_portal_product_requests() from public, anon;
grant execute on function public.seller_portal_product_requests() to authenticated;

create or replace function public.seller_portal_product_request_product(p_warehouse_product_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare sid uuid := public.seller_portal_require_scope(); result jsonb;
begin
  select jsonb_build_object('id', product.id, 'name', product.name, 'product_data', product.product_data)
  into result
  from public.marketplace_seller_products mapping
  join public.warehouse_products product on product.id = mapping.warehouse_product_id
  where mapping.seller_id = sid and mapping.warehouse_product_id = p_warehouse_product_id;
  if result is null then raise exception 'This product is not assigned to your seller account.'; end if;
  return result;
end;
$$;
revoke all on function public.seller_portal_product_request_product(uuid) from public, anon;
grant execute on function public.seller_portal_product_request_product(uuid) to authenticated;

create or replace function public.seller_submit_product_request(
  p_request_id uuid,
  p_product_data jsonb,
  p_seller_details jsonb,
  p_warehouse_product_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := public.seller_portal_require_scope();
  business text := btrim(coalesce(p_seller_details->>'business_name', ''));
  contact_email_value text := lower(btrim(coalesce(p_seller_details->>'contact_email', '')));
  request_id uuid;
begin
  if jsonb_typeof(p_product_data) is distinct from 'object'
    or char_length(btrim(coalesce(p_product_data->>'name', ''))) not between 1 and 100 then
    raise exception 'Enter a product name, at least one option, and no more than five product photos.';
  end if;
  if jsonb_typeof(p_product_data->'variants') is distinct from 'array' then
    raise exception 'Enter at least one product option.';
  end if;
  if jsonb_array_length(p_product_data->'variants') not between 1 and 30 then
    raise exception 'Enter between one and 30 product options.';
  end if;
  if jsonb_typeof(p_product_data->'images') is distinct from 'array' then
    raise exception 'Product photos must be provided as a list.';
  end if;
  if jsonb_array_length(p_product_data->'images') > 5 then
    raise exception 'Enter a product name, at least one option, and no more than five product photos.';
  end if;
  if business = '' or contact_email_value = '' then
    raise exception 'Business name and contact email are required.';
  end if;
  if p_warehouse_product_id is not null and not exists (
    select 1 from public.marketplace_seller_products mapping
    where mapping.seller_id = sid and mapping.warehouse_product_id = p_warehouse_product_id
  ) then
    raise exception 'This product is not assigned to your seller account.';
  end if;
  if char_length(coalesce(p_seller_details->>'contact_name','')) > 120
    or char_length(coalesce(p_seller_details->>'contact_phone','')) > 40
    or char_length(coalesce(p_seller_details->>'business_address','')) > 500 then
    raise exception 'Seller contact details exceed the allowed length.';
  end if;

  update public.marketplace_seller_profiles profile set
    business_name = business,
    contact_name = btrim(coalesce(p_seller_details->>'contact_name','')),
    contact_email = contact_email_value,
    contact_phone = btrim(coalesce(p_seller_details->>'contact_phone','')),
    business_address = btrim(coalesce(p_seller_details->>'business_address','')),
    updated_at = now()
  where profile.id = sid;

  if p_request_id is null then
    insert into public.marketplace_seller_product_submissions(seller_id, request_type, warehouse_product_id, product_data, seller_details)
    values (sid, case when p_warehouse_product_id is null then 'New Product' else 'Product Edit' end, p_warehouse_product_id, p_product_data, jsonb_build_object(
      'businessName',business,'contactName',btrim(coalesce(p_seller_details->>'contact_name','')),
      'contactEmail',contact_email_value,'contactPhone',btrim(coalesce(p_seller_details->>'contact_phone','')),
      'businessAddress',btrim(coalesce(p_seller_details->>'business_address',''))
    )) returning id into request_id;
  else
    update public.marketplace_seller_product_submissions request set
      product_data = p_product_data,
      request_type = case when p_warehouse_product_id is null then request.request_type else 'Product Edit' end,
      seller_details = jsonb_build_object(
        'businessName',business,'contactName',btrim(coalesce(p_seller_details->>'contact_name','')),
        'contactEmail',contact_email_value,'contactPhone',btrim(coalesce(p_seller_details->>'contact_phone','')),
        'businessAddress',btrim(coalesce(p_seller_details->>'business_address',''))
      ),
      status = 'Pending Review', admin_note = '', warehouse_product_id = null,
      submitted_at = now(), reviewed_at = null, reviewed_by = null
    where request.id = p_request_id and request.seller_id = sid and request.status = 'Rejected'
    returning request.id into request_id;
    if request_id is null then
      raise exception 'Only your rejected product requests can be edited and resubmitted.';
    end if;
    if p_warehouse_product_id is not null then
      update public.marketplace_seller_product_submissions request
      set request_type = 'Product Edit', warehouse_product_id = p_warehouse_product_id
      where request.id = request_id and exists (
        select 1 from public.marketplace_seller_products mapping
        where mapping.seller_id = sid and mapping.warehouse_product_id = p_warehouse_product_id
      );
    end if;
  end if;
  return request_id;
end;
$$;
revoke all on function public.seller_submit_product_request(uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.seller_submit_product_request(uuid, jsonb, jsonb, uuid) to authenticated;

create or replace function public.admin_marketplace_seller_product_requests()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', request.id, 'seller_id', request.seller_id, 'request_type', request.request_type, 'seller_business_name', seller.business_name,
    'seller_contact_email', seller.contact_email, 'product_data', request.product_data,
    'seller_details', request.seller_details, 'status', request.status, 'admin_note', request.admin_note,
    'warehouse_product_id', request.warehouse_product_id, 'submitted_at', request.submitted_at,
    'reviewed_at', request.reviewed_at
  ) order by request.submitted_at desc)
  from public.marketplace_seller_product_submissions request
  join public.marketplace_seller_profiles seller on seller.id = request.seller_id), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_marketplace_seller_product_requests() from public, anon;
grant execute on function public.admin_marketplace_seller_product_requests() to authenticated;

create or replace function public.admin_marketplace_seller_review_product_request(
  p_request_id uuid,
  p_decision text,
  p_note text default ''
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  submission public.marketplace_seller_product_submissions;
  seller public.marketplace_seller_profiles;
  existing_product public.warehouse_products;
  active_store_user uuid;
  warehouse_id uuid;
  product_json jsonb;
  approved_variants jsonb := '[]'::jsonb;
  variant jsonb;
  new_code text;
  prefix text;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;
  if p_decision is null or p_decision not in ('Approve','Reject','In Waiting List') then
    raise exception 'Choose Approve, Reject, or In Waiting List.';
  end if;
  if char_length(coalesce(p_note,'')) > 1000 then raise exception 'The admin note is too long.'; end if;
  if p_decision = 'Reject' and btrim(coalesce(p_note,'')) = '' then
    raise exception 'Add a reason before rejecting this product request.';
  end if;

  select * into submission from public.marketplace_seller_product_submissions
    where id = p_request_id for update;
  if not found then raise exception 'Seller product request not found.'; end if;
  if submission.status not in ('Pending Review','In Waiting List') then
    raise exception 'This request has already been decided. A rejected request must be resubmitted by the seller before it can be reviewed again.';
  end if;

  if p_decision = 'Approve' then
    select profile.* into seller from public.marketplace_seller_profiles profile where profile.id = submission.seller_id;
    if submission.warehouse_product_id is not null then
      select product.* into existing_product from public.warehouse_products product
      join public.marketplace_seller_products mapping on mapping.warehouse_product_id = product.id
      where product.id = submission.warehouse_product_id and mapping.seller_id = submission.seller_id
      for update of product;
      if not found then raise exception 'The seller product is no longer available in warehouse inventory.'; end if;
      if exists (
        select 1 from public.warehouse_inventory_lots lot
        where lot.warehouse_product_id = submission.warehouse_product_id and lot.quantity > 0
          and not exists (
            select 1 from jsonb_array_elements(submission.product_data->'variants') submitted_variant
            where coalesce(submitted_variant->>'label','') = coalesce(lot.variant,'')
          )
      ) then
        raise exception 'An option with warehouse stock cannot be removed or renamed until its batch stock is zero.';
      end if;
      product_json := submission.product_data;
      product_json := jsonb_set(product_json, '{productCode}', coalesce(existing_product.product_data->'productCode', '""'::jsonb), true);
      product_json := jsonb_set(product_json, '{hidden}', coalesce(existing_product.product_data->'hidden', 'true'::jsonb), true);
      approved_variants := '[]'::jsonb;
      for variant in select value from jsonb_array_elements(submission.product_data->'variants') loop
        approved_variants := approved_variants || jsonb_build_array(
          jsonb_set(variant, '{stock}', coalesce((
            select old_variant->'stock'
            from jsonb_array_elements(case when jsonb_typeof(existing_product.product_data->'variants') = 'array' then existing_product.product_data->'variants' else '[]'::jsonb end) old_variant
            where coalesce(old_variant->>'id','') = coalesce(variant->>'id','')
              or coalesce(old_variant->>'label','') = coalesce(variant->>'label','')
            limit 1
          ), '0'::jsonb), true)
        );
      end loop;
      product_json := jsonb_set(product_json, '{variants}', approved_variants, true);
      product_json := jsonb_set(product_json, '{sellerDetails}', jsonb_build_object(
        'businessName', coalesce(submission.seller_details->>'businessName',seller.business_name),
        'contactName', coalesce(submission.seller_details->>'contactName',seller.contact_name),
        'contactEmail', coalesce(submission.seller_details->>'contactEmail',seller.contact_email),
        'contactPhone', coalesce(submission.seller_details->>'contactPhone',seller.contact_phone),
        'businessAddress', coalesce(submission.seller_details->>'businessAddress',seller.business_address)
      ), true);
      update public.warehouse_products set name = trim(submission.product_data->>'name'), product_data = product_json,
        updated_by = auth.uid(), updated_at = now()
      where id = submission.warehouse_product_id;
      warehouse_id := submission.warehouse_product_id;
    else
    select history.user_id into active_store_user
    from public.marketplace_store_account_history history
    join public.marketplace_supplier_access access on access.supplier_user_id = history.user_id
    where history.removed_at is null
    order by history.assigned_at, history.user_id limit 1;
    if active_store_user is null then
      raise exception 'Assign at least one account to a Store before approving seller products into warehouse inventory.';
    end if;

    prefix := case lower(trim(coalesce(submission.product_data->>'category','other')))
      when 'food' then 'FD' when 'snacks' then 'SN' when 'supplements' then 'ST'
      when 'toys' then 'TY' when 'grooming' then 'GR' else 'OT' end;
    loop
      new_code := prefix || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
      exit when not exists (
        select 1 from public.warehouse_products product
        where product.product_data->>'productCode' = new_code
      );
    end loop;

    for variant in select value from jsonb_array_elements(submission.product_data->'variants') loop
      approved_variants := approved_variants || jsonb_build_array(
        jsonb_set(variant, '{stock}', '0'::jsonb, true)
      );
    end loop;
    product_json := submission.product_data;
    product_json := jsonb_set(product_json, '{productCode}', to_jsonb(new_code), true);
    product_json := jsonb_set(product_json, '{hidden}', 'true'::jsonb, true);
    product_json := jsonb_set(product_json, '{variants}', approved_variants, true);
    product_json := jsonb_set(product_json, '{sellerDetails}', jsonb_build_object(
      'businessName', coalesce(submission.seller_details->>'businessName',seller.business_name),
      'contactName', coalesce(submission.seller_details->>'contactName',seller.contact_name),
      'contactEmail', coalesce(submission.seller_details->>'contactEmail',seller.contact_email),
      'contactPhone', coalesce(submission.seller_details->>'contactPhone',seller.contact_phone),
      'businessAddress', coalesce(submission.seller_details->>'businessAddress',seller.business_address)
    ), true);

    insert into public.warehouse_products(name, product_data, marketplace_product_id, created_by, updated_by)
      values (trim(submission.product_data->>'name'), product_json, null, active_store_user, active_store_user)
      returning id into warehouse_id;
    insert into public.marketplace_seller_products(seller_id, warehouse_product_id, seller_sku, listing_status)
      values (submission.seller_id, warehouse_id, new_code, 'Inactive');
    end if;
  end if;

  update public.marketplace_seller_product_submissions request set
    status = case p_decision when 'Approve' then 'Approved' when 'Reject' then 'Rejected' else 'In Waiting List' end,
    admin_note = btrim(coalesce(p_note,'')), warehouse_product_id = coalesce(warehouse_id, request.warehouse_product_id),
    reviewed_at = now(), reviewed_by = auth.uid()
  where request.id = submission.id returning * into submission;

  return jsonb_build_object('id',submission.id,'status',submission.status,
    'warehouse_product_id',submission.warehouse_product_id,'admin_note',submission.admin_note);
end;
$$;
revoke all on function public.admin_marketplace_seller_review_product_request(uuid,text,text) from public, anon;
grant execute on function public.admin_marketplace_seller_review_product_request(uuid,text,text) to authenticated;

-- Store staff now publish directly. The Store-specific legacy review UI is
-- removed separately; historical rows remain untouched.
insert into public.marketplace_store_product_settings(setting_key, approval_required, updated_at)
values ('store_product_approval', false, now())
on conflict (setting_key) do update set approval_required = false, updated_at = now();
-- Keep the historical setting row for compatibility with the Store listing
-- RPCs, but prevent the former Director toggle from re-enabling Store review.
revoke all on function public.set_marketplace_store_product_approval(boolean) from public, anon, authenticated;

-- Seller product photos are scoped to the authenticated seller's own folder.
drop policy if exists "Sellers upload marketplace product request images" on storage.objects;
create policy "Sellers upload marketplace product request images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marketplace-submissions'
    and split_part(name, '/', 1) = auth.uid()::text
    and exists (select 1 from public.marketplace_seller_users member where member.user_id = auth.uid())
  );
update storage.buckets set file_size_limit = 2097152
where id = 'marketplace-submissions';
