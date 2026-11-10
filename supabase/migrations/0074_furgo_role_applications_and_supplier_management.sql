-- Customer applications for Marketplace Supplier, Outlet Staff, and Driver access.
-- Directors review applications from Manage Supplier / Manage Admin.

create table if not exists public.furgo_role_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_requested text not null check (role_requested in ('supplier', 'outlet_staff', 'driver')),
  company_name text not null default '' check (char_length(company_name) <= 100),
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text not null default '' check (char_length(review_note) <= 1000),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists furgo_role_applications_queue_idx
  on public.furgo_role_applications(role_requested, status, created_at desc);
create unique index if not exists furgo_role_applications_one_pending_per_role
  on public.furgo_role_applications(user_id, role_requested) where status = 'pending';

alter table public.furgo_role_applications enable row level security;
revoke all on public.furgo_role_applications from public, anon, authenticated;
drop policy if exists "Applicants and Directors read Furgo role applications" on public.furgo_role_applications;
create policy "Applicants and Directors read Furgo role applications"
  on public.furgo_role_applications for select to authenticated
  using (user_id = (select auth.uid()) or (select public.current_portal_level(auth.uid())) >= 3);
grant select on public.furgo_role_applications to authenticated;

create or replace function public.submit_furgo_role_application(
  p_role text,
  p_company_name text default '',
  p_message text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  created_id uuid;
  requested_role text := lower(btrim(coalesce(p_role, '')));
  company text := btrim(coalesce(p_company_name, ''));
  note text := btrim(coalesce(p_message, ''));
begin
  if caller is null then raise exception 'Sign in before applying to join Furgo.'; end if;
  if public.current_portal_level(caller) > 0 then raise exception 'Admin accounts cannot submit customer role applications.'; end if;
  if requested_role not in ('supplier', 'outlet_staff', 'driver') then raise exception 'Choose Supplier, Outlet Staff, or Driver.'; end if;
  if requested_role = 'supplier' and char_length(company) not between 1 and 100 then raise exception 'Enter your supplier company name.'; end if;
  if char_length(note) > 1000 then raise exception 'Your message must be 1000 characters or fewer.'; end if;
  if requested_role = 'supplier' and exists (select 1 from public.marketplace_supplier_access where supplier_user_id = caller) then
    raise exception 'This account already has Supplier access.';
  end if;
  insert into public.furgo_role_applications(user_id, role_requested, company_name, message)
  values (caller, requested_role, company, note)
  returning id into created_id;
  return jsonb_build_object('ok', true, 'id', created_id);
exception when unique_violation then
  raise exception 'You already have a pending application for this role.';
end;
$$;
revoke all on function public.submit_furgo_role_application(text, text, text) from public, anon;
grant execute on function public.submit_furgo_role_application(text, text, text) to authenticated;

create or replace function public.get_furgo_role_applications(p_role text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_rank smallint := public.current_portal_level(auth.uid());
  requested_role text := nullif(lower(btrim(coalesce(p_role, ''))), '');
begin
  if caller_rank < 3 then raise exception 'Only Directors can review role applications.'; end if;
  if requested_role is not null and requested_role not in ('supplier', 'outlet_staff', 'driver') then
    raise exception 'Choose a valid role filter.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', application.id,
      'user_id', application.user_id,
      'role_requested', application.role_requested,
      'company_name', application.company_name,
      'message', application.message,
      'status', application.status,
      'review_note', application.review_note,
      'created_at', application.created_at,
      'display_name', profile.display_name,
      'email', profile.email
    ) order by case application.status when 'pending' then 0 else 1 end, application.created_at desc)
    from public.furgo_role_applications application
    join public.profiles profile on profile.id = application.user_id
    where requested_role is null or application.role_requested = requested_role
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_furgo_role_applications(text) from public, anon;
grant execute on function public.get_furgo_role_applications(text) to authenticated;

