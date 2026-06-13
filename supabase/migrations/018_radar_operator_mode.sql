alter table public.profiles
  add column if not exists operator_status text default 'OFFLINE'
    check (operator_status in ('ONLINE_NOW', 'BUSY', 'TRAVELING', 'AVAILABLE_TODAY', 'APPOINTMENT_ONLY', 'OFFLINE')),
  add column if not exists working_today_start time,
  add column if not exists working_today_end time,
  add column if not exists working_tomorrow_start time,
  add column if not exists working_tomorrow_end time,
  add column if not exists working_24_7 boolean default false,
  add column if not exists travel_city text,
  add column if not exists travel_arrival_date date,
  add column if not exists travel_departure_date date,
  add column if not exists hotspot_type text
    check (hotspot_type is null or hotspot_type in ('hotel', 'apartment', 'club', 'private', 'mobile', 'vacation'));

create index if not exists profiles_operator_status_idx on public.profiles (operator_status);
create index if not exists profiles_travel_city_idx on public.profiles (travel_city);
create index if not exists profiles_travel_dates_idx on public.profiles (travel_arrival_date, travel_departure_date);
create index if not exists profiles_hotspot_type_idx on public.profiles (hotspot_type);
