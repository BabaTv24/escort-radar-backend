alter table public.profiles
  add column if not exists postal_code text;

create index if not exists profiles_postal_code_idx
on public.profiles (postal_code);
