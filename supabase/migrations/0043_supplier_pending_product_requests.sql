-- Let a supplier revise or withdraw their own unreviewed new-product request.
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
begin
  select * into supplier
  from public.marketplace_supplier_access access
  where access.supplier_user_id = auth.uid();
  if not found then raise exception 'This account is not linked to a supplier.'; end if;

  select * into submission
  from public.marketplace_product_submissions request
  where request.id = p_submission_id
  for update;
  if not found or submission.supplier_user_id <> auth.uid() then
    raise exception 'This product request does not belong to your account.';
  end if;
  if submission.action <> 'add' or submission.status <> 'Pending Review' then
    raise exception 'Only a pending new-product request can be edited.';
  end if;
  if jsonb_typeof(p_product_data) is distinct from 'object'
    or coalesce(trim(p_product_data->>'name'), '') = ''
    or jsonb_typeof(p_product_data->'variants') is distinct from 'array'
    or jsonb_array_length(p_product_data->'variants') = 0 then
    raise exception 'Product name and at least one variant are required.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_product_data->'variants') variant
    where lower(trim(coalesce(variant->>'supplierId', variant->>'supplier', ''))) <> lower(trim(supplier.supplier_name))
  ) then
    raise exception 'The product must remain assigned to your supplier account.';
  end if;

  update public.marketplace_product_submissions
  set product_data = p_product_data,
      supplier_name = supplier.supplier_name
  where id = p_submission_id
  returning * into submission;

  update public.portal_notifications
  set title = 'Supplier product request',
      message = supplier.supplier_name || ' updated their new product request: ' || coalesce(nullif(trim(p_product_data->>'name'), ''), 'Marketplace product'),
      read_at = null
  where event_type = 'marketplace_product_request'
    and entity_id = p_submission_id::text;

  return to_jsonb(submission);
end;
$$;
revoke all on function public.update_marketplace_pending_product_request(uuid, jsonb) from public, anon;
grant execute on function public.update_marketplace_pending_product_request(uuid, jsonb) to authenticated;

create or replace function public.delete_marketplace_pending_product_request(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission public.marketplace_product_submissions;
begin
  select * into submission
  from public.marketplace_product_submissions request
  where request.id = p_submission_id
  for update;
  if not found or submission.supplier_user_id <> auth.uid() then
    raise exception 'This product request does not belong to your account.';
  end if;
  if submission.action <> 'add' or submission.status <> 'Pending Review' then
    raise exception 'Only a pending new-product request can be deleted.';
  end if;

  delete from public.portal_notifications
  where event_type = 'marketplace_product_request'
    and entity_id = p_submission_id::text;
  delete from public.marketplace_product_submissions where id = p_submission_id;
end;
$$;
revoke all on function public.delete_marketplace_pending_product_request(uuid) from public, anon;
grant execute on function public.delete_marketplace_pending_product_request(uuid) to authenticated;
