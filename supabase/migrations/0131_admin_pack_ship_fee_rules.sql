-- Director-managed parcel pricing. The chargeable weight uses the greater of
-- actual weight and volumetric weight (L × W × H ÷ volumetric divisor).

create table if not exists public.marketplace_pack_ship_fee_settings (
  singleton boolean primary key default true check (singleton),
  volumetric_divisor numeric(12,2) not null default 5000 check (volumetric_divisor > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.marketplace_pack_ship_fee_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.marketplace_pack_ship_fee_rules (
  id uuid primary key default gen_random_uuid(),
  -- Each finite value is an ascending maximum-weight threshold. A NULL value
  -- is the optional final open-ended band.
  max_chargeable_weight_kg numeric(12,3) check (max_chargeable_weight_kg is null or max_chargeable_weight_kg > 0),
  rate_myr numeric(12,2) not null default 0 check (rate_myr >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists marketplace_pack_ship_fee_rules_unique_limit_idx
  on public.marketplace_pack_ship_fee_rules (max_chargeable_weight_kg)
  where max_chargeable_weight_kg is not null;

create unique index if not exists marketplace_pack_ship_fee_rules_single_open_band_idx
  on public.marketplace_pack_ship_fee_rules ((max_chargeable_weight_kg is null))
  where max_chargeable_weight_kg is null;

alter table public.marketplace_pack_ship_fee_settings enable row level security;
alter table public.marketplace_pack_ship_fee_rules enable row level security;
revoke all on public.marketplace_pack_ship_fee_settings from anon, authenticated;
revoke all on public.marketplace_pack_ship_fee_rules from anon, authenticated;

create or replace function public.admin_pack_ship_fee_rules_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fee_settings jsonb;
  fee_rules jsonb;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;

  select jsonb_build_object('volumetric_divisor', settings.volumetric_divisor)
  into fee_settings
  from public.marketplace_pack_ship_fee_settings as settings
  where settings.singleton = true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rule.id,
    'max_chargeable_weight_kg', rule.max_chargeable_weight_kg,
    'rate_myr', rule.rate_myr,
    'created_at', rule.created_at,
    'updated_at', rule.updated_at
  ) order by rule.max_chargeable_weight_kg nulls last, rule.created_at, rule.id), '[]'::jsonb)
  into fee_rules
  from public.marketplace_pack_ship_fee_rules as rule;

  return jsonb_build_object(
    'volumetric_divisor', coalesce(fee_settings->'volumetric_divisor', '5000'::jsonb),
    'rules', fee_rules
  );
end;
$$;

create or replace function public.admin_pack_ship_fee_divisor_save(p_volumetric_divisor numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;
  if p_volumetric_divisor is null or p_volumetric_divisor <= 0 or p_volumetric_divisor > 10000000 then
    raise exception 'Enter a volumetric divisor greater than zero.';
  end if;

  insert into public.marketplace_pack_ship_fee_settings (
    singleton, volumetric_divisor, updated_by, updated_at
  ) values (true, p_volumetric_divisor, auth.uid(), now())
  on conflict (singleton) do update
    set volumetric_divisor = excluded.volumetric_divisor,
        updated_by = auth.uid(),
        updated_at = now();
end;
$$;

create or replace function public.admin_pack_ship_fee_rule_save(
  p_id uuid,
  p_max_chargeable_weight_kg numeric,
  p_rate_myr numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare saved_id uuid;
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;
  if (p_max_chargeable_weight_kg is not null and p_max_chargeable_weight_kg <= 0)
    or p_rate_myr is null or p_rate_myr < 0 then
    raise exception 'Enter a positive maximum weight or select No maximum, and a non-negative parcel price.';
  end if;

  if p_id is null then
    insert into public.marketplace_pack_ship_fee_rules (
      max_chargeable_weight_kg, rate_myr, created_by
    ) values (
      p_max_chargeable_weight_kg, p_rate_myr, auth.uid()
    ) returning id into saved_id;
  else
    update public.marketplace_pack_ship_fee_rules as rule
    set max_chargeable_weight_kg = p_max_chargeable_weight_kg,
        rate_myr = p_rate_myr,
        updated_at = now()
    where rule.id = p_id
    returning rule.id into saved_id;
    if saved_id is null then
      raise exception 'Pack & Ship weight band was not found.';
    end if;
  end if;

  return saved_id;
exception
  when unique_violation then
    raise exception 'That weight limit already exists, or a No maximum band has already been added.';
end;
$$;

create or replace function public.admin_pack_ship_fee_rule_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_portal_level(auth.uid()), 0) < 3 then
    raise exception 'Director access is required.';
  end if;

  delete from public.marketplace_pack_ship_fee_rules as rule
  where rule.id = p_id;
  if not found then
    raise exception 'Pack & Ship weight band was not found.';
  end if;
end;
$$;

revoke all on function public.admin_pack_ship_fee_rules_list() from public, anon;
revoke all on function public.admin_pack_ship_fee_divisor_save(numeric) from public, anon;
revoke all on function public.admin_pack_ship_fee_rule_save(uuid, numeric, numeric) from public, anon;
revoke all on function public.admin_pack_ship_fee_rule_delete(uuid) from public, anon;
grant execute on function public.admin_pack_ship_fee_rules_list() to authenticated;
grant execute on function public.admin_pack_ship_fee_divisor_save(numeric) to authenticated;
grant execute on function public.admin_pack_ship_fee_rule_save(uuid, numeric, numeric) to authenticated;
grant execute on function public.admin_pack_ship_fee_rule_delete(uuid) to authenticated;
