alter table public.profiles
  add column if not exists is_sponsored boolean not null default false,
  add column if not exists acquisition_source text,
  add column if not exists provider text,
  add column if not exists revenue_amount numeric not null default 0,
  add column if not exists business_id uuid references public.profiles(id) on delete set null,
  add column if not exists business_phone text,
  add column if not exists exact_address text,
  add column if not exists max_profiles integer not null default 30;

alter table public.subscriptions
  add column if not exists payment_status text,
  add column if not exists transaction_type text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists livemode boolean;

alter table public.client_activation_payments
  add column if not exists payment_status text,
  add column if not exists transaction_type text not null default 'client_activation',
  add column if not exists stripe_checkout_session_id text,
  add column if not exists livemode boolean;

update public.client_activation_payments
set
  payment_status = coalesce(payment_status, status),
  transaction_type = 'client_activation',
  stripe_checkout_session_id = coalesce(stripe_checkout_session_id, stripe_session_id);

update public.profiles p
set
  is_sponsored = true,
  acquisition_source = coalesce(nullif(p.acquisition_source, ''), 'admin_sponsored'),
  provider = coalesce(nullif(p.provider, ''), 'manual_admin'),
  revenue_amount = 0,
  listing_price = 0
where
  p.provider = 'manual_admin'
  or p.subscription_managed_by = 'manual_admin'
  or p.is_seed_profile = true
  or p.is_test_account = true
  or exists (
    select 1
    from public.subscriptions s
    where s.profile_id = p.id
      and s.provider = 'manual_admin'
  );

update public.subscriptions
set
  amount_eur = 0,
  payment_status = null,
  transaction_type = case
    when role in ('business', 'agency', 'club', 'massage_salon', 'brothel', 'live_cam') then 'business_subscription'
    else 'escort_subscription'
  end,
  livemode = false,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('real_revenue', false, 'reason', 'manual_admin_or_sponsored')
where provider in ('manual_admin', 'free', 'sponsored', 'test', 'migration')
  or exists (
    select 1
    from public.profiles p
    where p.id = public.subscriptions.profile_id
      and (p.is_sponsored = true or p.acquisition_source = 'admin_sponsored')
  );

create index if not exists profiles_sponsored_public_idx
on public.profiles (is_sponsored, status, is_published, moderation_status);

create index if not exists profiles_business_id_idx
on public.profiles (business_id);

create index if not exists subscriptions_real_revenue_idx
on public.subscriptions (transaction_type, payment_status, provider, livemode, current_period_end);

create or replace function public.enforce_business_profile_limit()
returns trigger
language plpgsql
as $$
declare
  parent_max integer;
  linked_count integer;
begin
  if new.business_id is null then
    return new;
  end if;

  select coalesce(max_profiles, 30)
  into parent_max
  from public.profiles
  where id = new.business_id;

  parent_max := least(coalesce(parent_max, 30), 30);

  select count(*)
  into linked_count
  from public.profiles
  where business_id = new.business_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if linked_count >= parent_max then
    raise exception 'Business profile limit reached (%)', parent_max
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_business_profile_limit_trigger on public.profiles;
create trigger enforce_business_profile_limit_trigger
before insert or update of business_id on public.profiles
for each row execute function public.enforce_business_profile_limit();
