alter table public.profiles
  add column if not exists location_mode text default 'city_only'
    check (location_mode in ('exact_hidden', 'approximate', 'city_only')),
  add column if not exists services text[] default '{}';

create index if not exists profiles_location_mode_idx on public.profiles (location_mode);
create index if not exists profiles_services_gin_idx on public.profiles using gin (services);
