create table if not exists public.client_activation_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  amount_cents integer not null,
  currency text not null default 'eur',
  status text not null default 'paid',
  provider text not null default 'stripe',
  stripe_session_id text unique not null,
  stripe_payment_intent_id text,
  created_at timestamptz default now()
);

create index if not exists client_activation_payments_user_id_idx
on public.client_activation_payments (user_id);

create index if not exists client_activation_payments_created_at_idx
on public.client_activation_payments (created_at desc);

create index if not exists client_activation_payments_status_idx
on public.client_activation_payments (status);

alter table public.client_activation_payments enable row level security;

revoke all on public.client_activation_payments from anon, authenticated;
