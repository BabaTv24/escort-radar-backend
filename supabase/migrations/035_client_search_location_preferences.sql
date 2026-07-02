alter table public.client_profiles
  add column if not exists client_search_country text,
  add column if not exists client_search_city text,
  add column if not exists client_search_postal_code text,
  add column if not exists client_search_area text,
  add column if not exists client_search_lat numeric,
  add column if not exists client_search_lng numeric,
  add column if not exists client_search_label text;
