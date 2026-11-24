-- Restrict Warehouse Stock and warehouse catalogue rows to their owning Store account.
-- Legacy Marketplace products created from a Store submission are attributed to that Store.
update public.warehouse_products product
set created_by = (
      select request.supplier_user_id
      from public.marketplace_product_submissions request
      where request.action = 'add'
        and product.marketplace_product_id = 'supplier-' || request.id::text
      order by request.submitted_at desc
      limit 1
    ),
    updated_by = coalesce(
      product.updated_by,
      (
        select request.supplier_user_id
        from public.marketplace_product_submissions request
        where request.action = 'add'
          and product.marketplace_product_id = 'supplier-' || request.id::text
        order by request.submitted_at desc
        limit 1
      )
    )
where product.created_by is null
  and exists (
    select 1 from public.marketplace_product_submissions request
    where request.action = 'add'
      and product.marketplace_product_id = 'supplier-' || request.id::text
  );

-- Preserve ownership on lots already linked to an owned warehouse product.
update public.warehouse_inventory_lots lot
set created_by = product.created_by,
    updated_by = coalesce(lot.updated_by, product.created_by)
from public.warehouse_products product
where lot.created_by is null
  and lot.warehouse_product_id = product.id
  and product.created_by is not null;

drop policy if exists "Store portal staff read warehouse products" on public.warehouse_products;
drop policy if exists "Store portal staff add warehouse products" on public.warehouse_products;
drop policy if exists "Store portal staff edit warehouse products" on public.warehouse_products;
drop policy if exists "Store portal staff remove warehouse products" on public.warehouse_products;

create policy "Store account reads its warehouse products"
  on public.warehouse_products for select to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = (select auth.uid())
    )
  );

create policy "Store account adds its warehouse products"
  on public.warehouse_products for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = (select auth.uid())
    )
  );

create policy "Store account edits its warehouse products"
  on public.warehouse_products for update to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = (select auth.uid())
    )
  )
  with check (
    created_by = (select auth.uid())
    and updated_by = (select auth.uid())
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = (select auth.uid())
    )
  );

create policy "Store account removes its warehouse products"
  on public.warehouse_products for delete to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = (select auth.uid())
    )
  );

drop policy if exists "Store portal staff read warehouse inventory" on public.warehouse_inventory_lots;
drop policy if exists "Store portal staff add warehouse inventory" on public.warehouse_inventory_lots;
drop policy if exists "Store portal staff update warehouse inventory" on public.warehouse_inventory_lots;
drop policy if exists "Store portal staff remove warehouse inventory" on public.warehouse_inventory_lots;

create policy "Store account reads its warehouse inventory"
  on public.warehouse_inventory_lots for select to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = (select auth.uid())
    )
  );

create policy "Store account adds its warehouse inventory"
  on public.warehouse_inventory_lots for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (warehouse_product_id is null or exists (
      select 1 from public.warehouse_products product
      where product.id = warehouse_product_id
        and product.created_by = (select auth.uid())
    ))
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = (select auth.uid())
    )
  );

create policy "Store account updates its warehouse inventory"
  on public.warehouse_inventory_lots for update to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = (select auth.uid())
    )
  )
  with check (
    created_by = (select auth.uid())
    and updated_by = (select auth.uid())
    and (warehouse_product_id is null or exists (
      select 1 from public.warehouse_products product
      where product.id = warehouse_product_id
        and product.created_by = (select auth.uid())
    ))
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = (select auth.uid())
    )
  );

create policy "Store account removes its warehouse inventory"
  on public.warehouse_inventory_lots for delete to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = (select auth.uid())
    )
  );
