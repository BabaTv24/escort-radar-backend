create table if not exists public.client_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  city text default 'berlin',
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists client_profiles_user_id_idx on public.client_profiles (user_id);

alter table public.client_profiles enable row level security;

drop policy if exists "Users can read own client profile" on public.client_profiles;
create policy "Users can read own client profile"
on public.client_profiles for select
using (auth.uid() = user_id);

drop policy if exists "Users can update own client profile" on public.client_profiles;
create policy "Users can update own client profile"
on public.client_profiles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can insert own client profile" on public.client_profiles;
create policy "Users can insert own client profile"
on public.client_profiles for insert
with check (auth.uid() = user_id);
