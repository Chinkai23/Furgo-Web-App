-- Customer-submitted Local Finder places and edit suggestions require admin review.
create table if not exists public.local_finder_places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 140),
  category text not null check (category in ('cafe', 'park', 'clinic', 'event')),
  address text not null check (char_length(trim(address)) between 3 and 500),
  city text not null default '',
  state text not null default '',
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  allowed_area text not null default '',
  pet_allowed text not null default '',
  pet_size text not null default '',
  conditions text not null default '',
  opening_hours jsonb not null default '{}'::jsonb,
  phone text not null default '',
  website text not null default '',
  photo_url text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_verified boolean not null default false,
  rejection_reason text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check ((latitude is null) = (longitude is null))
);

create index if not exists local_finder_places_public_category_idx
  on public.local_finder_places (category, status, created_at desc);
create index if not exists local_finder_places_created_by_idx
  on public.local_finder_places (created_by, created_at desc);

create table if not exists public.local_finder_place_edits (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.local_finder_places(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete cascade,
  proposed_changes jsonb not null check (jsonb_typeof(proposed_changes) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists local_finder_place_edits_status_idx
  on public.local_finder_place_edits (status, created_at desc);

create table if not exists public.local_finder_recommendations (
  place_id uuid not null references public.local_finder_places(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (place_id, user_id)
);

alter table public.local_finder_places enable row level security;
alter table public.local_finder_place_edits enable row level security;
alter table public.local_finder_recommendations enable row level security;

drop policy if exists "Customers and admins view Local Finder places" on public.local_finder_places;
create policy "Customers and admins view Local Finder places"
  on public.local_finder_places for select to authenticated
  using (status = 'approved' or created_by = (select auth.uid()) or (select public.current_portal_level(auth.uid())) >= 2);
drop policy if exists "Customers submit pending Local Finder places" on public.local_finder_places;
create policy "Customers submit pending Local Finder places"
  on public.local_finder_places for insert to authenticated
  with check (
    created_by = (select auth.uid()) and status = 'pending' and is_verified = false
    and rejection_reason = '' and reviewed_by is null and reviewed_at is null
    and (select public.has_role(auth.uid(), 'customer'::public.app_role))
    and (select public.current_portal_level(auth.uid())) = 0
  );
drop policy if exists "Managers add Local Finder places" on public.local_finder_places;
create policy "Managers add Local Finder places"
  on public.local_finder_places for insert to authenticated
  with check ((select public.current_portal_level(auth.uid())) >= 2 and created_by = (select auth.uid()));
drop policy if exists "Managers update Local Finder places" on public.local_finder_places;
create policy "Managers update Local Finder places"
  on public.local_finder_places for update to authenticated
  using ((select public.current_portal_level(auth.uid())) >= 2)
  with check ((select public.current_portal_level(auth.uid())) >= 2);
drop policy if exists "Managers delete Local Finder places" on public.local_finder_places;
create policy "Managers delete Local Finder places"
  on public.local_finder_places for delete to authenticated
  using ((select public.current_portal_level(auth.uid())) >= 2);

drop policy if exists "Customers submit Local Finder edit suggestions" on public.local_finder_place_edits;
create policy "Customers submit Local Finder edit suggestions"
  on public.local_finder_place_edits for insert to authenticated
  with check (
    submitted_by = (select auth.uid()) and status = 'pending'
    and (select public.has_role(auth.uid(), 'customer'::public.app_role))
    and (select public.current_portal_level(auth.uid())) = 0
  );
drop policy if exists "Customers and managers read Local Finder edit suggestions" on public.local_finder_place_edits;
create policy "Customers and managers read Local Finder edit suggestions"
  on public.local_finder_place_edits for select to authenticated
  using (submitted_by = (select auth.uid()) or (select public.current_portal_level(auth.uid())) >= 2);
drop policy if exists "Managers review Local Finder edit suggestions" on public.local_finder_place_edits;
create policy "Managers review Local Finder edit suggestions"
  on public.local_finder_place_edits for update to authenticated
  using ((select public.current_portal_level(auth.uid())) >= 2)
  with check ((select public.current_portal_level(auth.uid())) >= 2);

drop policy if exists "Customers view Local Finder recommendations" on public.local_finder_recommendations;
create policy "Customers view Local Finder recommendations"
  on public.local_finder_recommendations for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Customers recommend Local Finder places" on public.local_finder_recommendations;
create policy "Customers recommend Local Finder places"
  on public.local_finder_recommendations for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.has_role(auth.uid(), 'customer'::public.app_role))
    and (select public.current_portal_level(auth.uid())) = 0
    and exists (select 1 from public.local_finder_places p where p.id = place_id and p.status = 'approved')
  );
drop policy if exists "Customers remove own Local Finder recommendations" on public.local_finder_recommendations;
create policy "Customers remove own Local Finder recommendations"
  on public.local_finder_recommendations for delete to authenticated
  using (user_id = (select auth.uid()));

grant select on public.local_finder_places, public.local_finder_place_edits, public.local_finder_recommendations to authenticated;
grant insert (name, category, address, city, state, latitude, longitude, allowed_area, pet_allowed, pet_size, conditions, opening_hours, phone, website, photo_url, status, is_verified, rejection_reason, created_by, reviewed_by, reviewed_at)
  on public.local_finder_places to authenticated;
grant update (name, category, address, city, state, latitude, longitude, allowed_area, pet_allowed, pet_size, conditions, opening_hours, phone, website, photo_url, status, is_verified, rejection_reason, reviewed_by, reviewed_at, updated_at)
  on public.local_finder_places to authenticated;
grant delete on public.local_finder_places to authenticated;
grant insert (place_id, submitted_by, proposed_changes, status) on public.local_finder_place_edits to authenticated;
grant update (status, rejection_reason, reviewed_by, reviewed_at) on public.local_finder_place_edits to authenticated;
grant insert (place_id, user_id) on public.local_finder_recommendations to authenticated;
grant delete on public.local_finder_recommendations to authenticated;

create or replace function public.get_local_finder_recommendation_counts()
returns table (place_id uuid, recommendation_count bigint, recommended_by_me boolean)
language sql stable security definer set search_path = '' as $$
  select place.id, count(recommendation.user_id), coalesce(bool_or(recommendation.user_id = auth.uid()), false)
  from public.local_finder_places place
  left join public.local_finder_recommendations recommendation on recommendation.place_id = place.id
  where place.status = 'approved'
  group by place.id;
$$;
revoke all on function public.get_local_finder_recommendation_counts() from public, anon;
grant execute on function public.get_local_finder_recommendation_counts() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('local-finder-photos', 'local-finder-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Public can view Local Finder photos" on storage.objects;
create policy "Public can view Local Finder photos" on storage.objects for select to anon, authenticated using (bucket_id = 'local-finder-photos');
drop policy if exists "Customers and managers upload Local Finder photos" on storage.objects;
create policy "Customers and managers upload Local Finder photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'local-finder-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and ((select public.has_role(auth.uid(), 'customer'::public.app_role)) or (select public.current_portal_level(auth.uid())) >= 2)
  );
drop policy if exists "Customers and managers delete own Local Finder photos" on storage.objects;
create policy "Customers and managers delete own Local Finder photos" on storage.objects for delete to authenticated
  using ((bucket_id = 'local-finder-photos' and (storage.foldername(name))[1] = (select auth.uid())::text) or (bucket_id = 'local-finder-photos' and (select public.current_portal_level(auth.uid())) >= 2));

alter table public.portal_notifications drop constraint if exists portal_notifications_event_type_check;
alter table public.portal_notifications add constraint portal_notifications_event_type_check
  check (event_type in ('marketplace_product_request', 'marketplace_order', 'marketplace_product_status', 'local_finder_submission', 'local_finder_edit', 'local_finder_review_result'));

create or replace function public.notify_local_finder_reviewers()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  event_name text := case when tg_table_name = 'local_finder_places' then 'local_finder_submission' else 'local_finder_edit' end;
  item_name text;
begin
  if tg_table_name = 'local_finder_places' then
    item_name := new.name;
  else
    select place.name into item_name from public.local_finder_places place where place.id = new.place_id;
  end if;
  insert into public.portal_notifications (recipient_user_id, event_type, title, message, entity_id)
  select reviewer.user_id, event_name,
    case when event_name = 'local_finder_submission' then 'Local Finder place for review' else 'Local Finder edit for review' end,
    coalesce(item_name, 'A place') || case when event_name = 'local_finder_submission' then ' was submitted by a customer.' else ' has a customer edit suggestion.' end,
    new.id::text
  from (
    select access.user_id from public.portal_access access where access.level in ('manager', 'director')
    union select roles.user_id from public.user_roles roles where roles.role::text = 'admin'
  ) reviewer
  on conflict (recipient_user_id, event_type, entity_id) do nothing;
  return new;
end;
$$;
drop trigger if exists local_finder_place_review_notification on public.local_finder_places;
create trigger local_finder_place_review_notification after insert on public.local_finder_places
  for each row when (new.status = 'pending') execute function public.notify_local_finder_reviewers();
drop trigger if exists local_finder_edit_review_notification on public.local_finder_place_edits;
create trigger local_finder_edit_review_notification after insert on public.local_finder_place_edits
  for each row execute function public.notify_local_finder_reviewers();

create or replace function public.review_local_finder_submission(p_place_id uuid, p_approve boolean, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare place_name text;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 2 then raise exception 'Manager or Director access is required.'; end if;
  if p_approve is null then raise exception 'Choose approve or reject.'; end if;
  if not p_approve and char_length(trim(coalesce(p_reason, ''))) < 2 then raise exception 'Enter a reason before rejecting a place.'; end if;
  update public.local_finder_places
  set status = case when p_approve then 'approved' else 'rejected' end,
      rejection_reason = case when p_approve then '' else left(trim(p_reason), 500) end,
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = p_place_id and status = 'pending'
  returning name into place_name;
  if not found then raise exception 'This place is no longer awaiting review.'; end if;
  return jsonb_build_object('ok', true, 'status', case when p_approve then 'approved' else 'rejected' end, 'name', place_name);
end;
$$;
revoke all on function public.review_local_finder_submission(uuid, boolean, text) from public, anon;
grant execute on function public.review_local_finder_submission(uuid, boolean, text) to authenticated;

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
  if not p_approve and char_length(trim(coalesce(p_reason, ''))) < 2 then raise exception 'Enter a reason before rejecting an edit.'; end if;
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
      photo_url = coalesce(proposed->>'photo_url', photo_url),
      updated_at = now()
    where id = change.place_id returning name into place_name;
  end if;
  update public.local_finder_place_edits set
    status = case when p_approve then 'approved' else 'rejected' end,
    rejection_reason = case when p_approve then '' else left(trim(p_reason), 500) end,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_edit_id;
  return jsonb_build_object('ok', true, 'status', case when p_approve then 'approved' else 'rejected' end, 'name', coalesce(place_name, ''));
end;
$$;
revoke all on function public.review_local_finder_place_edit(uuid, boolean, text) from public, anon;
grant execute on function public.review_local_finder_place_edit(uuid, boolean, text) to authenticated;

create or replace function public.notify_local_finder_customer_review_result()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  place_name text;
  result_status text;
  reason text;
begin
  if new.status = old.status then return new; end if;
  if tg_table_name = 'local_finder_places' then
    owner_id := new.created_by;
    place_name := new.name;
    result_status := new.status;
    reason := new.rejection_reason;
  else
    owner_id := new.submitted_by;
    select place.name into place_name from public.local_finder_places place where place.id = new.place_id;
    result_status := new.status;
    reason := new.rejection_reason;
  end if;
  if owner_id is null then return new; end if;
  insert into public.portal_notifications (recipient_user_id, event_type, title, message, entity_id)
  values (
    owner_id, 'local_finder_review_result',
    case when result_status = 'approved' then 'Local Finder suggestion approved' else 'Local Finder suggestion rejected' end,
    coalesce(place_name, 'Your place suggestion') || case when result_status = 'approved' then ' was approved and published.' else ' was not approved. ' || coalesce(nullif(reason, ''), 'Please review the details and try again.') end,
    tg_table_name || ':' || new.id::text
  ) on conflict (recipient_user_id, event_type, entity_id) do nothing;
  return new;
end;
$$;
drop trigger if exists local_finder_place_result_notification on public.local_finder_places;
create trigger local_finder_place_result_notification after update of status on public.local_finder_places
  for each row execute function public.notify_local_finder_customer_review_result();
drop trigger if exists local_finder_edit_result_notification on public.local_finder_place_edits;
create trigger local_finder_edit_result_notification after update of status on public.local_finder_place_edits
  for each row execute function public.notify_local_finder_customer_review_result();
