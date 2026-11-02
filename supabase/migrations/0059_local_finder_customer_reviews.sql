-- Customer reviews for approved Local Finder places.
create table if not exists public.local_finder_reviews (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.local_finder_places(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reviewer_name text not null check (char_length(trim(reviewer_name)) between 1 and 100),
  review_text text not null check (char_length(trim(review_text)) between 5 and 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, user_id)
);

create index if not exists local_finder_reviews_place_created_idx
  on public.local_finder_reviews (place_id, created_at desc);

alter table public.local_finder_reviews enable row level security;

drop policy if exists "Customers read reviews for published places" on public.local_finder_reviews;
create policy "Customers read reviews for published places"
  on public.local_finder_reviews for select to authenticated
  using (
    exists (
      select 1 from public.local_finder_places place
      where place.id = local_finder_reviews.place_id and place.status = 'approved' and place.is_hidden = false
    )
  );

grant select on public.local_finder_reviews to authenticated;
revoke insert, update, delete on public.local_finder_reviews from anon, authenticated;

create or replace function public.submit_local_finder_review(p_place_id uuid, p_review text)
returns public.local_finder_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  reviewer text;
  saved_review public.local_finder_reviews%rowtype;
  cleaned_review text := trim(coalesce(p_review, ''));
begin
  if caller is null then
    raise exception 'Sign in to leave a review.';
  end if;
  if not public.has_role(caller, 'customer'::public.app_role)
    or public.current_portal_level(caller) <> 0 then
    raise exception 'Customer accounts can submit place reviews.';
  end if;
  if char_length(cleaned_review) < 5 or char_length(cleaned_review) > 1200 then
    raise exception 'Write a review between 5 and 1,200 characters.';
  end if;
  if not exists (
    select 1 from public.local_finder_places place
    where place.id = p_place_id and place.status = 'approved' and place.is_hidden = false
  ) then
    raise exception 'This place is no longer available for reviews.';
  end if;

  select coalesce(
    nullif(trim(profile.display_name), ''),
    nullif(trim(auth.jwt() -> 'user_metadata' ->> 'display_name'), ''),
    'Furgo user'
  )
  into reviewer
  from public.profiles profile
  where profile.id = caller;
  reviewer := coalesce(reviewer, nullif(trim(auth.jwt() -> 'user_metadata' ->> 'display_name'), ''), 'Furgo user');

  insert into public.local_finder_reviews (place_id, user_id, reviewer_name, review_text)
  values (p_place_id, caller, left(reviewer, 100), cleaned_review)
  on conflict (place_id, user_id) do update
    set reviewer_name = excluded.reviewer_name,
        review_text = excluded.review_text,
        updated_at = now()
  returning * into saved_review;

  return saved_review;
end;
$$;

revoke all on function public.submit_local_finder_review(uuid, text) from public, anon;
grant execute on function public.submit_local_finder_review(uuid, text) to authenticated;
