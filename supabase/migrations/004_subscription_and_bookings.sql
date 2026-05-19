alter table public.profiles
  add column if not exists listing_plan text default 'premium_monthly',
  add column if not exists listing_price numeric default 49.99,
  add column if not exists listing_currency text default 'EUR',
  add column if not exists subscription_started_at timestamptz,
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists max_photos integer default 6;

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  requester_email text not null,
  requested_date date not null,
  requested_time time not null,
  duration_minutes integer not null,
  message text,
  status text default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists booking_requests_profile_id_idx on public.booking_requests (profile_id);
create index if not exists booking_requests_status_idx on public.booking_requests (status);
create index if not exists booking_requests_requested_date_idx on public.booking_requests (requested_date);

alter table public.booking_requests enable row level security;

create policy "Anyone can create booking requests"
on public.booking_requests for insert
with check (true);

create policy "Profile owners can read booking requests"
on public.booking_requests for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.user_id = auth.uid()
  )
);

create policy "Profile owners can update booking request status"
on public.booking_requests for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.user_id = auth.uid()
  )
);
