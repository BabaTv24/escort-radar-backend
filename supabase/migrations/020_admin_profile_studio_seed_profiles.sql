alter table public.profiles
  alter column user_id drop not null;

alter table public.profiles
  add column if not exists is_seed_profile boolean default false,
  add column if not exists is_published boolean default true,
  add column if not exists premium_tier text default 'standard',
  add column if not exists admin_priority integer default 0,
  add column if not exists nationality text,
  add column if not exists height_cm integer;

alter table public.profiles
  drop constraint if exists profiles_premium_tier_check;

alter table public.profiles
  add constraint profiles_premium_tier_check
  check (premium_tier in ('standard', 'gold', 'elite', 'diamond'));

update public.profiles
set
  is_published = coalesce(is_published, status = 'active'),
  is_seed_profile = coalesce(is_seed_profile, false),
  premium_tier = coalesce(premium_tier, 'standard'),
  admin_priority = coalesce(admin_priority, 0),
  height_cm = coalesce(height_cm, height)
where true;

create index if not exists profiles_public_marketplace_idx
on public.profiles (city, status, is_published, admin_priority desc, available_now desc);

create index if not exists profiles_seed_idx
on public.profiles (is_seed_profile, city);

alter table public.profile_images
  add column if not exists sort_order integer default 0;

create index if not exists profile_images_profile_sort_idx
on public.profile_images (profile_id, sort_order, created_at);
