-- Let suppliers withdraw a rejected edit while keeping the unchanged catalog listing live.
create or replace function public.withdraw_rejected_marketplace_product_edit(p_submission_id uuid)
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
    raise exception 'This product edit does not belong to your account.';
  end if;
  if submission.action not in ('edit', 'edit_variant') or submission.status <> 'Rejected' then
    raise exception 'Only a rejected product edit can be withdrawn.';
  end if;

  delete from public.portal_notifications
  where event_type = 'marketplace_product_request'
    and entity_id = p_submission_id::text;
  delete from public.marketplace_product_submissions
  where id = p_submission_id;
end;
$$;
revoke all on function public.withdraw_rejected_marketplace_product_edit(uuid) from public, anon;
grant execute on function public.withdraw_rejected_marketplace_product_edit(uuid) to authenticated;
