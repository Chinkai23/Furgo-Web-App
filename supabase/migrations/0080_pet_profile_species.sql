-- Section: Pet species
-- Function: Store whether each pet is a dog or cat so the profile form can offer matching breeds.

alter table public.pet_profiles
  add column if not exists species text not null default 'Dog';

-- Preserve the species for existing profiles whose saved breed clearly identifies a cat.
update public.pet_profiles
set species = 'Cat'
where lower(btrim(breed)) = any (array[
  'domestic shorthair',
  'domestic longhair',
  'persian',
  'siamese',
  'british shorthair',
  'ragdoll',
  'maine coon',
  'bengal',
  'scottish fold',
  'american shorthair',
  'exotic shorthair',
  'russian blue',
  'sphynx',
  'birman',
  'abyssinian',
  'british longhair',
  'turkish angora',
  'oriental shorthair',
  'norwegian forest cat',
  'mixed breed cat'
]);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pet_profiles_species_check'
      and conrelid = 'public.pet_profiles'::regclass
  ) then
    alter table public.pet_profiles
      add constraint pet_profiles_species_check check (species in ('Dog', 'Cat'));
  end if;
end;
$$;
