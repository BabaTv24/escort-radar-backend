alter table public.client_activation_payments
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_event_id text,
  add column if not exists amount_eur numeric,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists coins_amount integer,
  add column if not exists business_id uuid references public.profiles(id) on delete set null,
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

alter table public.subscriptions
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_event_id text,
  add column if not exists amount_cents integer,
  add column if not exists coins_amount integer,
  add column if not exists business_id uuid references public.profiles(id) on delete set null,
  add column if not exists livemode boolean;

alter table public.token_purchase_requests
  add column if not exists provider text,
  add column if not exists transaction_type text not null default 'coins_purchase',
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_event_id text,
  add column if not exists amount_cents integer,
  add column if not exists currency text not null default 'eur',
  add column if not exists payment_status text,
  add column if not exists livemode boolean,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists coins_amount integer,
  add column if not exists business_id uuid references public.profiles(id) on delete set null,
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create table if not exists public.stripe_payment_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text unique not null,
  event_type text not null,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  provider text not null default 'stripe',
  transaction_type text,
  plan text,
  profile_id uuid references public.profiles(id) on delete set null,
  business_id uuid references public.profiles(id) on delete set null,
  coins_amount integer,
  amount_cents integer,
  amount_eur numeric,
  currency text not null default 'eur',
  payment_status text,
  status text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_subscription_id text,
  stripe_customer_id text,
  livemode boolean,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists stripe_payment_events_checkout_session_uidx
on public.stripe_payment_events (stripe_checkout_session_id)
where stripe_checkout_session_id is not null;

create unique index if not exists stripe_payment_events_payment_intent_uidx
on public.stripe_payment_events (stripe_payment_intent_id)
where stripe_payment_intent_id is not null
  and event_type in ('payment_intent.succeeded', 'checkout.session.completed');

create unique index if not exists stripe_payment_events_invoice_subscription_uidx
on public.stripe_payment_events (stripe_subscription_id, stripe_event_id)
where stripe_subscription_id is not null;

create index if not exists stripe_payment_events_revenue_idx
on public.stripe_payment_events (transaction_type, payment_status, provider, livemode, created_at desc);

create unique index if not exists client_activation_payments_checkout_session_uidx
on public.client_activation_payments (stripe_checkout_session_id)
where stripe_checkout_session_id is not null;

create unique index if not exists client_activation_payments_payment_intent_uidx
on public.client_activation_payments (stripe_payment_intent_id)
where stripe_payment_intent_id is not null;

create unique index if not exists subscriptions_stripe_subscription_uidx
on public.subscriptions (stripe_subscription_id)
where stripe_subscription_id is not null;

create unique index if not exists token_purchase_requests_checkout_session_uidx
on public.token_purchase_requests (stripe_checkout_session_id)
where stripe_checkout_session_id is not null;

create unique index if not exists token_purchase_requests_payment_intent_uidx
on public.token_purchase_requests (stripe_payment_intent_id)
where stripe_payment_intent_id is not null;

alter table public.stripe_payment_events enable row level security;
revoke all on public.stripe_payment_events from anon, authenticated;
