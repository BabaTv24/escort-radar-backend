alter table public.profiles
  add column if not exists source_url text,
  add column if not exists import_source text,
  add column if not exists imported_at timestamptz;

create index if not exists profiles_import_source_idx
on public.profiles (import_source, imported_at);
