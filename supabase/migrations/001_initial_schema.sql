create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  slug text unique not null,
  city text not null,
  area text,
  category text,
  description text,
  languages text[] default '{}',
  available_now boolean default false,
  mobile_service boolean default false,
  private_studio boolean default false,
  verified boolean default false,
  status text default 'pending' check (status in ('pending', 'active', 'rejected', 'suspended')),
  subscription_status text default 'trial',
  trial_ends_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.profile_images (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  is_primary boolean default false,
  is_blurred boolean default false,
  created_at timestamptz default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reporter_email text,
  reason text not null,
  message text,
  status text default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz default now()
);

create table public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  note text not null,
  created_at timestamptz default now()
);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

create index profiles_city_status_idx on public.profiles (city, status);
create index profiles_user_id_idx on public.profiles (user_id);
create index profile_images_profile_id_idx on public.profile_images (profile_id);
create index reports_status_idx on public.reports (status);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.profile_images enable row level security;
alter table public.reports enable row level security;
alter table public.admin_notes enable row level security;
alter table public.app_settings enable row level security;

create policy "Public can read active profiles"
on public.profiles for select
using (status = 'active' or auth.uid() = user_id);

create policy "Users can insert own profiles"
on public.profiles for insert
with check (auth.uid() = user_id);

create policy "Users can update own non-moderation fields"
on public.profiles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own profiles"
on public.profiles for delete
using (auth.uid() = user_id);

create policy "Public can read images for visible profiles"
on public.profile_images for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = profile_id and (p.status = 'active' or p.user_id = auth.uid())
  )
);

create policy "Users can manage images for own profiles"
on public.profile_images for all
using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.user_id = auth.uid())
)
with check (
  exists (select 1 from public.profiles p where p.id = profile_id and p.user_id = auth.uid())
);

create policy "Anyone can submit reports"
on public.reports for insert
with check (true);

create policy "Users can read reports for their profiles"
on public.reports for select
using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.user_id = auth.uid())
);
