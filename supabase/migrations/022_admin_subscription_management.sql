alter table public.profiles
  add column if not exists subscription_plan text,
  add column if not exists subscription_start timestamptz,
  add column if not exists subscription_end timestamptz,
  add column if not exists subscription_requested_at timestamptz,
  add column if not exists subscription_managed_by text,
  add column if not exists subscription_note text;

update public.profiles
set
  subscription_plan = coalesce(subscription_plan, listing_plan, plan),
  subscription_start = coalesce(subscription_start, subscription_started_at),
  subscription_end = coalesce(subscription_end, subscription_expires_at),
  subscription_requested_at = coalesce(subscription_requested_at, created_at)
where true;

alter table public.subscriptions
  add column if not exists requested_at timestamptz default now(),
  add column if not exists managed_by text,
  add column if not exists admin_note text,
  add column if not exists role text,
  add column if not exists profile_display_name text;

create index if not exists profiles_subscription_admin_idx
on public.profiles (subscription_status, subscription_end, listing_plan);

create index if not exists subscriptions_admin_status_idx
on public.subscriptions (status, current_period_end, requested_at);
