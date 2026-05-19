alter table public.profiles
  add column if not exists body_type text,
  add column if not exists body_features text[] default '{}',
  add column if not exists hair_color text,
  add column if not exists origin text,
  add column if not exists experience_type text,
  add column if not exists price_30min numeric,
  add column if not exists price_1h numeric,
  add column if not exists price_2h numeric,
  add column if not exists price_night numeric,
  add column if not exists outcall_fee numeric,
  add column if not exists currency text default 'EUR',
  add column if not exists service_menu jsonb default '[]';

create index if not exists profiles_body_type_idx on public.profiles (body_type);
create index if not exists profiles_hair_color_idx on public.profiles (hair_color);
create index if not exists profiles_origin_idx on public.profiles (origin);
create index if not exists profiles_service_menu_gin_idx on public.profiles using gin (service_menu);
