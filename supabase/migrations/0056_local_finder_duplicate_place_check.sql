-- Let authenticated users check for an exact normalized name + address match
-- without granting customers read access to pending submissions.
create or replace function public.find_local_finder_duplicate(p_name text, p_address text)
returns table(id uuid, name text, address text, category text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select place.id, place.name, place.address, place.category, place.status
  from public.local_finder_places as place
  where auth.uid() is not null
    and place.status in ('pending', 'approved')
    and regexp_replace(
      regexp_replace(lower(btrim(coalesce(place.name, ''))), '[^[:alnum:]]+', ' ', 'g'),
      '[[:space:]]+', ' ', 'g'
    ) = regexp_replace(
      regexp_replace(lower(btrim(coalesce(p_name, ''))), '[^[:alnum:]]+', ' ', 'g'),
      '[[:space:]]+', ' ', 'g'
    )
    and regexp_replace(
      regexp_replace(lower(btrim(coalesce(place.address, ''))), '[^[:alnum:]]+', ' ', 'g'),
      '[[:space:]]+', ' ', 'g'
    ) = regexp_replace(
      regexp_replace(lower(btrim(coalesce(p_address, ''))), '[^[:alnum:]]+', ' ', 'g'),
      '[[:space:]]+', ' ', 'g'
    )
  order by case when place.status = 'approved' then 0 else 1 end, place.created_at desc
  limit 1;
$$;

revoke all on function public.find_local_finder_duplicate(text, text) from public, anon;
grant execute on function public.find_local_finder_duplicate(text, text) to authenticated;
