create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  escort_token_balance numeric default 0,
  eur_spent numeric default 0,
  referral_balance numeric default 0,
  public_wallet_id text unique,
  solana_wallet_address text,
  phantom_connected boolean default false,
  frozen boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.token_transactions (
  id uuid primary key default gen_random_uuid(),
  from_wallet_id uuid references public.wallets(id),
  to_wallet_id uuid references public.wallets(id),
  amount numeric not null check (amount >= 0),
  transaction_type text not null,
  status text default 'pending',
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists public.token_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_amount integer not null,
  eur_price numeric not null,
  bonus_tokens integer default 0,
  featured boolean default false,
  active boolean default true
);

create table if not exists public.premium_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  target_profile_id uuid references public.profiles(id) on delete cascade,
  unlock_type text not null,
  token_cost numeric not null,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.live_stream_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  stream_type text default 'public',
  token_price_per_minute numeric default 0,
  ticket_token_cost numeric default 0,
  status text default 'scheduled',
  viewer_count integer default 0,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists public.private_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  billing_mode text default 'per_message',
  token_price numeric default 0,
  status text default 'pending',
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists public.fan_club_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  token_cost numeric default 0,
  status text default 'active',
  expires_at timestamptz,
  created_at timestamptz default now()
);

insert into public.token_packages (name, token_amount, eur_price, bonus_tokens, featured, active)
values
  ('Starter', 120, 18.00, 0, false, true),
  ('Radar', 520, 78.00, 20, false, true),
  ('Premium', 1200, 180.00, 80, false, true),
  ('Spotlight', 2560, 384.00, 260, true, true),
  ('Elite', 5200, 780.00, 700, false, true),
  ('Black Card', 10200, 1530.00, 1800, false, true)
on conflict do nothing;

create index if not exists wallets_user_id_idx on public.wallets (user_id);
create index if not exists wallets_public_wallet_id_idx on public.wallets (public_wallet_id);
create index if not exists token_transactions_from_wallet_id_idx on public.token_transactions (from_wallet_id);
create index if not exists token_transactions_to_wallet_id_idx on public.token_transactions (to_wallet_id);
create index if not exists token_transactions_type_status_idx on public.token_transactions (transaction_type, status);
create index if not exists token_packages_active_idx on public.token_packages (active);
create index if not exists premium_unlocks_user_id_idx on public.premium_unlocks (user_id);
create index if not exists premium_unlocks_target_profile_id_idx on public.premium_unlocks (target_profile_id);
create index if not exists live_stream_sessions_status_idx on public.live_stream_sessions (status);
create index if not exists private_chat_sessions_status_idx on public.private_chat_sessions (status);
