create table if not exists public.client_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'BROWSING'
    check (status in ('LOOKING_NOW', 'LOOKING_TODAY', 'TRAVELING', 'BROWSING', 'OFFLINE')),
  city text not null default 'berlin',
  area text,
  radius_km integer not null default 25 check (radius_km between 1 and 100),
  category text,
  services text[] default '{}',
  budget_min integer,
  budget_max integer,
  time_window text,
  active boolean not null default true,
  expires_at timestamptz not null default (now() + interval '2 hours'),
  last_matched_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists client_intents_one_active_idx
on public.client_intents (user_id)
where active = true;

create index if not exists client_intents_city_active_idx on public.client_intents (city, active);
create index if not exists client_intents_expires_at_idx on public.client_intents (expires_at);
create index if not exists client_intents_status_idx on public.client_intents (status);

create table if not exists public.radar_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('client', 'advertiser')),
  event_type text not null,
  title text not null,
  body text,
  profile_id uuid references public.profiles(id) on delete cascade,
  client_intent_id uuid references public.client_intents(id) on delete cascade,
  match_score integer default 0,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists radar_notifications_user_id_idx on public.radar_notifications (user_id, created_at desc);
create index if not exists radar_notifications_event_type_idx on public.radar_notifications (event_type);

alter table public.client_intents enable row level security;
alter table public.radar_notifications enable row level security;

revoke all on public.client_intents from anon, authenticated;
revoke all on public.radar_notifications from anon, authenticated;
