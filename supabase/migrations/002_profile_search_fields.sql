alter table public.profiles
  add column if not exists age integer,
  add column if not exists height integer,
  add column if not exists orientation text,
  add column if not exists audience text[] default '{}',
  add column if not exists visit_types text[] default '{}',
  add column if not exists service_tags text[] default '{}',
  add column if not exists payment_methods text[] default '{}',
  add column if not exists availability_note text;

create index if not exists profiles_age_idx on public.profiles (age);
create index if not exists profiles_height_idx on public.profiles (height);
create index if not exists profiles_orientation_idx on public.profiles (orientation);
create index if not exists profiles_audience_gin_idx on public.profiles using gin (audience);
create index if not exists profiles_visit_types_gin_idx on public.profiles using gin (visit_types);
create index if not exists profiles_service_tags_gin_idx on public.profiles using gin (service_tags);
create index if not exists profiles_payment_methods_gin_idx on public.profiles using gin (payment_methods);
