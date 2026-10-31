-- Split the Local Finder admin dashboard from its review and published-place workspaces.
-- Customers can only read visible published listings; they cannot inspect review outcomes.

alter table public.local_finder_places
  add column if not exists is_hidden boolean not null default false;

drop policy if exists "Customers and admins view Local Finder places" on public.local_finder_places;
create policy "Customers and admins view Local Finder places"
  on public.local_finder_places for select to authenticated
  using ((status = 'approved' and is_hidden = false) or (select public.current_portal_level(auth.uid())) >= 2);

drop policy if exists "Customers and managers read Local Finder edit suggestions" on public.local_finder_place_edits;
create policy "Managers read Local Finder edit suggestions"
  on public.local_finder_place_edits for select to authenticated
  using ((select public.current_portal_level(auth.uid())) >= 2);

grant update (is_hidden) on public.local_finder_places to authenticated;

drop policy if exists "Customers recommend Local Finder places" on public.local_finder_recommendations;
create policy "Customers recommend Local Finder places"
  on public.local_finder_recommendations for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.has_role(auth.uid(), 'customer'::public.app_role))
    and (select public.current_portal_level(auth.uid())) = 0
    and exists (select 1 from public.local_finder_places p where p.id = place_id and p.status = 'approved' and p.is_hidden = false)
  );

-- A bulk review call changes every still-pending selected place atomically.
create or replace function public.review_local_finder_submissions(p_place_ids uuid[], p_approve boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  reviewed_count integer;
  requested_count integer := coalesce(cardinality(p_place_ids), 0);
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 2 then
    raise exception 'Manager or Director access is required.';
  end if;
  if p_approve is null then raise exception 'Choose approve or reject.'; end if;
  if requested_count = 0 then raise exception 'Select at least one place to review.'; end if;

  update public.local_finder_places
  set status = case when p_approve then 'approved' else 'rejected' end,
      rejection_reason = '',
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = any(p_place_ids) and status = 'pending';

  get diagnostics reviewed_count = row_count;
  return jsonb_build_object(
    'ok', true,
    'reviewed_count', reviewed_count,
    'requested_count', requested_count,
    'status', case when p_approve then 'approved' else 'rejected' end
  );
end;
$$;
revoke all on function public.review_local_finder_submissions(uuid[], boolean) from public, anon;
grant execute on function public.review_local_finder_submissions(uuid[], boolean) to authenticated;

-- Keep the existing single-place RPC callable by older clients, without a rejection reason.
create or replace function public.review_local_finder_submission(p_place_id uuid, p_approve boolean, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  result := public.review_local_finder_submissions(array[p_place_id], p_approve);
  if coalesce((result->>'reviewed_count')::integer, 0) = 0 then
    raise exception 'This place is no longer awaiting review.';
  end if;
  return result;
end;
$$;
revoke all on function public.review_local_finder_submission(uuid, boolean, text) from public, anon;
grant execute on function public.review_local_finder_submission(uuid, boolean, text) to authenticated;

-- Hidden listings are excluded from public recommendation counts and customer pages.
create or replace function public.get_local_finder_recommendation_counts()
returns table (place_id uuid, recommendation_count bigint, recommended_by_me boolean)
language sql stable security definer set search_path = '' as $$
  select place.id, count(recommendation.user_id), coalesce(bool_or(recommendation.user_id = auth.uid()), false)
  from public.local_finder_places place
  left join public.local_finder_recommendations recommendation on recommendation.place_id = place.id
  where place.status = 'approved' and place.is_hidden = false
  group by place.id;
$$;
revoke all on function public.get_local_finder_recommendation_counts() from public, anon;
grant execute on function public.get_local_finder_recommendation_counts() to authenticated;

-- Customer edit submissions are also private after submission; review decisions stay internal.
create or replace function public.review_local_finder_place_edit(p_edit_id uuid, p_approve boolean, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  change public.local_finder_place_edits%rowtype;
  place_name text;
  proposed jsonb;
  new_latitude double precision;
  new_longitude double precision;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 2 then raise exception 'Manager or Director access is required.'; end if;
  if p_approve is null then raise exception 'Choose approve or reject.'; end if;
  select * into change from public.local_finder_place_edits where id = p_edit_id and status = 'pending' for update;
  if not found then raise exception 'This edit is no longer awaiting review.'; end if;
  proposed := change.proposed_changes;
  if p_approve then
    if proposed ? 'category' and proposed->>'category' not in ('cafe', 'park', 'clinic', 'event') then raise exception 'The suggested category is invalid.'; end if;
    new_latitude := case when proposed ? 'latitude' and proposed->>'latitude' is not null then (proposed->>'latitude')::double precision else null end;
    new_longitude := case when proposed ? 'longitude' and proposed->>'longitude' is not null then (proposed->>'longitude')::double precision else null end;
    if (new_latitude is null) <> (new_longitude is null) then raise exception 'Both map coordinates are required.'; end if;
    update public.local_finder_places set
      name = coalesce(nullif(trim(proposed->>'name'), ''), name),
      category = coalesce(nullif(proposed->>'category', ''), category),
      address = coalesce(nullif(trim(proposed->>'address'), ''), address),
      city = coalesce(proposed->>'city', city), state = coalesce(proposed->>'state', state),
      latitude = case when proposed ? 'latitude' then new_latitude else latitude end,
      longitude = case when proposed ? 'longitude' then new_longitude else longitude end,
      allowed_area = coalesce(proposed->>'allowed_area', allowed_area),
      pet_allowed = coalesce(proposed->>'pet_allowed', pet_allowed),
      pet_size = coalesce(proposed->>'pet_size', pet_size),
      conditions = coalesce(proposed->>'conditions', conditions),
      opening_hours = coalesce(proposed->'opening_hours', opening_hours),
      phone = coalesce(proposed->>'phone', phone), website = coalesce(proposed->>'website', website),
      photo_url = coalesce(proposed->>'photo_url', photo_url), updated_at = now()
    where id = change.place_id returning name into place_name;
  end if;
  update public.local_finder_place_edits set
    status = case when p_approve then 'approved' else 'rejected' end,
    rejection_reason = '', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_edit_id;
  return jsonb_build_object('ok', true, 'status', case when p_approve then 'approved' else 'rejected' end, 'name', coalesce(place_name, ''));
end;
$$;
revoke all on function public.review_local_finder_place_edit(uuid, boolean, text) from public, anon;
grant execute on function public.review_local_finder_place_edit(uuid, boolean, text) to authenticated;

-- Customers do not receive a notification when their place or edit is approved or rejected.
drop trigger if exists local_finder_place_result_notification on public.local_finder_places;
drop trigger if exists local_finder_edit_result_notification on public.local_finder_place_edits;
delete from public.portal_notifications where event_type = 'local_finder_review_result';
