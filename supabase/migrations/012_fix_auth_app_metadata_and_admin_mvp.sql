-- Part A: paid advertiser authorization must read only auth app_metadata.
create or replace function public.current_auth_account_type()
returns text
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'auth_account_type', ''), 'client');
$$;

create or replace function public.current_auth_plan()
returns text
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'plan', ''), '');
$$;

create or replace function public.current_auth_subscription_status()
returns text
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'subscription_status', ''), '');
$$;

create or replace function public.has_active_advertiser_access()
returns boolean
language sql
stable
as $$
  select (
    public.current_auth_subscription_status() = 'active'
    and (
      (public.current_auth_account_type() = 'escort' and public.current_auth_plan() = 'escort_monthly')
      or
      (public.current_auth_account_type() = 'business' and public.current_auth_plan() = 'business_monthly')
    )
  );
$$;

-- Part B: admin backend MVP tables and additive columns.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_email text,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb default '{}',
  ip_address inet,
  user_agent text,
  created_at timestamptz default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  profile_id uuid unique references public.profiles(id) on delete cascade,
  plan text not null default 'escort_monthly',
  status text not null default 'free'
    check (status in ('free', 'active', 'past_due', 'cancelled', 'expired', 'test')),
  provider text,
  external_subscription_id text unique,
  amount_eur numeric default 49.99,
  currency text default 'EUR',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into public.subscriptions (
  user_id,
  profile_id,
  plan,
  status,
  amount_eur,
  currency,
  current_period_start,
  current_period_end,
  metadata
)
select
  user_id,
  id,
  coalesce(nullif(plan, ''), 'escort_monthly'),
  case
    when subscription_status in ('free', 'active', 'past_due', 'cancelled', 'expired', 'test') then subscription_status
    when subscription_status is null or subscription_status = '' then 'free'
    else 'free'
  end,
  coalesce(listing_price, 49.99),
  coalesce(nullif(listing_currency, ''), 'EUR'),
  subscription_started_at,
  subscription_expires_at,
  jsonb_build_object('source', 'profiles_backfill')
from public.profiles
where user_id is not null
on conflict (profile_id) do nothing;

alter table public.wallets
  add column if not exists updated_at timestamptz default now();

alter table public.token_transactions
  add column if not exists admin_note text,
  add column if not exists updated_at timestamptz default now();

create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_admin_email_idx on public.admin_audit_log (admin_email);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_type, target_id);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_profile_id_idx on public.subscriptions (profile_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_external_subscription_id_idx on public.subscriptions (external_subscription_id);

alter table public.admin_audit_log enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "No direct user access to admin audit log" on public.admin_audit_log;

revoke all on public.admin_audit_log from anon, authenticated;
revoke all on public.subscriptions from anon, authenticated;
