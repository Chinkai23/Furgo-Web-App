-- Make the warehouse product catalogue the source catalogue for Marketplace listings.
create table if not exists public.warehouse_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  product_data jsonb not null check (jsonb_typeof(product_data) = 'object'),
  marketplace_product_id text unique,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists warehouse_products_name_idx on public.warehouse_products (lower(name));

alter table public.warehouse_inventory_lots
  add column if not exists warehouse_product_id uuid references public.warehouse_products(id) on delete set null;
create index if not exists warehouse_inventory_lots_product_id_idx
  on public.warehouse_inventory_lots (warehouse_product_id, variant);

alter table public.warehouse_products enable row level security;
drop policy if exists "Store portal staff read warehouse products" on public.warehouse_products;
create policy "Store portal staff read warehouse products" on public.warehouse_products
  for select to authenticated using (
    exists (select 1 from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid())
  );
drop policy if exists "Store portal staff add warehouse products" on public.warehouse_products;
create policy "Store portal staff add warehouse products" on public.warehouse_products
  for insert to authenticated with check (
    created_by = auth.uid()
    and exists (select 1 from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid())
  );
drop policy if exists "Store portal staff edit warehouse products" on public.warehouse_products;
create policy "Store portal staff edit warehouse products" on public.warehouse_products
  for update to authenticated using (
    exists (select 1 from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid())
  ) with check (
    updated_by = auth.uid()
    and exists (select 1 from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid())
  );
drop policy if exists "Store portal staff remove warehouse products" on public.warehouse_products;
create policy "Store portal staff remove warehouse products" on public.warehouse_products
  for delete to authenticated using (
    exists (select 1 from public.marketplace_supplier_access access where access.supplier_user_id = auth.uid())
  );
grant select, insert, update, delete on public.warehouse_products to authenticated;

-- Require every new Marketplace listing to point at a warehouse catalogue
-- product, and bind the warehouse record to its single Marketplace listing.
create or replace function public.enforce_warehouse_product_marketplace_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  warehouse_product public.warehouse_products;
  warehouse_product_id text;
begin
  if new.action <> 'add' then return new; end if;

  warehouse_product_id := coalesce(new.product_data->>'warehouseProductId', '');
  if warehouse_product_id = '' then
    raise exception 'Choose a product from Warehouse Stock before listing it in the Marketplace.';
  end if;

  select * into warehouse_product
  from public.warehouse_products product
  where product.id::text = warehouse_product_id;
  if not found then
    raise exception 'The selected Warehouse Stock product no longer exists.';
  end if;
  if warehouse_product.marketplace_product_id is not null
    and warehouse_product.marketplace_product_id <> ('supplier-' || new.id::text) then
    raise exception 'This warehouse product already has a Marketplace listing.';
  end if;

  return new;
end;
$$;
revoke all on function public.enforce_warehouse_product_marketplace_source() from public, anon, authenticated;

create or replace function public.link_warehouse_product_marketplace_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.action = 'add' then
    update public.warehouse_products
    set marketplace_product_id = 'supplier-' || new.id::text,
        updated_by = auth.uid(),
        updated_at = now()
    where id::text = new.product_data->>'warehouseProductId';
  end if;
  return new;
end;
$$;
revoke all on function public.link_warehouse_product_marketplace_listing() from public, anon, authenticated;

drop trigger if exists marketplace_add_requires_warehouse_product on public.marketplace_product_submissions;
create trigger marketplace_add_requires_warehouse_product
  before insert
  on public.marketplace_product_submissions
  for each row execute function public.enforce_warehouse_product_marketplace_source();

drop trigger if exists marketplace_add_update_requires_warehouse_product on public.marketplace_product_submissions;
create trigger marketplace_add_update_requires_warehouse_product
  before update of action, product_data
  on public.marketplace_product_submissions
  for each row execute function public.enforce_warehouse_product_marketplace_source();

drop trigger if exists marketplace_add_links_warehouse_product on public.marketplace_product_submissions;
create trigger marketplace_add_links_warehouse_product
  after insert
  on public.marketplace_product_submissions
  for each row execute function public.link_warehouse_product_marketplace_listing();

-- Preserve the existing live Marketplace catalogue by registering each current listing as a warehouse product.
insert into public.warehouse_products (name, product_data, marketplace_product_id)
select product->>'name', product, product->>'id'
from public.app_data data
cross join lateral jsonb_array_elements(case when jsonb_typeof(data.payload) = 'array' then data.payload else '[]'::jsonb end) product
where data.record_id = 'shared:furgo-demo-marketplace-products:shared'
  and nullif(trim(product->>'name'), '') is not null
  and nullif(trim(product->>'id'), '') is not null
on conflict (marketplace_product_id) do nothing;

-- Attach previously entered warehouse lots to the matching seeded listing when possible.
update public.warehouse_inventory_lots lot
set warehouse_product_id = product.id
from public.warehouse_products product
where lot.warehouse_product_id is null
  and lower(trim(lot.product_name)) = lower(trim(product.name));
