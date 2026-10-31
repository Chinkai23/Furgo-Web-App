-- Marketplace supplier portal: director-linked supplier accounts, private submissions,
-- director approval, and supplier-scoped fulfillment details.

create table public.marketplace_supplier_access (
  supplier_user_id uuid primary key references auth.users(id) on delete cascade,
  supplier_name text not null check (char_length(trim(supplier_name)) between 1 and 100),
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marketplace_supplier_access enable row level security;
create policy "Supplier users read their own marketplace access"
  on public.marketplace_supplier_access for select to authenticated
  using (supplier_user_id = auth.uid() or public.current_portal_level(auth.uid()) >= 3);
create policy "Directors manage marketplace supplier access"
  on public.marketplace_supplier_access for all to authenticated
  using (public.current_portal_level(auth.uid()) >= 3)
  with check (public.current_portal_level(auth.uid()) >= 3);
grant select, insert, update, delete on public.marketplace_supplier_access to authenticated;

create table public.marketplace_product_submissions (
  id uuid primary key default gen_random_uuid(),
  supplier_user_id uuid not null references public.marketplace_supplier_access(supplier_user_id) on delete cascade,
  supplier_name text not null,
  product_data jsonb not null check (jsonb_typeof(product_data) = 'object'),
  status text not null default 'Pending Review' check (status in ('Pending Review', 'Approved', 'Rejected')),
  rejection_reason text not null default '' check (char_length(rejection_reason) <= 1000),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz
);
create index marketplace_product_submissions_supplier_idx
  on public.marketplace_product_submissions (supplier_user_id, submitted_at desc);
create index marketplace_product_submissions_review_idx
  on public.marketplace_product_submissions (status, submitted_at desc);
alter table public.marketplace_product_submissions enable row level security;
create policy "Suppliers and Directors read product submissions"
  on public.marketplace_product_submissions for select to authenticated
  using (supplier_user_id = auth.uid() or public.current_portal_level(auth.uid()) >= 3);
create policy "Assigned suppliers submit products"
  on public.marketplace_product_submissions for insert to authenticated
  with check (
    supplier_user_id = auth.uid()
    and status = 'Pending Review'
    and reviewed_by is null
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = auth.uid() and access.supplier_name = supplier_name
    )
  );
create policy "Directors review product submissions"
  on public.marketplace_product_submissions for update to authenticated
  using (public.current_portal_level(auth.uid()) >= 3)
  with check (public.current_portal_level(auth.uid()) >= 3);
grant select, insert, update on public.marketplace_product_submissions to authenticated;

create or replace function public.assign_marketplace_supplier_account(p_email text, p_supplier_name text)
returns public.marketplace_supplier_access
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid;
  result public.marketplace_supplier_access;
begin
  if public.current_portal_level(auth.uid()) < 3 then raise exception 'Only Directors can assign supplier portal accounts.'; end if;
  if coalesce(trim(p_email), '') = '' or coalesce(trim(p_supplier_name), '') = '' then raise exception 'Supplier email and name are required.'; end if;
  select profile.id into target_user from public.profiles profile
  where lower(profile.email) = lower(trim(p_email)) limit 1;
  if target_user is null then raise exception 'No Furgo account uses that email. Ask the supplier to register first.'; end if;
  insert into public.marketplace_supplier_access (supplier_user_id, supplier_name, assigned_by, updated_at)
  values (target_user, trim(p_supplier_name), auth.uid(), now())
  on conflict (supplier_user_id) do update set supplier_name = excluded.supplier_name, assigned_by = excluded.assigned_by, updated_at = now()
  returning * into result;
  return result;
end;
$$;
revoke all on function public.assign_marketplace_supplier_account(text, text) from public, anon;
grant execute on function public.assign_marketplace_supplier_account(text, text) to authenticated;

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
  product_variant jsonb;
  approved_variants jsonb := '[]'::jsonb;
  catalog_record_id text := 'shared:furgo-demo-marketplace-products:shared';
