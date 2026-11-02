-- Track OpenStreetMap Nominatim coordinates separately from imported and Google data.
-- OSM coordinate data does not use Google's 30-day retention window.

alter table public.local_finder_places
  drop constraint if exists local_finder_coordinates_source_check;
alter table public.local_finder_places
  add constraint local_finder_coordinates_source_check
  check (coordinates_source in (
    'google_places',
    'google_geocoding',
    'openstreetmap_nominatim',
    'user_location',
    'imported',
    'legacy'
  ));

create or replace function public.set_local_finder_coordinate_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  coordinates_changed boolean;
begin
  coordinates_changed := tg_op = 'INSERT'
    or new.latitude is distinct from old.latitude
    or new.longitude is distinct from old.longitude;

  if new.latitude is null or new.longitude is null then
    new.coordinates_source := 'legacy';
    new.coordinates_expires_at := null;
  elsif coordinates_changed then
    if new.coordinates_source not in (
      'google_places', 'google_geocoding', 'openstreetmap_nominatim', 'user_location', 'imported'
    ) then
      new.coordinates_source := 'imported';
    end if;
    if new.coordinates_source in ('google_places', 'google_geocoding') then
      if new.coordinates_expires_at is null or new.coordinates_expires_at <= now()
        or new.coordinates_expires_at > now() + interval '30 days' then
        new.coordinates_expires_at := now() + interval '30 days';
      end if;
    else
      new.coordinates_expires_at := null;
    end if;
  elsif new.coordinates_source in ('google_places', 'google_geocoding') then
    if new.coordinates_expires_at is null or new.coordinates_expires_at > now() + interval '30 days' then
      new.coordinates_expires_at := now() + interval '30 days';
    end if;
  else
    new.coordinates_expires_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.set_local_finder_coordinate_expiry() from public, anon, authenticated;
