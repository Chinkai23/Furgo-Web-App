-- Persistent per-user notifications for supplier product reviews and marketplace orders.
create table public.portal_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (event_type in ('marketplace_product_request', 'marketplace_order')),
  title text not null,
  message text not null,
  entity_id text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_user_id, event_type, entity_id)
);

create index portal_notifications_recipient_created_idx
  on public.portal_notifications (recipient_user_id, created_at desc);

alter table public.portal_notifications enable row level security;
create policy "Users read their portal notifications"
  on public.portal_notifications for select to authenticated
  using (recipient_user_id = (select auth.uid()));
create policy "Users mark their own portal notifications read"
  on public.portal_notifications for update to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));
grant select on public.portal_notifications to authenticated;
grant update (read_at) on public.portal_notifications to authenticated;

create or replace function public.notify_directors_of_marketplace_product_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_name text := coalesce(nullif(trim(new.product_data->>'name'), ''), 'a marketplace product');
  request_label text := case when new.action = 'edit' then 'product update request' else 'new product request' end;
begin
  if new.action not in ('add', 'edit') then return new; end if;

  insert into public.portal_notifications (recipient_user_id, event_type, title, message, entity_id)
  select recipients.user_id,
         'marketplace_product_request',
         'Supplier product request',
         new.supplier_name || ' submitted ' || request_label || ': ' || product_name,
         new.id::text
  from (
    select access.user_id from public.portal_access access where access.level = 'director'
    union
    select roles.user_id from public.user_roles roles where roles.role::text = 'admin'
  ) recipients
  on conflict (recipient_user_id, event_type, entity_id) do nothing;
  return new;
end;
$$;

drop trigger if exists marketplace_product_request_notification on public.marketplace_product_submissions;
create trigger marketplace_product_request_notification
after insert on public.marketplace_product_submissions
for each row execute function public.notify_directors_of_marketplace_product_request();

create or replace function public.notify_suppliers_of_marketplace_order_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_reference text;
  supplier_name text := coalesce(nullif(trim(new.item->>'supplierId'), ''), nullif(trim(new.item->>'supplier'), ''));
  product_name text := coalesce(nullif(trim(new.item->>'name'), ''), 'a product');
begin
  if supplier_name is null then return new; end if;

  select orders.reference into order_reference
  from public.marketplace_orders orders
  where orders.id = new.order_id;
  if order_reference is null then order_reference := new.order_id; end if;

  insert into public.portal_notifications (recipient_user_id, event_type, title, message, entity_id)
  select access.supplier_user_id,
         'marketplace_order',
         'New marketplace order',
         'Order ' || order_reference || ' includes ' || product_name || '.',
         new.order_id || ':' || access.supplier_user_id::text
  from public.marketplace_supplier_access access
  where lower(trim(access.supplier_name)) = lower(trim(supplier_name))
  on conflict (recipient_user_id, event_type, entity_id) do nothing;
  return new;
end;
$$;

drop trigger if exists marketplace_order_supplier_notification on public.marketplace_order_items;
create trigger marketplace_order_supplier_notification
after insert on public.marketplace_order_items
for each row execute function public.notify_suppliers_of_marketplace_order_item();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'portal_notifications'
     ) then
    alter publication supabase_realtime add table public.portal_notifications;
  end if;
end;
$$;
