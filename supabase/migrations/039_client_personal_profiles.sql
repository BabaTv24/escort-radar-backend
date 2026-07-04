create table if not exists public.client_personal_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  alternate_phone text,
  street text,
  house_number text,
  postal_code text,
  city text,
  country text,
  birth_date date null,
  identity_note text,
  delivery_note text,
  emergency_contact_name text,
  emergency_contact_phone text,
  consent_personal_data boolean not null default false,
  consent_home_service_contact boolean not null default false,
  consent_verified_client_badge boolean not null default false,
  profile_complete boolean not null default false,
  verification_status text not null default 'incomplete',
  verified_at timestamptz null,
  verified_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_personal_profiles_verification_status_check
    check (verification_status in ('incomplete', 'pending', 'verified', 'rejected'))
);

create index if not exists client_personal_profiles_status_idx
on public.client_personal_profiles (verification_status, updated_at desc);

drop trigger if exists set_client_personal_profiles_updated_at on public.client_personal_profiles;
create trigger set_client_personal_profiles_updated_at
before update on public.client_personal_profiles
for each row execute function public.set_updated_at();

alter table public.client_personal_profiles enable row level security;

drop policy if exists "client personal profiles owner select" on public.client_personal_profiles;
create policy "client personal profiles owner select"
on public.client_personal_profiles
for select
using (auth.uid() = user_id);

drop policy if exists "client personal profiles owner insert" on public.client_personal_profiles;
create policy "client personal profiles owner insert"
on public.client_personal_profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "client personal profiles owner update" on public.client_personal_profiles;
create policy "client personal profiles owner update"
on public.client_personal_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
