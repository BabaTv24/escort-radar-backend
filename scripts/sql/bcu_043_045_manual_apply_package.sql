-- Escort Radar BCU 043–045 manual apply package.
-- RUN ONE STEP AT A TIME.
-- DO NOT RUN THIS ENTIRE FILE AT ONCE.
-- Copy and run exactly one STEP in Supabase SQL Editor, save its result, and
-- continue only when that STEP returns the documented success status.
-- BCU_WALLET_ENABLED MUST REMAIN false.

-- =============================================================================
-- STEP 00 — PRECHECK
-- Run this SELECT first. Continue only when overall_result = READY.
-- =============================================================================
with
expected_absent(kind, object_name, object_exists) as (
  values
    ('table', 'bcu_wallets', to_regclass('public.bcu_wallets') is not null),
    ('table', 'bcu_ledger_entries', to_regclass('public.bcu_ledger_entries') is not null),
    ('table', 'bcu_migration_reconciliation', to_regclass('public.bcu_migration_reconciliation') is not null),
    ('table', 'system_bcu_products', to_regclass('public.system_bcu_products') is not null),
    ('table', 'user_entitlements', to_regclass('public.user_entitlements') is not null),
    ('function', 'bc_to_bcu', exists (
      select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'bc_to_bcu'
    )),
    ('function', 'apply_bcu_ledger_entry', exists (
      select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'apply_bcu_ledger_entry'
    )),
    ('function', 'activate_bcu_product', exists (
      select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'activate_bcu_product'
    )),
    ('function', 'activate_client_premium_bcu', exists (
      select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'activate_client_premium_bcu'
    ))
),
required_dependencies(kind, object_name, object_exists) as (
  values
    ('table', 'auth.users', to_regclass('auth.users') is not null),
    ('table', 'public.wallets', to_regclass('public.wallets') is not null),
    ('table', 'public.coin_wallets', to_regclass('public.coin_wallets') is not null),
    ('table', 'public.client_activations', to_regclass('public.client_activations') is not null),
    ('table', 'public.client_referrals', to_regclass('public.client_referrals') is not null),
    ('table', 'public.client_rewards', to_regclass('public.client_rewards') is not null),
    ('function', 'public.set_updated_at', exists (
      select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'set_updated_at'
    )),
    ('function', 'gen_random_uuid', exists (
      select 1 from pg_catalog.pg_proc where proname = 'gen_random_uuid'
    )),
    ('role', 'anon', exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')),
    ('role', 'authenticated', exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')),
    ('role', 'service_role', exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role'))
),
checks as (
  select kind, object_name, not object_exists as passed, 'must_be_absent' as requirement
  from expected_absent
  union all
  select kind, object_name, object_exists as passed, 'must_exist' as requirement
  from required_dependencies
)
select
  'STEP 00' as step,
  case when bool_and(passed) then 'READY' else 'STOP' end as overall_result,
  count(*) filter (where not passed) as failed_checks,
  coalesce(
    string_agg(kind || ':' || object_name || ':' || requirement, ', ' order by kind, object_name)
      filter (where not passed),
    'none'
  ) as failures
from checks;

-- =============================================================================
-- STEP 01 — MIGRATION 043
-- RUN STEP 01 ONLY IF STEP 00 RETURNS READY
-- =============================================================================
-- Authoritative BC Coins ledger in base units.
-- 1 BC = 10 000 BCU.
-- Historical wallets/token_transactions/coin_wallets/coin_transactions are intentionally not modified here.

create table if not exists public.bcu_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  public_wallet_id text not null unique default ('BCU-' || upper(substr(gen_random_uuid()::text, 1, 10))),
  balance_bcu bigint not null default 0 check (balance_bcu >= 0),
  lifetime_credit_bcu bigint not null default 0 check (lifetime_credit_bcu >= 0),
  lifetime_debit_bcu bigint not null default 0 check (lifetime_debit_bcu >= 0),
  frozen boolean not null default false,
  migration_status text not null default 'not_started' check (
    migration_status in (
      'not_started',
      'pending_review',
      'auto_migrated',
      'manual_override',
      'test_account_manual_reconciliation',
      'blocked'
    )
  ),
  migrated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bcu_wallets
drop constraint if exists bcu_wallets_id_user_id_unique;

alter table public.bcu_wallets
add constraint bcu_wallets_id_user_id_unique unique (id, user_id);

create table if not exists public.bcu_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.bcu_wallets(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_bcu bigint not null check (amount_bcu > 0),
  direction text not null check (direction in ('credit', 'debit')),
  transaction_type text not null,
  status text not null default 'completed' check (status in ('pending', 'completed', 'reversed', 'void')),
  idempotency_key text unique,
  reference_type text,
  reference_id uuid,
  source_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  profile_id uuid,
  business_id uuid,
  subscription_id uuid,
  booking_id uuid,
  source_system text not null default 'bcu' check (source_system in ('bcu', 'legacy_wallet', 'coin_wallet', 'manual_admin', 'migration')),
  source_table text,
  source_record_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.bcu_ledger_entries
drop constraint if exists bcu_ledger_entries_wallet_user_owner_fk;

alter table public.bcu_ledger_entries
add constraint bcu_ledger_entries_wallet_user_owner_fk
foreign key (wallet_id, user_id) references public.bcu_wallets(id, user_id) on delete restrict;

create table if not exists public.bcu_migration_reconciliation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  legacy_wallet_id uuid references public.wallets(id) on delete set null,
  coin_wallet_id uuid references public.coin_wallets(id) on delete set null,
  legacy_balance_bcu bigint,
  coin_balance_bcu bigint,
  recommended_balance_bcu bigint,
  manual_balance_bcu bigint,
  approved_balance_bcu bigint,
  status text not null default 'pending_review' check (
    status in (
      'pending_review',
      'auto_migration_candidate',
      'manual_override_required',
      'test_account_manual_reconciliation',
      'approved',
      'applied',
      'blocked'
    )
  ),
  reason text,
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  applied_ledger_entry_id uuid references public.bcu_ledger_entries(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (manual_balance_bcu is null or manual_balance_bcu >= 0),
  check (recommended_balance_bcu is null or recommended_balance_bcu >= 0),
  check (approved_balance_bcu is null or approved_balance_bcu >= 0)
);

create index if not exists bcu_wallets_user_id_idx
on public.bcu_wallets (user_id);

create index if not exists bcu_ledger_entries_wallet_created_idx
on public.bcu_ledger_entries (wallet_id, created_at desc);

create index if not exists bcu_ledger_entries_user_created_idx
on public.bcu_ledger_entries (user_id, created_at desc);

create index if not exists bcu_ledger_entries_type_status_idx
on public.bcu_ledger_entries (transaction_type, status);

create index if not exists bcu_ledger_entries_reference_idx
on public.bcu_ledger_entries (reference_type, reference_id)
where reference_type is not null and reference_id is not null;

create index if not exists bcu_ledger_entries_source_idx
on public.bcu_ledger_entries (source_system, source_table, source_record_id)
where source_record_id is not null;

create index if not exists bcu_migration_reconciliation_status_idx
on public.bcu_migration_reconciliation (status, created_at desc);

drop trigger if exists set_bcu_wallets_updated_at on public.bcu_wallets;
create trigger set_bcu_wallets_updated_at
before update on public.bcu_wallets
for each row execute procedure public.set_updated_at();

drop trigger if exists set_bcu_migration_reconciliation_updated_at on public.bcu_migration_reconciliation;
create trigger set_bcu_migration_reconciliation_updated_at
before update on public.bcu_migration_reconciliation
for each row execute procedure public.set_updated_at();

create or replace function public.prevent_bcu_ledger_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'BCU_LEDGER_IMMUTABLE' using errcode = 'P0001';
end $$;

drop trigger if exists bcu_ledger_entries_immutable on public.bcu_ledger_entries;
create trigger bcu_ledger_entries_immutable
before update or delete on public.bcu_ledger_entries
for each row execute function public.prevent_bcu_ledger_mutation();

create or replace function public.bc_to_bcu(p_bc numeric)
returns bigint
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_bc is null or p_bc < 0 then
    raise exception 'BCU_INVALID_BC_AMOUNT' using errcode = 'P0001';
  end if;

  if p_bc <> round(p_bc, 4) then
    raise exception 'BCU_TOO_MANY_DECIMAL_PLACES' using errcode = 'P0001';
  end if;

  return (p_bc * 10000)::bigint;
end $$;

create or replace function public.apply_bcu_ledger_entry(
  p_user_id uuid,
  p_amount_bcu bigint,
  p_direction text,
  p_transaction_type text,
  p_idempotency_key text default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_source_system text default 'bcu',
  p_source_table text default null,
  p_source_record_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_created_by uuid default null,
  p_source_user_id uuid default null,
  p_target_user_id uuid default null,
  p_profile_id uuid default null,
  p_business_id uuid default null,
  p_subscription_id uuid default null,
  p_booking_id uuid default null
)
returns public.bcu_ledger_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.bcu_wallets%rowtype;
  v_existing public.bcu_ledger_entries%rowtype;
  v_entry public.bcu_ledger_entries%rowtype;
begin
  if p_user_id is null then
    raise exception 'BCU_USER_REQUIRED' using errcode = 'P0001';
  end if;

  if p_amount_bcu is null or p_amount_bcu <= 0 then
    raise exception 'BCU_AMOUNT_REQUIRED' using errcode = 'P0001';
  end if;

  if p_direction not in ('credit', 'debit') then
    raise exception 'BCU_DIRECTION_INVALID' using errcode = 'P0001';
  end if;

  if nullif(trim(p_transaction_type), '') is null then
    raise exception 'BCU_TRANSACTION_TYPE_REQUIRED' using errcode = 'P0001';
  end if;

  if p_transaction_type !~ '^[a-z0-9_:.:-]{2,80}$' then
    raise exception 'BCU_TRANSACTION_TYPE_INVALID' using errcode = 'P0001';
  end if;

  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'BCU_IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.bcu_wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_wallet
  from public.bcu_wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'BCU_WALLET_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.bcu_ledger_entries
  where idempotency_key = p_idempotency_key;

  if found then
    if not (
      v_existing.user_id is not distinct from p_user_id
      and v_existing.wallet_id is not distinct from v_wallet.id
      and v_existing.amount_bcu is not distinct from p_amount_bcu
      and v_existing.direction is not distinct from p_direction
      and v_existing.transaction_type is not distinct from trim(p_transaction_type)
      and v_existing.reference_type is not distinct from p_reference_type
      and v_existing.reference_id is not distinct from p_reference_id
      and v_existing.source_user_id is not distinct from p_source_user_id
      and v_existing.target_user_id is not distinct from p_target_user_id
      and v_existing.profile_id is not distinct from p_profile_id
      and v_existing.business_id is not distinct from p_business_id
      and v_existing.subscription_id is not distinct from p_subscription_id
      and v_existing.booking_id is not distinct from p_booking_id
    ) then
      raise exception 'BCU_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    return v_existing;
  end if;

  if v_wallet.frozen then
    raise exception 'BCU_WALLET_FROZEN' using errcode = 'P0001';
  end if;

  if p_direction = 'debit' and v_wallet.balance_bcu < p_amount_bcu then
    raise exception 'BCU_INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  update public.bcu_wallets
  set
    balance_bcu = case when p_direction = 'credit' then balance_bcu + p_amount_bcu else balance_bcu - p_amount_bcu end,
    lifetime_credit_bcu = case when p_direction = 'credit' then lifetime_credit_bcu + p_amount_bcu else lifetime_credit_bcu end,
    lifetime_debit_bcu = case when p_direction = 'debit' then lifetime_debit_bcu + p_amount_bcu else lifetime_debit_bcu end,
    updated_at = now()
  where id = v_wallet.id;

  insert into public.bcu_ledger_entries (
    wallet_id,
    user_id,
    amount_bcu,
    direction,
    transaction_type,
    status,
    idempotency_key,
    reference_type,
    reference_id,
    source_user_id,
    target_user_id,
    profile_id,
    business_id,
    subscription_id,
    booking_id,
    source_system,
    source_table,
    source_record_id,
    metadata,
    created_by
  ) values (
    v_wallet.id,
    v_wallet.user_id,
    p_amount_bcu,
    p_direction,
    p_transaction_type,
    'completed',
    p_idempotency_key,
    p_reference_type,
    p_reference_id,
    p_source_user_id,
    p_target_user_id,
    p_profile_id,
    p_business_id,
    p_subscription_id,
    p_booking_id,
    p_source_system,
    p_source_table,
    p_source_record_id,
    coalesce(p_metadata, '{}'::jsonb),
    p_created_by
  )
  returning * into v_entry;

  return v_entry;
end $$;

alter table public.bcu_wallets enable row level security;
alter table public.bcu_ledger_entries enable row level security;
alter table public.bcu_migration_reconciliation enable row level security;

revoke all on public.bcu_wallets from anon, authenticated;
revoke all on public.bcu_ledger_entries from anon, authenticated;
revoke all on public.bcu_migration_reconciliation from anon, authenticated;
grant select on public.bcu_wallets to authenticated;
grant select on public.bcu_ledger_entries to authenticated;
grant all on public.bcu_wallets to service_role;
grant all on public.bcu_ledger_entries to service_role;
grant all on public.bcu_migration_reconciliation to service_role;

revoke execute on function public.apply_bcu_ledger_entry(
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  uuid,
  jsonb,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;
grant execute on function public.apply_bcu_ledger_entry(
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  uuid,
  jsonb,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid
) to service_role;

revoke execute on function public.bc_to_bcu(numeric) from public, anon, authenticated;
grant execute on function public.bc_to_bcu(numeric) to service_role;

revoke execute on function public.prevent_bcu_ledger_mutation() from public, anon, authenticated;
grant execute on function public.prevent_bcu_ledger_mutation() to service_role;

drop policy if exists "Users can read own BCU wallet" on public.bcu_wallets;
create policy "Users can read own BCU wallet"
on public.bcu_wallets for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own BCU ledger" on public.bcu_ledger_entries;
create policy "Users can read own BCU ledger"
on public.bcu_ledger_entries for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own BCU migration reconciliation" on public.bcu_migration_reconciliation;


-- =============================================================================
-- STEP 02 — VERIFY 043
-- Run only after STEP 01. Continue only when overall_result = PASS.
-- =============================================================================
with checks(check_name, passed) as (
  values
    ('bcu_wallets_exists', to_regclass('public.bcu_wallets') is not null),
    ('bcu_ledger_entries_exists', to_regclass('public.bcu_ledger_entries') is not null),
    ('bcu_migration_reconciliation_exists', to_regclass('public.bcu_migration_reconciliation') is not null),
    ('constraints_present', (
      select count(1) >= 20
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class c on c.oid = con.conrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('bcu_wallets', 'bcu_ledger_entries', 'bcu_migration_reconciliation')
        and con.contype in ('p', 'u', 'f', 'c')
    )),
    ('rls_enabled_all', (
      select count(*) = 3 and bool_and(c.relrowsecurity)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('bcu_wallets', 'bcu_ledger_entries', 'bcu_migration_reconciliation')
        and c.relkind in ('r', 'p')
    )),
    ('immutable_trigger_exists', exists (
      select 1
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'bcu_ledger_entries'
        and t.tgname = 'bcu_ledger_entries_immutable' and not t.tgisinternal
    )),
    ('apply_bcu_ledger_entry_exists', to_regprocedure(
      'public.apply_bcu_ledger_entry(uuid,bigint,text,text,text,text,uuid,text,text,uuid,jsonb,uuid,uuid,uuid,uuid,uuid,uuid,uuid)'
    ) is not null),
    ('apply_bcu_ledger_entry_permissions', coalesce((
      select not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'apply_bcu_ledger_entry'
      limit 1
    ), false)),
    ('bcu_wallets_empty', (select count(*) = 0 from public.bcu_wallets)),
    ('bcu_ledger_entries_empty', (select count(*) = 0 from public.bcu_ledger_entries)),
    ('bcu_migration_reconciliation_empty', (select count(*) = 0 from public.bcu_migration_reconciliation))
)
select
  'STEP 02' as step,
  case when bool_and(passed) then 'PASS' else 'STOP' end as overall_result,
  count(*) filter (where not passed) as failed_checks,
  coalesce(string_agg(check_name, ', ' order by check_name) filter (where not passed), 'none') as failures
from checks;

-- =============================================================================
-- STEP 03 — MIGRATION 044
-- RUN STEP 03 ONLY IF STEP 02 RETURNS PASS
-- =============================================================================
-- BCU products and entitlement layer.
-- Defines backend-priced products and user entitlements without changing historical wallet systems.

create table if not exists public.system_bcu_products (
  id uuid primary key default gen_random_uuid(),
  product_code text unique not null,
  display_name text not null,
  amount_bcu bigint not null check (amount_bcu > 0),
  operation_type text not null check (operation_type in ('credit', 'debit', 'transfer')),
  entitlement_type text,
  duration_days integer check (duration_days is null or duration_days > 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_type text not null check (entitlement_type in ('client_premium', 'advertiser', 'small_business', 'vip_business', 'communication_plus')),
  status text not null check (status in ('active', 'expired', 'revoked', 'pending')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  source text not null,
  source_reference_id uuid,
  product_code text references public.system_bcu_products(product_code) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create unique index if not exists user_entitlements_one_active_type_idx
on public.user_entitlements (user_id, entitlement_type)
where status = 'active';

create index if not exists user_entitlements_user_status_idx
on public.user_entitlements (user_id, status, entitlement_type);

create index if not exists system_bcu_products_active_idx
on public.system_bcu_products (active, product_code);

drop trigger if exists set_system_bcu_products_updated_at on public.system_bcu_products;
create trigger set_system_bcu_products_updated_at
before update on public.system_bcu_products
for each row execute procedure public.set_updated_at();

drop trigger if exists set_user_entitlements_updated_at on public.user_entitlements;
create trigger set_user_entitlements_updated_at
before update on public.user_entitlements
for each row execute procedure public.set_updated_at();

insert into public.system_bcu_products (
  product_code,
  display_name,
  amount_bcu,
  operation_type,
  entitlement_type,
  duration_days,
  active,
  metadata
)
values
  ('premium_activation_bonus', 'Premium activation bonus', 70000, 'credit', null, null, true, '{}'::jsonb),
  ('favorite_profile', 'Favorite profile', 50000, 'transfer', null, null, true, '{}'::jsonb),
  ('referral_reward', 'Referral reward', 100000, 'credit', null, null, true, '{}'::jsonb),
  ('communication_plus', 'Communication Plus', 1000000, 'debit', 'communication_plus', null, true, '{}'::jsonb),
  ('advertiser_30_days', 'Advertiser 30 days', 3332666, 'debit', 'advertiser', 30, true, '{}'::jsonb),
  ('small_business_30_days', 'Small Business 30 days', 33266666, 'debit', 'small_business', 30, true, '{}'::jsonb),
  ('vip_business_30_days', 'VIP Business 30 days', 119933333, 'debit', 'vip_business', 30, true, '{}'::jsonb)
on conflict (product_code) do update set
  display_name = excluded.display_name,
  amount_bcu = excluded.amount_bcu,
  operation_type = excluded.operation_type,
  entitlement_type = excluded.entitlement_type,
  duration_days = excluded.duration_days,
  active = excluded.active,
  updated_at = now();

create or replace function public.has_active_user_entitlement(
  p_user_id uuid,
  p_entitlement_type text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_entitlements ue
    where ue.user_id = p_user_id
      and ue.entitlement_type = p_entitlement_type
      and ue.status = 'active'
      and (ue.ends_at is null or ue.ends_at > now())
  );
$$;

create or replace function public.activate_bcu_product(
  p_user_id uuid,
  p_product_code text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.system_bcu_products%rowtype;
  v_existing_entitlement public.user_entitlements%rowtype;
  v_entitlement public.user_entitlements%rowtype;
  v_ledger public.bcu_ledger_entries%rowtype;
  v_now timestamptz := now();
  v_ends_at timestamptz;
  v_safe_metadata jsonb;
begin
  if p_user_id is null then
    raise exception 'BCU_USER_REQUIRED' using errcode = 'P0001';
  end if;

  if nullif(trim(coalesce(p_product_code, '')), '') is null then
    raise exception 'BCU_PRODUCT_REQUIRED' using errcode = 'P0001';
  end if;

  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'BCU_IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_product
  from public.system_bcu_products
  where product_code = p_product_code
    and active = true;

  if not found then
    raise exception 'BCU_PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_product.entitlement_type in ('advertiser', 'small_business', 'vip_business', 'communication_plus')
    and not public.has_active_user_entitlement(p_user_id, 'client_premium') then
    raise exception 'BCU_CLIENT_PREMIUM_REQUIRED' using errcode = 'P0001';
  end if;

  if v_product.entitlement_type is not null then
    perform pg_advisory_xact_lock(
      hashtext('bcu_entitlement:' || p_user_id::text),
      hashtext(v_product.entitlement_type)
    );
  end if;

  if v_product.entitlement_type = 'communication_plus' then
    select * into v_existing_entitlement
    from public.user_entitlements
    where user_id = p_user_id
      and entitlement_type = 'communication_plus'
      and status = 'active'
      and ends_at is null
    limit 1;

    if found then
      return jsonb_build_object(
        'product_code', v_product.product_code,
        'amount_bcu', v_product.amount_bcu::text,
        'charged', false,
        'ledger_entry', null,
        'entitlement', to_jsonb(v_existing_entitlement)
      );
    end if;
  end if;

  v_safe_metadata := coalesce(p_metadata, '{}'::jsonb)
    - 'amount_bcu'
    - 'price'
    - 'user_id'
    - 'status'
    - 'starts_at'
    - 'ends_at'
    - 'product_code';

  if v_product.operation_type = 'debit' then
    select * into v_ledger
    from public.apply_bcu_ledger_entry(
      p_user_id,
      v_product.amount_bcu,
      'debit',
      'bcu_product_' || v_product.product_code,
      p_idempotency_key,
      'system_bcu_product',
      v_product.id,
      'bcu',
      'system_bcu_products',
      v_product.id,
      jsonb_build_object('product_code', v_product.product_code, 'request_metadata', v_safe_metadata),
      null
    );
  elsif v_product.operation_type = 'credit' then
    select * into v_ledger
    from public.apply_bcu_ledger_entry(
      p_user_id,
      v_product.amount_bcu,
      'credit',
      'bcu_product_' || v_product.product_code,
      p_idempotency_key,
      'system_bcu_product',
      v_product.id,
      'bcu',
      'system_bcu_products',
      v_product.id,
      jsonb_build_object('product_code', v_product.product_code, 'request_metadata', v_safe_metadata),
      null
    );
  else
    raise exception 'BCU_PRODUCT_OPERATION_UNSUPPORTED' using errcode = 'P0001';
  end if;

  if not (
    v_ledger.user_id is not distinct from p_user_id
    and v_ledger.amount_bcu is not distinct from v_product.amount_bcu
    and v_ledger.direction is not distinct from v_product.operation_type
    and v_ledger.transaction_type is not distinct from ('bcu_product_' || v_product.product_code)
    and v_ledger.reference_type is not distinct from 'system_bcu_product'
    and v_ledger.reference_id is not distinct from v_product.id
    and v_ledger.source_system is not distinct from 'bcu'
    and v_ledger.source_table is not distinct from 'system_bcu_products'
    and v_ledger.source_record_id is not distinct from v_product.id
  ) then
    raise exception 'BCU_LEDGER_PRODUCT_MISMATCH' using errcode = 'P0001';
  end if;

  if v_product.entitlement_type is null then
    return jsonb_build_object(
      'product_code', v_product.product_code,
      'amount_bcu', v_product.amount_bcu::text,
      'charged', true,
      'ledger_entry', to_jsonb(v_ledger),
      'entitlement', null
    );
  end if;

  v_ends_at := case
    when v_product.duration_days is null then null
    else v_now + make_interval(days => v_product.duration_days)
  end;

  insert into public.user_entitlements (
    user_id,
    entitlement_type,
    status,
    starts_at,
    ends_at,
    source,
    source_reference_id,
    product_code,
    metadata
  ) values (
    p_user_id,
    v_product.entitlement_type,
    'active',
    v_now,
    v_ends_at,
    'bcu_product',
    v_ledger.id,
    v_product.product_code,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'request_metadata', v_safe_metadata)
  )
  on conflict (user_id, entitlement_type) where status = 'active'
  do update set
    starts_at = case
      when public.user_entitlements.ends_at is not null and public.user_entitlements.ends_at > now()
      then public.user_entitlements.starts_at
      else excluded.starts_at
    end,
    ends_at = case
      when excluded.ends_at is null then null
      when public.user_entitlements.ends_at is not null and public.user_entitlements.ends_at > now()
      then public.user_entitlements.ends_at + make_interval(days => v_product.duration_days)
      else excluded.ends_at
    end,
    source = excluded.source,
    source_reference_id = excluded.source_reference_id,
    product_code = excluded.product_code,
    metadata = excluded.metadata,
    updated_at = now()
  returning * into v_entitlement;

  return jsonb_build_object(
    'product_code', v_product.product_code,
    'amount_bcu', v_product.amount_bcu::text,
    'charged', true,
    'ledger_entry', to_jsonb(v_ledger),
    'entitlement', to_jsonb(v_entitlement)
  );
end $$;

alter table public.system_bcu_products enable row level security;
alter table public.user_entitlements enable row level security;

revoke all on public.system_bcu_products from anon, authenticated;
revoke all on public.user_entitlements from anon, authenticated;
grant select on public.system_bcu_products to authenticated;
grant select on public.user_entitlements to authenticated;
grant all on public.system_bcu_products to service_role;
grant all on public.user_entitlements to service_role;

revoke execute on function public.has_active_user_entitlement(uuid, text) from public, anon, authenticated;
grant execute on function public.has_active_user_entitlement(uuid, text) to service_role;

revoke execute on function public.activate_bcu_product(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.activate_bcu_product(uuid, text, text, jsonb) to service_role;

drop policy if exists "Users can read active BCU products" on public.system_bcu_products;
create policy "Users can read active BCU products"
on public.system_bcu_products for select
using (active = true);

drop policy if exists "Users can read own entitlements" on public.user_entitlements;
create policy "Users can read own entitlements"
on public.user_entitlements for select
using (auth.uid() = user_id);


-- =============================================================================
-- STEP 04 — VERIFY 044
-- Run only after STEP 03. Continue only when overall_result = PASS.
-- =============================================================================
with expected_products(product_code, amount_bcu) as (
  values
    ('premium_activation_bonus', 70000::bigint),
    ('favorite_profile', 50000::bigint),
    ('referral_reward', 100000::bigint),
    ('communication_plus', 1000000::bigint),
    ('advertiser_30_days', 3332666::bigint),
    ('small_business_30_days', 33266666::bigint),
    ('vip_business_30_days', 119933333::bigint)
),
product_check as (
  select count(*) = 7
    and bool_and(p.id is not null and p.amount_bcu = ep.amount_bcu) as passed
  from expected_products ep
  left join public.system_bcu_products p on p.product_code = ep.product_code
),
checks(check_name, passed) as (
  values
    ('system_bcu_products_exists', to_regclass('public.system_bcu_products') is not null),
    ('user_entitlements_exists', to_regclass('public.user_entitlements') is not null),
    ('rls_enabled_all', (
      select count(*) = 2 and bool_and(c.relrowsecurity)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('system_bcu_products', 'user_entitlements')
        and c.relkind in ('r', 'p')
    )),
    ('active_entitlement_unique_index', exists (
      select 1 from pg_catalog.pg_indexes
      where schemaname = 'public' and tablename = 'user_entitlements'
        and indexname = 'user_entitlements_one_active_type_idx'
        and indexdef like '%UNIQUE%'
        and indexdef like '%WHERE (status = ''active''%'
    )),
    ('activate_bcu_product_exists', to_regprocedure(
      'public.activate_bcu_product(uuid,text,text,jsonb)'
    ) is not null),
    ('product_seed_exact', (select passed from product_check))
)
select
  'STEP 04' as step,
  case when bool_and(passed) then 'PASS' else 'STOP' end as overall_result,
  count(*) filter (where not passed) as failed_checks,
  coalesce(string_agg(check_name, ', ' order by check_name) filter (where not passed), 'none') as failures
from checks;

-- =============================================================================
-- STEP 05 — PRECHECK 045 REFERRALS
-- Continue only when overall_result = READY. UUIDs are anonymized.
-- =============================================================================
with duplicates as (
  select
    referred_user_id,
    count(*) as record_count
  from public.client_rewards
  where referred_user_id is not null
    and reward_type = 'client_activation_referral'
    and status = 'granted'
  group by referred_user_id
  having count(*) > 1
),
summary as (
  select count(*) as duplicate_groups from duplicates
)
select
  'STEP 05' as step,
  case when s.duplicate_groups = 0 then 'READY' else 'STOP_DUPLICATES_REQUIRE_REVIEW' end as overall_result,
  case when d.referred_user_id is null then null
    else left(d.referred_user_id::text, 8) || '...' || right(d.referred_user_id::text, 4)
  end as referred_user_ref,
  d.record_count
from summary s
left join duplicates d on true
order by d.record_count desc nulls last, referred_user_ref;

-- =============================================================================
-- STEP 06 — MIGRATION 045
-- RUN STEP 06 ONLY IF STEP 05 RETURNS READY
-- =============================================================================
-- Atomic Client Premium BCU activation and referral reward.
-- Requires 043_bcu_authoritative_wallet.sql and 044_bcu_products_and_entitlements.sql.

do $$
begin
  if exists (
    select 1
    from public.client_rewards
    where referred_user_id is not null
      and reward_type = 'client_activation_referral'
      and status = 'granted'
    group by referred_user_id, reward_type
    having count(*) > 1
  ) then
    raise exception 'CLIENT_REFERRAL_REWARD_DUPLICATES_REQUIRE_REVIEW' using errcode = 'P0001';
  end if;
end $$;

create unique index if not exists client_rewards_one_granted_activation_referral_idx
on public.client_rewards (referred_user_id, reward_type)
where referred_user_id is not null
  and reward_type = 'client_activation_referral'
  and status = 'granted';

create or replace function public.activate_client_premium_bcu(
  p_user_id uuid,
  p_activation_id uuid,
  p_referred_by_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bonus_product public.system_bcu_products%rowtype;
  v_referral_product public.system_bcu_products%rowtype;
  v_bonus_ledger public.bcu_ledger_entries%rowtype;
  v_referral_ledger public.bcu_ledger_entries%rowtype;
  v_wallet public.bcu_wallets%rowtype;
  v_entitlement public.user_entitlements%rowtype;
  v_referrer public.client_referrals%rowtype;
  v_reward public.client_rewards%rowtype;
  v_referral_granted boolean := false;
  v_bonus_key text;
  v_referral_key text;
begin
  if p_user_id is null then
    raise exception 'BCU_USER_REQUIRED' using errcode = 'P0001';
  end if;

  if p_activation_id is null then
    raise exception 'BCU_ACTIVATION_REQUIRED' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.client_activations ca
    where ca.id = p_activation_id
      and ca.user_id = p_user_id
      and ca.state = 'client_activated'
  ) then
    raise exception 'BCU_CLIENT_PREMIUM_ACTIVATION_INVALID' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('client_premium_bcu'),
    hashtext(p_user_id::text)
  );

  select * into v_bonus_product
  from public.system_bcu_products
  where product_code = 'premium_activation_bonus'
    and operation_type = 'credit'
    and active = true;

  if not found or v_bonus_product.amount_bcu <> 70000 then
    raise exception 'BCU_PREMIUM_BONUS_PRODUCT_INVALID' using errcode = 'P0001';
  end if;

  v_bonus_key := 'client-premium-bonus:' || p_user_id::text;

  select * into v_bonus_ledger
  from public.apply_bcu_ledger_entry(
    p_user_id,
    v_bonus_product.amount_bcu,
    'credit',
    'bcu_product_premium_activation_bonus',
    v_bonus_key,
    'system_bcu_product',
    v_bonus_product.id,
    'bcu',
    'system_bcu_products',
    v_bonus_product.id,
    jsonb_build_object('product_code', v_bonus_product.product_code, 'activation_id', p_activation_id),
    null
  );

  select * into v_entitlement
  from public.user_entitlements
  where user_id = p_user_id
    and entitlement_type = 'client_premium'
    and status = 'active'
  limit 1
  for update;

  if found then
    if v_entitlement.source_reference_id is distinct from v_bonus_ledger.id
      or v_entitlement.product_code is distinct from v_bonus_product.product_code then
      raise exception 'BCU_CLIENT_PREMIUM_ENTITLEMENT_CONFLICT' using errcode = 'P0001';
    end if;
  else
    insert into public.user_entitlements (
      user_id,
      entitlement_type,
      status,
      starts_at,
      ends_at,
      source,
      source_reference_id,
      product_code,
      metadata
    ) values (
      p_user_id,
      'client_premium',
      'active',
      now(),
      null,
      'premium_activation',
      v_bonus_ledger.id,
      v_bonus_product.product_code,
      jsonb_build_object('idempotency_key', v_bonus_key, 'activation_id', p_activation_id)
    )
    returning * into v_entitlement;
  end if;

  if nullif(trim(coalesce(p_referred_by_code, '')), '') is not null then
    select cr.* into v_referrer
    from public.client_referrals cr
    join public.client_activations ca
      on ca.user_id = cr.user_id
     and ca.state = 'client_activated'
    where cr.referral_code = trim(p_referred_by_code)
      and cr.user_id <> p_user_id
    limit 1;

    if found then
      select * into v_reward
      from public.client_rewards
      where referred_user_id = p_user_id
        and reward_type = 'client_activation_referral'
        and status = 'granted'
      limit 1;

      if found then
        if v_reward.user_id is distinct from v_referrer.user_id then
          raise exception 'BCU_REFERRAL_REWARD_CONFLICT' using errcode = 'P0001';
        end if;
      else
      select * into v_referral_product
      from public.system_bcu_products
      where product_code = 'referral_reward'
        and operation_type = 'credit'
        and active = true;

      if not found or v_referral_product.amount_bcu <> 100000 then
        raise exception 'BCU_REFERRAL_PRODUCT_INVALID' using errcode = 'P0001';
      end if;

      v_referral_key := 'client-premium-referral:' || p_user_id::text;

      select * into v_referral_ledger
      from public.apply_bcu_ledger_entry(
        v_referrer.user_id,
        v_referral_product.amount_bcu,
        'credit',
        'bcu_product_referral_reward',
        v_referral_key,
        'system_bcu_product',
        v_referral_product.id,
        'bcu',
        'system_bcu_products',
        v_referral_product.id,
        jsonb_build_object('product_code', v_referral_product.product_code, 'referred_user_id', p_user_id),
        null,
        p_user_id,
        v_referrer.user_id
      );

      insert into public.client_rewards (
        user_id,
        referral_id,
        referred_user_id,
        reward_type,
        coins,
        status,
        metadata
      ) values (
        v_referrer.user_id,
        v_referrer.id,
        p_user_id,
        'client_activation_referral',
        10,
        'granted',
        jsonb_build_object('ledger_entry_id', v_referral_ledger.id)
      )
      on conflict (referred_user_id, reward_type)
        where referred_user_id is not null
          and reward_type = 'client_activation_referral'
          and status = 'granted'
      do nothing
      returning * into v_reward;

      if found then
        update public.client_referrals
        set
          activation_count = coalesce(activation_count, 0) + 1,
          earned_coins = coalesce(earned_coins, 0) + 10,
          updated_at = now()
        where id = v_referrer.id;
      else
        select * into v_reward
        from public.client_rewards
        where referred_user_id = p_user_id
          and reward_type = 'client_activation_referral'
          and status = 'granted'
        limit 1;

        if v_reward.user_id is distinct from v_referrer.user_id
          or (v_reward.metadata ->> 'ledger_entry_id') is distinct from v_referral_ledger.id::text then
          raise exception 'BCU_REFERRAL_REWARD_CONFLICT' using errcode = 'P0001';
        end if;
      end if;

      end if;

      v_referral_granted := true;
    end if;
  end if;

  select * into v_wallet
  from public.bcu_wallets
  where user_id = p_user_id;

  return jsonb_build_object(
    'wallet', jsonb_build_object(
      'public_wallet_id', v_wallet.public_wallet_id,
      'balance_bcu', v_wallet.balance_bcu::text,
      'lifetime_credit_bcu', v_wallet.lifetime_credit_bcu::text,
      'lifetime_debit_bcu', v_wallet.lifetime_debit_bcu::text,
      'frozen', v_wallet.frozen,
      'created_at', v_wallet.created_at,
      'updated_at', v_wallet.updated_at
    ),
    'bonus', jsonb_build_object(
      'amount_bcu', v_bonus_ledger.amount_bcu::text,
      'direction', v_bonus_ledger.direction,
      'transaction_type', v_bonus_ledger.transaction_type,
      'status', v_bonus_ledger.status,
      'created_at', v_bonus_ledger.created_at
    ),
    'entitlement', jsonb_build_object(
      'entitlement_type', v_entitlement.entitlement_type,
      'status', v_entitlement.status,
      'starts_at', v_entitlement.starts_at,
      'ends_at', v_entitlement.ends_at,
      'product_code', v_entitlement.product_code
    ),
    'referral_granted', v_referral_granted
  );
end $$;

revoke execute on function public.activate_client_premium_bcu(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.activate_client_premium_bcu(uuid, uuid, text)
to service_role;


-- =============================================================================
-- STEP 07 — VERIFY 045
-- Run only after STEP 06. Continue only when overall_result = PASS.
-- =============================================================================
with rpc as (
  select p.oid, p.prosecdef, coalesce(array_to_string(p.proconfig, ', '), '') as config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'activate_client_premium_bcu'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_activation_id uuid, p_referred_by_code text'
),
checks(check_name, passed) as (
  values
    ('activate_client_premium_bcu_exists', exists (select 1 from rpc)),
    ('security_definer', coalesce((select prosecdef from rpc), false)),
    ('search_path_public', coalesce((select config like '%search_path=public%' from rpc), false)),
    ('rpc_permissions', coalesce((
      select not pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE')
        and pg_catalog.has_function_privilege('service_role', oid, 'EXECUTE')
      from rpc
    ), false)),
    ('referral_partial_unique_index', exists (
      select 1 from pg_catalog.pg_indexes
      where schemaname = 'public' and tablename = 'client_rewards'
        and indexname = 'client_rewards_one_granted_activation_referral_idx'
        and indexdef like '%UNIQUE%'
        and indexdef like '%client_activation_referral%'
        and indexdef like '%granted%'
    )),
    ('bcu_wallets_still_empty', (select count(*) = 0 from public.bcu_wallets)),
    ('bcu_ledger_entries_still_empty', (select count(*) = 0 from public.bcu_ledger_entries)),
    ('user_entitlements_still_empty', (select count(*) = 0 from public.user_entitlements))
)
select
  'STEP 07' as step,
  case when bool_and(passed) then 'PASS' else 'STOP' end as overall_result,
  count(*) filter (where not passed) as failed_checks,
  coalesce(string_agg(check_name, ', ' order by check_name) filter (where not passed), 'none') as failures
from checks;

-- =============================================================================
-- STEP 08 — FINAL SUMMARY
-- Final read-only validation. overall_result must be PASS.
-- =============================================================================
with
relations as (
  select
    count(*) filter (where c.relname in ('bcu_wallets', 'bcu_ledger_entries', 'bcu_migration_reconciliation')) = 3 as migration_043,
    count(*) filter (where c.relname in ('system_bcu_products', 'user_entitlements')) = 2 as migration_044,
    bool_and(c.relrowsecurity) filter (where c.relname in (
      'bcu_wallets', 'bcu_ledger_entries', 'bcu_migration_reconciliation',
      'system_bcu_products', 'user_entitlements'
    )) as rls
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
functions as (
  select
    bool_or(p.proname = 'activate_client_premium_bcu') as migration_045,
    bool_and(
      not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
    ) as permissions
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('apply_bcu_ledger_entry', 'activate_bcu_product', 'activate_client_premium_bcu')
),
expected_products(product_code, amount_bcu) as (
  values
    ('premium_activation_bonus', 70000::bigint),
    ('favorite_profile', 50000::bigint),
    ('referral_reward', 100000::bigint),
    ('communication_plus', 1000000::bigint),
    ('advertiser_30_days', 3332666::bigint),
    ('small_business_30_days', 33266666::bigint),
    ('vip_business_30_days', 119933333::bigint)
),
products as (
  select count(*) = 7 and bool_and(p.amount_bcu = ep.amount_bcu) as seeded
  from expected_products ep
  left join public.system_bcu_products p on p.product_code = ep.product_code
),
empty_state as (
  select
    (select count(*) = 0 from public.bcu_wallets)
    and (select count(*) = 0 from public.bcu_ledger_entries)
    and (select count(*) = 0 from public.user_entitlements) as empty_wallet
)
select
  case when r.migration_043 then 'PASS' else 'STOP' end as status_043,
  case when r.migration_044 then 'PASS' else 'STOP' end as status_044,
  case when f.migration_045 then 'PASS' else 'STOP' end as status_045,
  case when p.seeded then 'PASS' else 'STOP' end as product_seed_status,
  case when r.rls then 'PASS' else 'STOP' end as rls_status,
  case when f.permissions then 'PASS' else 'STOP' end as rpc_permission_status,
  case when e.empty_wallet then 'PASS' else 'STOP' end as empty_wallet_status,
  case when r.migration_043 and r.migration_044 and f.migration_045
    and p.seeded and r.rls and f.permissions and e.empty_wallet
    then 'PASS' else 'STOP' end as overall_result
from relations r cross join functions f cross join products p cross join empty_state e;
