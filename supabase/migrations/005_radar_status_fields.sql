alter table public.profiles
  add column if not exists availability_status text default 'unavailable'
    check (availability_status in ('available', 'busy', 'unavailable')),
  add column if not exists service_radius_km integer default 25,
  add column if not exists approximate_location_area text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists distance_km numeric;

create index if not exists profiles_availability_status_idx on public.profiles (availability_status);
create index if not exists profiles_service_radius_km_idx on public.profiles (service_radius_km);
create index if not exists profiles_city_availability_status_idx on public.profiles (city, availability_status);
