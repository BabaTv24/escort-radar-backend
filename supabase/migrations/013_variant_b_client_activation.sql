alter table public.profiles
  add column if not exists whatsapp text,
  add column if not exists telegram text,
  add column if not exists vip_gallery_enabled boolean default false;

create table if not exists public.client_activations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  state text not null default 'client_free' check (state in ('client_free', 'client_activated')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  amount_eur numeric default 0.99,
  currency text default 'EUR',
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.client_referrals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  referral_code text not null unique,
  referral_link text not null,
  referred_by_code text,
  click_count integer default 0,
  registration_count integer default 0,
  activation_count integer default 0,
  earned_coins numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.client_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  referral_id uuid references public.client_referrals(id) on delete set null,
  referred_user_id uuid references auth.users(id) on delete set null,
  reward_type text not null,
  coins numeric not null default 0,
  status text not null default 'granted' check (status in ('pending', 'granted', 'cancelled')),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists public.coin_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  balance numeric not null default 0 check (balance >= 0),
  lifetime_earned numeric not null default 0,
  lifetime_spent numeric not null default 0,
  frozen boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.coin_wallets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  direction text not null check (direction in ('credit', 'debit')),
  transaction_type text not null,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'cancelled')),
  reference_type text,
  reference_id uuid,
  admin_email text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  receiver_profile_id uuid references public.profiles(id) on delete set null,
  receiver_user_id uuid references auth.users(id) on delete set null,
  gift_type text not null,
  coin_cost numeric not null check (coin_cost > 0),
  message text,
  status text not null default 'sent' check (status in ('sent', 'refunded', 'blocked')),
  created_at timestamptz default now()
);

create table if not exists public.vip_gallery_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  coin_cost numeric not null default 0,
  expires_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, profile_id)
);

create table if not exists public.referral_clicks (
  id uuid primary key default gen_random_uuid(),
  referral_code text not null,
  referrer_user_id uuid references auth.users(id) on delete set null,
  ip_hash text,
  user_agent text,
  landing_path text,
  created_at timestamptz default now()
);

create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  referral_code text not null unique,
  qr_payload text not null,
  qr_image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists client_activations_state_idx on public.client_activations (state);
create index if not exists client_referrals_referral_code_idx on public.client_referrals (referral_code);
create index if not exists client_referrals_referred_by_code_idx on public.client_referrals (referred_by_code);
create index if not exists client_rewards_user_id_idx on public.client_rewards (user_id);
create index if not exists coin_transactions_user_id_idx on public.coin_transactions (user_id, created_at desc);
create index if not exists coin_transactions_wallet_id_idx on public.coin_transactions (wallet_id, created_at desc);
create index if not exists gifts_sender_user_id_idx on public.gifts (sender_user_id, created_at desc);
create index if not exists gifts_receiver_user_id_idx on public.gifts (receiver_user_id, created_at desc);
create index if not exists vip_gallery_unlocks_user_id_idx on public.vip_gallery_unlocks (user_id);
create index if not exists referral_clicks_referral_code_idx on public.referral_clicks (referral_code, created_at desc);
create index if not exists qr_codes_user_id_idx on public.qr_codes (user_id);

alter table public.client_activations enable row level security;
alter table public.client_referrals enable row level security;
alter table public.client_rewards enable row level security;
alter table public.coin_wallets enable row level security;
alter table public.coin_transactions enable row level security;
alter table public.gifts enable row level security;
alter table public.vip_gallery_unlocks enable row level security;
alter table public.referral_clicks enable row level security;
alter table public.qr_codes enable row level security;

drop policy if exists "Users can read own client activation" on public.client_activations;
create policy "Users can read own client activation"
on public.client_activations for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own client referral" on public.client_referrals;
create policy "Users can read own client referral"
on public.client_referrals for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own rewards" on public.client_rewards;
create policy "Users can read own rewards"
on public.client_rewards for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own coin wallet" on public.coin_wallets;
create policy "Users can read own coin wallet"
on public.coin_wallets for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own coin transactions" on public.coin_transactions;
create policy "Users can read own coin transactions"
on public.coin_transactions for select
using (auth.uid() = user_id);

drop policy if exists "Users can read sent and received gifts" on public.gifts;
create policy "Users can read sent and received gifts"
on public.gifts for select
using (auth.uid() = sender_user_id or auth.uid() = receiver_user_id);

drop policy if exists "Users can read own VIP gallery unlocks" on public.vip_gallery_unlocks;
create policy "Users can read own VIP gallery unlocks"
on public.vip_gallery_unlocks for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own QR codes" on public.qr_codes;
create policy "Users can read own QR codes"
on public.qr_codes for select
using (auth.uid() = user_id);

revoke all on public.referral_clicks from anon, authenticated;
