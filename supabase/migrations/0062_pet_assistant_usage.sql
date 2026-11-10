-- Section: Pet Assistant usage accounting
-- Function: Store server-reported model usage per signed-in user without storing chat messages.

create table if not exists public.pet_assistant_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pet_id uuid references public.pet_profiles (id) on delete set null,
  model text not null,
  response_id text not null unique,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  input_usd_per_million numeric(12, 6) not null,
  cached_input_usd_per_million numeric(12, 6) not null,
  output_usd_per_million numeric(12, 6) not null,
  estimated_cost_usd numeric(14, 10) not null check (estimated_cost_usd >= 0),
  created_at timestamptz not null default now(),
  check (cached_input_tokens <= input_tokens)
);

create index if not exists pet_assistant_usage_user_created_idx
  on public.pet_assistant_usage (user_id, created_at desc);

alter table public.pet_assistant_usage enable row level security;

revoke all on public.pet_assistant_usage from anon, authenticated;
grant select on public.pet_assistant_usage to authenticated;
grant select, insert on public.pet_assistant_usage to service_role;

create policy "Users can read their own Pet Assistant usage"
  on public.pet_assistant_usage for select to authenticated
  using (user_id = (select auth.uid()));
