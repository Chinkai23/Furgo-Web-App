-- Shared warehouse stock lots for internal Store Portal staff.
-- Inventory is intentionally separate from Marketplace listing stock.

create table if not exists public.warehouse_inventory_lots (
  id uuid primary key default gen_random_uuid(),
  product_name text not null check (char_length(trim(product_name)) between 1 and 120),
  sku text check (sku is null or char_length(sku) <= 80),
  variant text check (variant is null or char_length(variant) <= 100),
  batch_number text check (batch_number is null or char_length(batch_number) <= 100),
  quantity integer not null default 0 check (quantity >= 0),
  received_on date not null default current_date,
  expires_on date,
  location text check (location is null or char_length(location) <= 100),
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists warehouse_inventory_lots_expiry_idx
  on public.warehouse_inventory_lots (expires_on asc nulls last);
create index if not exists warehouse_inventory_lots_product_idx
  on public.warehouse_inventory_lots (lower(product_name), sku);

alter table public.warehouse_inventory_lots enable row level security;

drop policy if exists "Store portal staff read warehouse inventory" on public.warehouse_inventory_lots;
create policy "Store portal staff read warehouse inventory"
  on public.warehouse_inventory_lots for select to authenticated
  using (
    exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = auth.uid()
    )
  );

drop policy if exists "Store portal staff add warehouse inventory" on public.warehouse_inventory_lots;
create policy "Store portal staff add warehouse inventory"
  on public.warehouse_inventory_lots for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = auth.uid()
    )
  );

drop policy if exists "Store portal staff update warehouse inventory" on public.warehouse_inventory_lots;
create policy "Store portal staff update warehouse inventory"
  on public.warehouse_inventory_lots for update to authenticated
  using (
    exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = auth.uid()
    )
  )
  with check (
    updated_by = auth.uid()
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = auth.uid()
    )
  );

drop policy if exists "Store portal staff remove warehouse inventory" on public.warehouse_inventory_lots;
create policy "Store portal staff remove warehouse inventory"
  on public.warehouse_inventory_lots for delete to authenticated
  using (
    exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.warehouse_inventory_lots to authenticated;
