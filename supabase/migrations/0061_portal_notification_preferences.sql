create table if not exists public.portal_notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.portal_notification_preferences enable row level security;

drop policy if exists "Users read their notification preferences" on public.portal_notification_preferences;
create policy "Users read their notification preferences"
  on public.portal_notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users create their notification preferences" on public.portal_notification_preferences;
create policy "Users create their notification preferences"
  on public.portal_notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users update their notification preferences" on public.portal_notification_preferences;
create policy "Users update their notification preferences"
  on public.portal_notification_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.portal_notification_preferences to authenticated;
