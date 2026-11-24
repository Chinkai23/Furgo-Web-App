-- Notify Directors/Admins when a Seller submits or resubmits a product request.
-- The Store/Supplier notification trigger covers the retired Store product
-- review flow and does not observe marketplace_seller_product_submissions.

create or replace function public.notify_admins_of_seller_product_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  seller_business text;
  product_name text := coalesce(nullif(trim(new.product_data->>'name'), ''), 'a Marketplace product');
  request_label text := case when new.request_type = 'Product Edit' then 'product update request' else 'new product request' end;
begin
  if new.status <> 'Pending Review' then return new; end if;

  select profile.business_name into seller_business
  from public.marketplace_seller_profiles profile
  where profile.id = new.seller_id;
  seller_business := coalesce(nullif(trim(seller_business), ''), 'A seller');

  insert into public.portal_notifications (recipient_user_id, event_type, title, message, entity_id)
  select recipients.user_id,
         'marketplace_product_request',
         'Seller product request',
         seller_business || ' submitted a ' || request_label || ': ' || product_name,
         new.id::text
  from (
    select access.user_id
    from public.portal_access access
    where access.level = 'director'
    union
    select roles.user_id
    from public.user_roles roles
    where roles.role::text = 'admin'
  ) recipients
  on conflict (recipient_user_id, event_type, entity_id) do update
    set title = excluded.title,
        message = excluded.message,
        read_at = null,
        created_at = now();

  return new;
end;
$$;

revoke all on function public.notify_admins_of_seller_product_request() from public, anon, authenticated;

drop trigger if exists seller_product_request_admin_notification on public.marketplace_seller_product_submissions;
create trigger seller_product_request_admin_notification
after insert on public.marketplace_seller_product_submissions
for each row execute function public.notify_admins_of_seller_product_request();

drop trigger if exists seller_product_resubmission_admin_notification on public.marketplace_seller_product_submissions;
create trigger seller_product_resubmission_admin_notification
after update of status, submitted_at on public.marketplace_seller_product_submissions
for each row
when (new.status = 'Pending Review')
execute function public.notify_admins_of_seller_product_request();

-- Backfill notifications for requests that were already awaiting review when
-- this migration is applied.
insert into public.portal_notifications (recipient_user_id, event_type, title, message, entity_id)
select recipients.user_id,
       'marketplace_product_request',
       'Seller product request',
       coalesce(nullif(trim(seller.business_name), ''), 'A seller') || ' submitted a '
         || case when request.request_type = 'Product Edit' then 'product update request' else 'new product request' end
         || ': ' || coalesce(nullif(trim(request.product_data->>'name'), ''), 'a Marketplace product'),
       request.id::text
from public.marketplace_seller_product_submissions request
join public.marketplace_seller_profiles seller on seller.id = request.seller_id
cross join (
  select access.user_id from public.portal_access access where access.level = 'director'
  union
  select roles.user_id from public.user_roles roles where roles.role::text = 'admin'
) recipients
where request.status = 'Pending Review'
on conflict (recipient_user_id, event_type, entity_id) do nothing;
