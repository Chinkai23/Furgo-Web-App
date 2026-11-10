-- Store generated Furgo mascot avatars separately from customer profile photos.
alter table public.pet_profiles
  add column if not exists avatar_path text;

-- Track successful generations so the Edge Function can enforce a daily usage cap.
create table if not exists public.pet_avatar_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists pet_avatar_usage_user_created_idx
  on public.pet_avatar_usage (user_id, created_at desc);

alter table public.pet_avatar_usage enable row level security;
