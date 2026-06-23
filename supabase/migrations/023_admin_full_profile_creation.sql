alter table public.profiles
  add column if not exists owner_email text,
  add column if not exists phone text,
  add column if not exists profile_type text,
  add column if not exists business_name text,
  add column if not exists business_type text,
  add column if not exists contact_person text,
  add column if not exists website text,
  add column if not exists opening_hours jsonb default '{}'::jsonb;

update public.profiles
set
  owner_email = coalesce(owner_email, admin_note),
  phone = coalesce(phone, primary_phone),
  profile_type = coalesce(profile_type, account_type),
  currency = coalesce(currency, listing_currency, 'EUR'),
  listing_plan = coalesce(listing_plan, subscription_plan, plan, 'admin_profile_studio')
where true;

alter table public.profiles
  drop constraint if exists profiles_account_type_check;

alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('private', 'agency', 'massage_salon', 'club_party', 'live_cam', 'escort', 'business'));

alter table public.subscriptions
  add column if not exists email text,
  add column if not exists managed_by text,
  add column if not exists admin_note text,
  add column if not exists role text,
  add column if not exists profile_display_name text;

alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('free', 'requested', 'trial', 'active', 'past_due', 'incomplete', 'cancelled', 'canceled', 'expired', 'suspended', 'test'));

insert into public.subscriptions (
  user_id,
  profile_id,
  email,
  profile_display_name,
  role,
  plan,
  status,
  provider,
  amount_eur,
  currency,
  current_period_start,
  current_period_end,
  managed_by,
  admin_note,
  metadata
)
select
  user_id,
  id,
  owner_email,
  display_name,
  coalesce(profile_type, account_type, category, 'escort'),
  coalesce(subscription_plan, listing_plan, plan, 'admin_profile_studio'),
  case
    when subscription_status in ('free', 'requested', 'trial', 'active', 'past_due', 'incomplete', 'cancelled', 'canceled', 'expired', 'suspended', 'test') then subscription_status
    when subscription_status is null or subscription_status = '' then 'requested'
    else 'requested'
  end,
  case when is_seed_profile or is_test_account then 'manual_admin' else coalesce(nullif(subscription_managed_by, ''), 'manual_admin') end,
  coalesce(listing_price, 0),
  coalesce(currency, listing_currency, 'EUR'),
  coalesce(subscription_start, subscription_started_at),
  coalesce(subscription_end, subscription_expires_at),
  subscription_managed_by,
  subscription_note,
  jsonb_build_object('source', 'admin_full_profile_backfill')
from public.profiles
where owner_email is not null or user_id is not null
on conflict (profile_id) do update set
  email = excluded.email,
  profile_display_name = excluded.profile_display_name,
  role = excluded.role,
  plan = excluded.plan,
  status = excluded.status,
  provider = coalesce(public.subscriptions.provider, excluded.provider),
  amount_eur = excluded.amount_eur,
  currency = excluded.currency,
  current_period_start = excluded.current_period_start,
  current_period_end = excluded.current_period_end,
  managed_by = excluded.managed_by,
  admin_note = excluded.admin_note,
  updated_at = now();

create index if not exists profiles_owner_email_idx on public.profiles (owner_email);
create index if not exists profiles_profile_type_idx on public.profiles (profile_type);
create index if not exists subscriptions_email_idx on public.subscriptions (email);