begin
  if public.current_portal_level(auth.uid()) < 3 then raise exception 'Only Directors can approve or reject supplier products.'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Choose approve or reject.'; end if;
  if p_decision = 'reject' and coalesce(trim(p_reason), '') = '' then raise exception 'A rejection reason is required.'; end if;
  select * into submission from public.marketplace_product_submissions where id = p_submission_id for update;
  if not found then raise exception 'Product submission was not found.'; end if;
  if submission.status <> 'Pending Review' then raise exception 'This product submission has already been reviewed.'; end if;

  if p_decision = 'approve' then
    product := submission.product_data;
    if coalesce(trim(product->>'name'), '') = '' or jsonb_typeof(product->'variants') is distinct from 'array' then
      raise exception 'The submitted product details are incomplete.';
    end if;
    if jsonb_array_length(product->'variants') = 0 then raise exception 'At least one product variant is required.'; end if;
    for product_variant in select value from jsonb_array_elements(product->'variants') loop
      if coalesce(product_variant->>'price', '') !~ '^[0-9]+([.][0-9]{1,2})?$'
        or coalesce(product_variant->>'stock', '') !~ '^[0-9]+$'
        or coalesce(trim(product_variant->>'label'), '') = '' then
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
    select coalesce(payload, '[]'::jsonb) into catalog from public.app_data
    where record_id = catalog_record_id for update;
    if catalog is null then catalog := '[]'::jsonb; end if;
    if jsonb_typeof(catalog) <> 'array' then raise exception 'Marketplace catalog data is not an array.'; end if;
    if exists (select 1 from jsonb_array_elements(catalog) entry where entry->>'id' = product->>'id') then
      raise exception 'A product with this submission ID already exists in the catalog.';
    end if;
    insert into public.app_data (record_id, scope, storage_key, owner_id, payload, updated_at)
    values (catalog_record_id, 'shared', 'furgo-demo-marketplace-products', null, catalog || jsonb_build_array(product), now())
    on conflict (record_id) do update set payload = excluded.payload, updated_at = now();
    update public.marketplace_product_submissions
    set status = 'Approved', rejection_reason = '', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_submission_id;
  else
    update public.marketplace_product_submissions
    set status = 'Rejected', rejection_reason = left(trim(p_reason), 1000), reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_submission_id;
  end if;
  select to_jsonb(entry) into catalog from public.marketplace_product_submissions entry where entry.id = p_submission_id;
  return catalog;
end;
$$;
revoke all on function public.review_marketplace_product_submission(uuid, text, text) from public, anon;
grant execute on function public.review_marketplace_product_submission(uuid, text, text) to authenticated;

create or replace function public.get_marketplace_supplier_orders()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', order_row.id,
    'reference', order_row.reference,
    'status', order_row.status,
    'paymentStatus', order_row.payment_status,
    'createdAt', order_row.created_at,
    'recipientName', coalesce(order_row.details->>'customerName', order_row.details->'address'->>'name', ''),
    'recipientPhone', coalesce(order_row.details->>'deliveryPhone', order_row.details->'address'->>'phone', order_row.details->>'customerPhone', ''),
    'recipientAddress', concat_ws(', ', nullif(order_row.details->'address'->>'street', ''), nullif(order_row.details->'address'->>'postcode', ''), nullif(order_row.details->'address'->>'city', ''), nullif(order_row.details->'address'->>'state', '')),
    'products', supplier_lines.lines
  )
  from public.marketplace_orders order_row
  join public.marketplace_supplier_access access on access.supplier_user_id = auth.uid()
  cross join lateral (
    select coalesce(jsonb_agg(lines.item order by lines.line_number), '[]'::jsonb) as lines
    from public.marketplace_order_items lines
    where lines.order_id = order_row.id
      and lower(coalesce(lines.item->>'supplierId', lines.item->>'supplier', '')) = lower(access.supplier_name)
  ) supplier_lines
  where jsonb_array_length(supplier_lines.lines) > 0
  order by order_row.created_at desc;
$$;
revoke all on function public.get_marketplace_supplier_orders() from public, anon;
grant execute on function public.get_marketplace_supplier_orders() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-submissions', 'marketplace-submissions', true, 1572864, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 1572864, allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];
create policy "Assigned suppliers upload their marketplace submission images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marketplace-submissions'
    and split_part(name, '/', 1) = auth.uid()::text
    and exists (select 1 from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid())
  );
create policy "Directors can delete marketplace submission images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'marketplace-submissions' and public.current_portal_level(auth.uid()) >= 3);
