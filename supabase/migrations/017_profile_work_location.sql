alter table public.profiles
  add column if not exists work_country text,
  add column if not exists work_city text,
  add column if not exists work_area text,
  add column if not exists work_place_label text,
  add column if not exists location_updated_at timestamptz,
  add column if not exists auto_location_on_login boolean default false,
  add column if not exists auto_location_while_online boolean default false;

create index if not exists profiles_work_country_idx on public.profiles (work_country);
create index if not exists profiles_work_city_idx on public.profiles (work_city);
create index if not exists profiles_location_updated_at_idx on public.profiles (location_updated_at desc);