create or replace function public.review_furgo_role_application(
  p_application_id uuid,
  p_decision text,
  p_company_name text default '',
  p_outlet_id uuid default null,
  p_review_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  application public.furgo_role_applications;
  applicant_email text;
  company text := btrim(coalesce(p_company_name, ''));
  note text := btrim(coalesce(p_review_note, ''));
begin
  if public.current_portal_level(caller) < 3 then raise exception 'Only Directors can review role applications.'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Choose Approve or Reject.'; end if;
  if char_length(note) > 1000 then raise exception 'Feedback must be 1000 characters or fewer.'; end if;
  select * into application from public.furgo_role_applications where id = p_application_id for update;
  if not found then raise exception 'This application could not be found.'; end if;
  if application.status <> 'pending' then raise exception 'This application has already been reviewed.'; end if;

  if p_decision = 'approve' then
    select profile.email into applicant_email from public.profiles profile where profile.id = application.user_id;
    if applicant_email is null then raise exception 'The applicant account email could not be found.'; end if;
    if application.role_requested = 'supplier' then
      company := coalesce(nullif(company, ''), nullif(application.company_name, ''));
      if company is null then raise exception 'Enter the supplier company name before approving.'; end if;
      perform public.assign_marketplace_supplier_account(applicant_email, company);
    elsif application.role_requested = 'outlet_staff' then
      if p_outlet_id is null then raise exception 'Choose an outlet before approving this application.'; end if;
      perform public.manage_admin_team_member(applicant_email, 'executive', 'add', p_outlet_id);
    elsif application.role_requested = 'driver' then
      perform public.manage_admin_team_member(applicant_email, 'driver', 'add', null);
    end if;
  end if;

  update public.furgo_role_applications
  set status = case p_decision when 'approve' then 'approved' else 'rejected' end,
      review_note = note,
      reviewed_by = caller,
      reviewed_at = now()
  where id = application.id;

  return jsonb_build_object('ok', true, 'status', case p_decision when 'approve' then 'approved' else 'rejected' end);
end;
$$;
revoke all on function public.review_furgo_role_application(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.review_furgo_role_application(uuid, text, text, uuid, text) to authenticated;

-- Rename a supplier company without breaking its product ownership, active
-- shipment keys, order lines, or open return cases.
create or replace function public.update_marketplace_supplier_company_name(
  p_supplier_user_id uuid,
  p_supplier_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplier_row public.marketplace_supplier_access;
  old_name text;
  new_name text := btrim(coalesce(p_supplier_name, ''));
  old_key text;
  new_key text;
  catalog jsonb;
  renamed_catalog jsonb;
begin
  if public.current_portal_level(auth.uid()) < 3 then
    raise exception 'Only Directors can edit supplier company names.';
  end if;
  if p_supplier_user_id is null then raise exception 'Choose a supplier account.'; end if;
  if char_length(new_name) not between 1 and 100 then raise exception 'Supplier company name must be 1 to 100 characters.'; end if;

  select * into supplier_row
  from public.marketplace_supplier_access
  where supplier_user_id = p_supplier_user_id
  for update;
  if not found then raise exception 'Supplier account could not be found.'; end if;
  old_name := supplier_row.supplier_name;
  old_key := lower(btrim(old_name));
  new_key := lower(btrim(new_name));
  if old_key = new_key then
    update public.marketplace_supplier_access
    set supplier_name = new_name, updated_at = now()
    where supplier_user_id = p_supplier_user_id;
    return jsonb_build_object('ok', true, 'supplier_name', new_name);
  end if;
  if exists (
    select 1 from public.marketplace_supplier_access other_supplier
    where other_supplier.supplier_user_id <> p_supplier_user_id
      and lower(btrim(other_supplier.supplier_name)) = old_key
  ) then raise exception 'This company name is shared by another supplier account. Make supplier company names unique before renaming.'; end if;
  if exists (
    select 1 from public.marketplace_supplier_access other_supplier
    where other_supplier.supplier_user_id <> p_supplier_user_id
      and lower(btrim(other_supplier.supplier_name)) = new_key
  ) then raise exception 'Another supplier already uses this company name.'; end if;

  select coalesce(payload, '[]'::jsonb) into catalog
  from public.app_data
  where record_id = 'shared:furgo-demo-marketplace-products:shared'
  for update;
  if catalog is not null then
    if jsonb_typeof(catalog) <> 'array' then raise exception 'Marketplace catalog data is not an array.'; end if;
    select coalesce(jsonb_agg(
      case when jsonb_typeof(product.value->'variants') = 'array' then
        jsonb_set(product.value, '{variants}', coalesce((
          select jsonb_agg(
            case
              when lower(btrim(coalesce(variant.value->>'supplierId', variant.value->>'supplier', ''))) = old_key
                then jsonb_set(jsonb_set(variant.value, '{supplierId}', to_jsonb(new_name), true), '{supplier}', to_jsonb(new_name), true)
              else variant.value
            end order by variant.ordinality
          )
          from jsonb_array_elements(product.value->'variants') with ordinality as variant(value, ordinality)
        ), '[]'::jsonb), true)
      else product.value end
      order by product.ordinality
    ), '[]'::jsonb) into renamed_catalog
    from jsonb_array_elements(catalog) with ordinality as product(value, ordinality);
    update public.app_data
    set payload = renamed_catalog, updated_at = now()
    where record_id = 'shared:furgo-demo-marketplace-products:shared';
  end if;

  update public.marketplace_product_submissions submission
  set supplier_name = new_name,
      product_data = case when jsonb_typeof(submission.product_data->'variants') = 'array' then
        jsonb_set(submission.product_data, '{variants}', coalesce((
          select jsonb_agg(
            case
              when lower(btrim(coalesce(variant.value->>'supplierId', variant.value->>'supplier', old_name))) = old_key
                then jsonb_set(jsonb_set(variant.value, '{supplierId}', to_jsonb(new_name), true), '{supplier}', to_jsonb(new_name), true)
              else variant.value
            end order by variant.ordinality
          )
          from jsonb_array_elements(submission.product_data->'variants') with ordinality as variant(value, ordinality)
        ), '[]'::jsonb), true)
        else submission.product_data end
  where submission.supplier_user_id = p_supplier_user_id and lower(btrim(submission.supplier_name)) = old_key;

  update public.marketplace_order_items lines
  set item = case
    when lower(btrim(coalesce(lines.item->>'supplierId', lines.item->>'supplier', ''))) = old_key
      then jsonb_set(jsonb_set(lines.item, '{supplierId}', to_jsonb(new_name), true), '{supplier}', to_jsonb(new_name), true)
    else lines.item
  end
  where lower(btrim(coalesce(lines.item->>'supplierId', lines.item->>'supplier', ''))) = old_key;

  update public.marketplace_item_returns
  set supplier_name = new_name, updated_at = now()
  where lower(btrim(supplier_name)) = old_key;

  if exists (
    select 1 from public.marketplace_orders order_row
    where coalesce(order_row.details->'supplierShipments', '{}'::jsonb) ? old_key
      and coalesce(order_row.details->'supplierShipments', '{}'::jsonb) ? new_key
  ) then raise exception 'Shipment data already exists for the new company name. Resolve the duplicate shipment entry before renaming.'; end if;
  update public.marketplace_orders order_row
  set details = jsonb_set(
    coalesce(order_row.details, '{}'::jsonb),
    '{supplierShipments}',
    (coalesce(order_row.details->'supplierShipments', '{}'::jsonb) - old_key)
      || case when coalesce(order_row.details->'supplierShipments', '{}'::jsonb) ? old_key
        then jsonb_build_object(new_key, order_row.details->'supplierShipments'->old_key)
        else '{}'::jsonb end,
    true
  )
  where coalesce(order_row.details->'supplierShipments', '{}'::jsonb) ? old_key;

  update public.marketplace_supplier_access
  set supplier_name = new_name, updated_at = now()
  where supplier_user_id = p_supplier_user_id;
  return jsonb_build_object('ok', true, 'supplier_name', new_name);
end;
$$;
revoke all on function public.update_marketplace_supplier_company_name(uuid, text) from public, anon;
grant execute on function public.update_marketplace_supplier_company_name(uuid, text) to authenticated;
