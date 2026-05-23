create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  label text not null,
  group_key text default 'premium',
  active boolean default true,
  sort_order integer default 100,
  created_at timestamptz default now()
);

create table if not exists public.profile_tags (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (profile_id, tag_id)
);

create table if not exists public.master_admin_wallets (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Escort Radar Master Reserve',
  reserve_asset text not null default 'TATACoin',
  reserve_amount numeric default 500000,
  distributed_amount numeric default 0,
  burned_amount numeric default 0,
  locked_amount numeric default 0,
  revenue_estimate_eur numeric default 0,
  solana_wallet_address text,
  phantom_connected boolean default false,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.token_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  wallet_id uuid references public.wallets(id) on delete set null,
  package_id uuid references public.token_packages(id) on delete set null,
  token_amount integer not null,
  eur_price numeric not null,
  bonus_tokens integer default 0,
  status text default 'pending' check (status in ('pending', 'approved', 'failed', 'cancelled')),
  admin_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profile_images
  add column if not exists moderation_status text default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected', 'blocked')),
  add column if not exists admin_note text;

alter table public.profiles
  add column if not exists shadowbanned boolean default false,
  add column if not exists promoted_until timestamptz;

insert into public.tags (slug, label, group_key, sort_order)
values
  ('gfe', 'GFE', 'experience', 10),
  ('girlfriend-experience', 'Girlfriend Experience', 'experience', 11),
  ('escort', 'Escort', 'experience', 12),
  ('vip-dinner', 'VIP Dinner', 'experience', 13),
  ('travel', 'Travel', 'experience', 14),
  ('massage', 'Massage', 'wellness', 20),
  ('tantra', 'Tantra', 'wellness', 21),
  ('wellness', 'Wellness', 'wellness', 22),
  ('outcall', 'Outcall', 'visits', 30),
  ('incall', 'Incall', 'visits', 31),
  ('hotel-visit', 'Hotel Visit', 'visits', 32),
  ('private-show', 'Private Show', 'premium', 40),
  ('cam-show', 'Cam Show', 'premium', 41),
  ('live-cam', 'Live Cam', 'premium', 42),
  ('private-gallery', 'Private Gallery', 'premium', 43),
  ('duo', 'Duo', 'special', 50),
  ('couples', 'Couples', 'special', 51),
  ('roleplay', 'Roleplay', 'special', 52),
  ('bdsm', 'BDSM', 'special', 53),
  ('fetish', 'Fetish', 'special', 54),
  ('domination', 'Domination', 'special', 55),
  ('latex', 'Latex', 'special', 56),
  ('foot-fetish', 'Foot Fetish', 'special', 57),
  ('strip', 'Strip', 'show', 60),
  ('pole-dance', 'Pole Dance', 'show', 61),
  ('lingerie', 'Lingerie', 'show', 62),
  ('deep-throat', 'Deep Throat', 'adult', 70),
  ('french-kiss', 'French Kiss', 'adult', 71),
  ('oral', 'Oral', 'adult', 72),
  ('anal', 'Anal', 'adult', 73),
  ('classic-sex', 'Classic Sex', 'adult', 74),
  ('erotic-massage', 'Erotic Massage', 'massage', 80),
  ('nuru', 'Nuru', 'massage', 81),
  ('body-to-body', 'Body to Body', 'massage', 82),
  ('four-hands', 'Four Hands', 'massage', 83),
  ('soft-bdsm', 'Soft BDSM', 'bdsm', 90),
  ('submissive', 'Submissive', 'bdsm', 91),
  ('dominant', 'Dominant', 'bdsm', 92),
  ('bondage', 'Bondage', 'bdsm', 93),
  ('couple-friendly', 'Couple Friendly', 'couple', 100),
  ('party-date', 'Party Date', 'vip', 110),
  ('business-dinner', 'Business Dinner', 'vip', 111),
  ('weekend-trip', 'Weekend Trip', 'travel', 120),
  ('airport-pickup', 'Airport Pickup', 'travel', 121),
  ('online-chat', 'Online Chat', 'live', 130),
  ('private-cam', 'Private Cam', 'live', 131),
  ('fan-club', 'Fan Club', 'live', 132)
on conflict (slug) do update
set label = excluded.label,
    group_key = excluded.group_key,
    sort_order = excluded.sort_order,
    active = true;

insert into public.master_admin_wallets (name, reserve_asset, reserve_amount, active)
select 'Escort Radar Master Reserve', 'TATACoin', 500000, true
where not exists (select 1 from public.master_admin_wallets where active = true);

create index if not exists tags_active_group_idx on public.tags (active, group_key, sort_order);
create index if not exists tags_slug_idx on public.tags (slug);
create index if not exists profile_tags_profile_id_idx on public.profile_tags (profile_id);
create index if not exists profile_tags_tag_id_idx on public.profile_tags (tag_id);
create index if not exists master_admin_wallets_active_idx on public.master_admin_wallets (active);
create index if not exists token_purchase_requests_user_id_idx on public.token_purchase_requests (user_id);
create index if not exists token_purchase_requests_status_idx on public.token_purchase_requests (status);
create index if not exists profile_images_moderation_status_idx on public.profile_images (moderation_status);
create index if not exists profiles_shadowbanned_idx on public.profiles (shadowbanned);

alter table public.tags enable row level security;
alter table public.profile_tags enable row level security;
alter table public.token_purchase_requests enable row level security;

drop policy if exists "Anyone can read active tags" on public.tags;
create policy "Anyone can read active tags"
on public.tags for select
using (active = true);

drop policy if exists "Anyone can read profile tags" on public.profile_tags;
create policy "Anyone can read profile tags"
on public.profile_tags for select
using (true);

drop policy if exists "Users can read own token purchase requests" on public.token_purchase_requests;
create policy "Users can read own token purchase requests"
on public.token_purchase_requests for select
using (auth.uid() = user_id);
