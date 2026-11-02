-- Persist Google-derived coordinates only for the permitted 30-day period.
-- Local Finder also invokes the cleanup RPC when customers/admins open the directory;
-- the optional cron job cleans them daily even when nobody visits the page.

alter table public.local_finder_places
  add column if not exists coordinates_source text not null default 'legacy',
  add column if not exists coordinates_expires_at timestamptz;

alter table public.local_finder_places
  drop constraint if exists local_finder_coordinates_source_check;
alter table public.local_finder_places
  add constraint local_finder_coordinates_source_check
  check (coordinates_source in ('google_places', 'google_geocoding', 'user_location', 'imported', 'legacy'));

grant insert (coordinates_source, coordinates_expires_at)
  on public.local_finder_places to authenticated;
grant update (coordinates_source, coordinates_expires_at)
  on public.local_finder_places to authenticated;

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
    if new.coordinates_source not in ('google_places', 'google_geocoding', 'user_location', 'imported') then
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

drop trigger if exists local_finder_set_coordinate_expiry on public.local_finder_places;
create trigger local_finder_set_coordinate_expiry
  before insert or update of latitude, longitude, coordinates_source, coordinates_expires_at
  on public.local_finder_places
  for each row execute function public.set_local_finder_coordinate_expiry();

create or replace function public.expire_local_finder_google_coordinates()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer;
begin
  update public.local_finder_places
  set latitude = null,
      longitude = null,
      coordinates_source = 'legacy',
      coordinates_expires_at = null,
      updated_at = now()
  where coordinates_source in ('google_places', 'google_geocoding')
    and coordinates_expires_at <= now();
  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

revoke all on function public.set_local_finder_coordinate_expiry() from public, anon, authenticated;
revoke all on function public.expire_local_finder_google_coordinates() from public, anon;
grant execute on function public.expire_local_finder_google_coordinates() to authenticated;

do $$
begin
  if to_regnamespace('cron') is not null then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = ''furgo-expire-local-finder-google-coordinates''';
    execute 'select cron.schedule(''furgo-expire-local-finder-google-coordinates'', ''15 0 * * *'', ''select public.expire_local_finder_google_coordinates()'')';
  end if;
end;
$$;
