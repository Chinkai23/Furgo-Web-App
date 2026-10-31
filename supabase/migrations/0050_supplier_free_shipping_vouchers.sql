-- Supplier Shop Vouchers can now waive their supplier's allocated shipping fee.
alter table public.marketplace_supplier_vouchers
  drop constraint if exists marketplace_supplier_vouchers_discount_type_check,
  drop constraint if exists marketplace_supplier_vouchers_discount_value_check,
  drop constraint if exists marketplace_supplier_voucher_percent_limit;

alter table public.marketplace_supplier_vouchers
  alter column discount_value drop not null,
  add constraint marketplace_supplier_voucher_type_valid
    check (discount_type in ('percent', 'fixed', 'free_shipping')),
  add constraint marketplace_supplier_voucher_value_valid
    check (
      (discount_type = 'free_shipping' and discount_value is null)
      or (discount_type = 'percent' and discount_value > 0 and discount_value <= 100)
      or (discount_type = 'fixed' and discount_value > 0)
    );
