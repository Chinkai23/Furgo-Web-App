-- Retire the unused Store/Shop voucher system.
-- This permanently deletes existing seller/store voucher records and code counters.
-- Furgo coin exchange vouchers are stored separately and are not affected.

begin;

drop function if exists public.get_marketplace_shop_vouchers();

drop table if exists public.marketplace_supplier_vouchers;
drop table if exists public.marketplace_supplier_voucher_counters;

-- Dropping the voucher table also removes its triggers and their dependencies.
drop function if exists public.generate_marketplace_supplier_voucher_code();
drop function if exists public.touch_marketplace_supplier_voucher_updated_at();

commit;
