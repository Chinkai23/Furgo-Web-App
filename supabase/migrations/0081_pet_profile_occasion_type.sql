-- Store whether a pet profile date is a birthday or an adoption day.
-- Nullable keeps existing profiles compatible until their owner chooses a type.
alter table public.pet_profiles
  add column if not exists birth_date_type text;

alter table public.pet_profiles
  drop constraint if exists pet_profiles_birth_date_type_check;

alter table public.pet_profiles
  add constraint pet_profiles_birth_date_type_check
  check (birth_date_type is null or birth_date_type in ('birthday', 'adoption'));

notify pgrst, 'reload schema';
