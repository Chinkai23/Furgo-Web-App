-- Share active outlet names with customer booking pages while keeping outlet
-- administration metadata and team assignments private.
create or replace function public.get_service_outlets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('name', outlet.name) order by outlet.name),
    '[]'::jsonb
  )
  from public.admin_outlets outlet
  where outlet.active;
$$;

revoke all on function public.get_service_outlets() from public;
grant execute on function public.get_service_outlets() to anon, authenticated;
