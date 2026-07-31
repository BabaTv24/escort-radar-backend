-- Persist the source and precision of the coherent profile location snapshot.
-- Existing rows remain null until their location is saved again.

alter table public.profiles
  add column if not exists location_precision text,
  add column if not exists location_input_source text;
