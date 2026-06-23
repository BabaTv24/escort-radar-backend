alter table public.profiles
  add column if not exists gender text,
  add column if not exists weight_kg integer,
  add column if not exists bust text,
  add column if not exists eyes text,
  add column if not exists hair text,
  add column if not exists travel text,
  add column if not exists ethnicity text,
  add column if not exists zodiac_sign text;
