create table if not exists public.location_catalog (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  country_name text not null,
  city text not null,
  district text,
  postal_code text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists location_catalog_lookup_idx
on public.location_catalog (country_code, city, district, is_active, sort_order);

create unique index if not exists location_catalog_unique_active_idx
on public.location_catalog (
  country_code,
  city,
  coalesce(district, ''),
  coalesce(postal_code, '')
);

insert into public.location_catalog (country_code, country_name, city, district, sort_order)
values
  ('DE', 'Germany', 'Berlin', 'Mitte', 10),
  ('DE', 'Germany', 'Berlin', 'Friedrichshain', 20),
  ('DE', 'Germany', 'Berlin', 'Kreuzberg', 30),
  ('DE', 'Germany', 'Berlin', 'Neukolln', 40),
  ('DE', 'Germany', 'Berlin', 'Charlottenburg', 50),
  ('DE', 'Germany', 'Hamburg', 'St. Pauli', 60),
  ('DE', 'Germany', 'Hamburg', 'Altona', 70),
  ('DE', 'Germany', 'Munchen', 'Altstadt', 80),
  ('DE', 'Germany', 'Koln', 'Innenstadt', 90),
  ('DE', 'Germany', 'Hannover', 'Mitte', 100),
  ('NL', 'Netherlands', 'Amsterdam', null, 110),
  ('NL', 'Netherlands', 'Rotterdam', null, 120),
  ('BE', 'Belgium', 'Brussels', null, 130),
  ('BE', 'Belgium', 'Antwerp', null, 140),
  ('LU', 'Luxembourg', 'Luxembourg City', null, 150)
on conflict do nothing;
