alter table public.profiles
  add column if not exists advertiser_premium boolean not null default false,
  add column if not exists agency_premium boolean not null default false,
  add column if not exists premium_valid_until timestamptz;

create table if not exists public.manual_payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  provider text not null default 'manual'
    check (provider in ('manual', 'bank_transfer', 'crypto', 'ccbill', 'paysafe')),
  purpose text not null
    check (purpose in ('client_activation', 'advertiser_subscription', 'agency_subscription', 'token_package')),
  product_id text not null,
  product_label text not null,
  amount_cents integer not null check (amount_cents > 0),
  amount_eur numeric not null check (amount_eur > 0),
  currency text not null default 'EUR',
  tokens_amount integer,
  profile_id uuid references public.profiles(id) on delete set null,
  business_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'rejected', 'cancelled')),
  instructions text,
  admin_email text,
  approved_at timestamptz,
  rejected_at timestamptz,
  applied_at timestamptz,
  rejection_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manual_payment_orders_status_idx
on public.manual_payment_orders (status, created_at desc);

create index if not exists manual_payment_orders_email_idx
on public.manual_payment_orders (lower(email));

create index if not exists manual_payment_orders_user_id_idx
on public.manual_payment_orders (user_id);

alter table public.manual_payment_orders enable row level security;
revoke all on public.manual_payment_orders from anon, authenticated;

create table if not exists public.manual_payment_order_applications (
  order_id uuid primary key references public.manual_payment_orders(id) on delete cascade,
  applied_at timestamptz not null default now(),
  admin_email text
);

alter table public.manual_payment_order_applications enable row level security;
revoke all on public.manual_payment_order_applications from anon, authenticated;
