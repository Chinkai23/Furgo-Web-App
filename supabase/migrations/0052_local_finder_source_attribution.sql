-- Keep the source and licence with imported Local Finder place records.
alter table public.local_finder_places
  add column if not exists source_provider text not null default '',
  add column if not exists source_url text not null default '',
  add column if not exists source_license text not null default '';

grant insert (source_provider, source_url, source_license)
  on public.local_finder_places to authenticated;
grant update (source_provider, source_url, source_license)
  on public.local_finder_places to authenticated;
