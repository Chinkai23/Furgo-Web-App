-- Section: Customer search analytics
-- Function: Count submitted searches, no-result terms, and selected destinations without storing customer identity.

create table public.search_analytics (
  id bigint generated always as identity primary key,
  search_term text not null check (char_length(search_term) between 1 and 80 and search_term = lower(btrim(search_term))),
  result_count smallint not null check (result_count between 0 and 1000),
  selected_type text check (selected_type is null or selected_type in ('product', 'service')),
  selected_key text check (selected_key is null or char_length(selected_key) <= 120),
  created_at timestamptz not null default now(),
  constraint search_analytics_no_email check (search_term !~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'),
  constraint search_analytics_no_phone check (search_term !~ '([+]?[0-9][0-9() .-]{7,}[0-9])'),
  constraint search_analytics_selection_pair check ((selected_type is null) = (selected_key is null))
);

create index search_analytics_created_at_idx on public.search_analytics (created_at desc);
create index search_analytics_term_created_at_idx on public.search_analytics (search_term, created_at desc);

alter table public.search_analytics enable row level security;

create policy "Signed-in customers can record searches"
  on public.search_analytics for insert to authenticated
  with check (true);

create policy "Only admins can read search analytics"
  on public.search_analytics for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'));

revoke all on public.search_analytics from anon, authenticated;
grant insert (search_term, result_count, selected_type, selected_key) on public.search_analytics to authenticated;
grant select on public.search_analytics to authenticated;
revoke all on sequence public.search_analytics_id_seq from anon, authenticated;
grant usage on sequence public.search_analytics_id_seq to authenticated;

-- Returns aggregate insights for the selected recent period; row access remains admin-only through RLS.
create or replace function public.get_search_analytics(p_days integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered as (
    select search_term, result_count, selected_type, selected_key, created_at
    from public.search_analytics
    where created_at >= now() - pg_catalog.make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)))
  ),
  term_totals as (
    select
      search_term,
      count(*)::bigint as searches,
      count(*) filter (where result_count = 0)::bigint as no_result_searches,
      count(*) filter (where selected_key is not null)::bigint as selected_count,
      max(created_at) as last_searched_at
    from filtered
    group by search_term
  ),
  clicked_totals as (
    select selected_type, selected_key, count(*)::bigint as clicks
    from filtered
    where selected_key is not null
    group by selected_type, selected_key
  )
  select pg_catalog.jsonb_build_object(
    'total_searches', (select count(*)::bigint from filtered),
    'no_result_searches', (select count(*)::bigint from filtered where result_count = 0),
    'top_terms', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'search_term', search_term,
        'searches', searches,
        'no_result_searches', no_result_searches,
        'selected_count', selected_count,
        'last_searched_at', last_searched_at
      ) order by searches desc, search_term asc)
      from (select * from term_totals order by searches desc, search_term asc limit 10) top_rows
    ), '[]'::jsonb),
    'no_result_terms', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'search_term', search_term,
        'searches', no_result_searches,
        'last_searched_at', last_searched_at
      ) order by no_result_searches desc, search_term asc)
      from (select * from term_totals where no_result_searches > 0 order by no_result_searches desc, search_term asc limit 10) no_result_rows
    ), '[]'::jsonb),
    'clicked_results', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'selected_type', selected_type,
        'selected_key', selected_key,
        'clicks', clicks
      ) order by clicks desc, selected_type asc, selected_key asc)
      from (select * from clicked_totals order by clicks desc, selected_type asc, selected_key asc limit 10) clicked_rows
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_search_analytics(integer) from public, anon;
grant execute on function public.get_search_analytics(integer) to authenticated;
