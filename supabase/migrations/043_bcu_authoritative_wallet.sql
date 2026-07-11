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
