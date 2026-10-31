-- Generate globally unique, supplier-branded voucher codes such as petdaily01.
create table if not exists public.marketplace_supplier_voucher_counters (
  prefix text primary key,
  next_number bigint not null check (next_number > 0)
);

alter table public.marketplace_supplier_voucher_counters enable row level security;
revoke all on public.marketplace_supplier_voucher_counters from public, anon, authenticated;

-- Normalize existing vouchers into the same format before enforcing global uniqueness.
with numbered as (
  select voucher.id,
         coalesce(nullif(left(regexp_replace(lower(access.supplier_name), '[^a-z0-9]', '', 'g'), 24), ''), 'supplier') as prefix,
         row_number() over (
           partition by coalesce(nullif(left(regexp_replace(lower(access.supplier_name), '[^a-z0-9]', '', 'g'), 24), ''), 'supplier')
           order by voucher.created_at, voucher.id
         ) as voucher_number
  from public.marketplace_supplier_vouchers voucher
  left join public.marketplace_supplier_access access
    on access.supplier_user_id = voucher.supplier_user_id
)
update public.marketplace_supplier_vouchers voucher
set code = left(numbered.prefix, greatest(1, 32 - greatest(2, length(numbered.voucher_number::text))))
           || case when length(numbered.voucher_number::text) < 2 then lpad(numbered.voucher_number::text, 2, '0') else numbered.voucher_number::text end
from numbered
where numbered.id = voucher.id;

alter table public.marketplace_supplier_vouchers
  drop constraint if exists marketplace_supplier_voucher_unique_code;

drop index if exists public.marketplace_supplier_vouchers_code_unique_idx;
create unique index marketplace_supplier_vouchers_code_unique_idx
  on public.marketplace_supplier_vouchers (code);

insert into public.marketplace_supplier_voucher_counters (prefix, next_number)
select coalesce(nullif(left(regexp_replace(lower(access.supplier_name), '[^a-z0-9]', '', 'g'), 24), ''), 'supplier') as prefix,
       count(*) + 1
from public.marketplace_supplier_vouchers voucher
left join public.marketplace_supplier_access access
  on access.supplier_user_id = voucher.supplier_user_id
group by 1
on conflict (prefix) do update
set next_number = greatest(public.marketplace_supplier_voucher_counters.next_number, excluded.next_number);

create or replace function public.generate_marketplace_supplier_voucher_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplier_prefix text;
  voucher_number bigint;
  number_text text;
begin
  if tg_op = 'UPDATE' then
    new.code := old.code;
    new.supplier_user_id := old.supplier_user_id;
    return new;
  end if;

  select coalesce(nullif(left(regexp_replace(lower(access.supplier_name), '[^a-z0-9]', '', 'g'), 24), ''), 'supplier')
    into supplier_prefix
  from public.marketplace_supplier_access access
  where access.supplier_user_id = new.supplier_user_id;

  if supplier_prefix is null then
    raise exception 'The supplier account is not linked to a company.';
  end if;

  insert into public.marketplace_supplier_voucher_counters (prefix, next_number)
  values (supplier_prefix, 2)
  on conflict (prefix) do update
    set next_number = public.marketplace_supplier_voucher_counters.next_number + 1
  returning next_number - 1 into voucher_number;

  number_text := voucher_number::text;
  new.code := left(supplier_prefix, greatest(1, 32 - greatest(2, length(number_text))))
              || case when length(number_text) < 2 then lpad(number_text, 2, '0') else number_text end;
  return new;
end;
$$;

revoke all on function public.generate_marketplace_supplier_voucher_code() from public, anon, authenticated;

drop trigger if exists marketplace_supplier_voucher_generate_code on public.marketplace_supplier_vouchers;
create trigger marketplace_supplier_voucher_generate_code
  before insert or update on public.marketplace_supplier_vouchers
  for each row execute function public.generate_marketplace_supplier_voucher_code();
