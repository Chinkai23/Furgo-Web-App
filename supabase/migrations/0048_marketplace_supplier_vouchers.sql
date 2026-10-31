-- Supplier-managed Marketplace vouchers with scoped supplier access and public
-- read access only to currently active offers.
create table if not exists public.marketplace_supplier_vouchers (
  id uuid primary key default gen_random_uuid(),
  supplier_user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  minimum_spend numeric(10,2) not null default 0 check (minimum_spend >= 0),
  expires_at date,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_supplier_voucher_code_nonempty check (length(trim(code)) between 1 and 32),
  constraint marketplace_supplier_voucher_percent_limit check (discount_type <> 'percent' or discount_value <= 100),
  constraint marketplace_supplier_voucher_unique_code unique (supplier_user_id, code)
);

create index if not exists marketplace_supplier_vouchers_supplier_idx
  on public.marketplace_supplier_vouchers (supplier_user_id, created_at desc);

alter table public.marketplace_supplier_vouchers enable row level security;

drop policy if exists "Supplier and admin can read supplier vouchers" on public.marketplace_supplier_vouchers;
create policy "Supplier and admin can read supplier vouchers"
  on public.marketplace_supplier_vouchers for select to authenticated
  using (
    supplier_user_id = auth.uid()
    or coalesce(public.current_portal_level(auth.uid()), 0) >= 1
  );

drop policy if exists "Supplier can create own vouchers" on public.marketplace_supplier_vouchers;
create policy "Supplier can create own vouchers"
  on public.marketplace_supplier_vouchers for insert to authenticated
  with check (
    supplier_user_id = auth.uid()
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = auth.uid()
    )
  );

drop policy if exists "Supplier can update own vouchers" on public.marketplace_supplier_vouchers;
create policy "Supplier can update own vouchers"
  on public.marketplace_supplier_vouchers for update to authenticated
  using (supplier_user_id = auth.uid())
  with check (
    supplier_user_id = auth.uid()
    and exists (
      select 1 from public.marketplace_supplier_access access
      where access.supplier_user_id = auth.uid()
    )
  );

drop policy if exists "Supplier can delete own vouchers" on public.marketplace_supplier_vouchers;
create policy "Supplier can delete own vouchers"
  on public.marketplace_supplier_vouchers for delete to authenticated
  using (supplier_user_id = auth.uid());

grant select, insert, update, delete on public.marketplace_supplier_vouchers to authenticated;

create or replace function public.get_marketplace_shop_vouchers()
returns table (
  id uuid,
  supplier_name text,
  code text,
  discount_type text,
  discount_value numeric,
  minimum_spend numeric,
  expires_at date
)
language sql
stable
security definer
set search_path = ''
as $$
  select voucher.id, access.supplier_name, voucher.code, voucher.discount_type,
         voucher.discount_value, voucher.minimum_spend, voucher.expires_at
  from public.marketplace_supplier_vouchers voucher
  join public.marketplace_supplier_access access
    on access.supplier_user_id = voucher.supplier_user_id
  where voucher.enabled
    and (voucher.expires_at is null or voucher.expires_at >= current_date)
  order by access.supplier_name, voucher.created_at desc;
$$;

revoke all on function public.get_marketplace_shop_vouchers() from public;
grant execute on function public.get_marketplace_shop_vouchers() to anon, authenticated;

create or replace function public.touch_marketplace_supplier_voucher_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists marketplace_supplier_vouchers_updated_at on public.marketplace_supplier_vouchers;
create trigger marketplace_supplier_vouchers_updated_at
  before update on public.marketplace_supplier_vouchers
  for each row execute function public.touch_marketplace_supplier_voucher_updated_at();
