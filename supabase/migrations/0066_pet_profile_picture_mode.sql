-- Persist whether a pet's visible profile picture is their uploaded photo or saved avatar.
alter table public.pet_profiles
  add column if not exists profile_picture_mode text not null default 'default'
    check (profile_picture_mode in ('default', 'photo', 'avatar'));

-- Keep existing uploaded profile pictures visible after the mode becomes cloud-backed.
update public.pet_profiles
set profile_picture_mode = 'photo'
where photo_path is not null
  and profile_picture_mode = 'default';

notify pgrst, 'reload schema';
