alter table public.profiles
  add column if not exists travels boolean,
  add column if not exists penis_length_cm numeric,
  add column if not exists penis_diameter_cm numeric;

do $$
begin
  alter table public.profiles
    add constraint profiles_penis_length_cm_range
    check (penis_length_cm is null or (penis_length_cm >= 5 and penis_length_cm <= 35))
    not valid;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.profiles
    add constraint profiles_penis_diameter_cm_range
    check (penis_diameter_cm is null or (penis_diameter_cm >= 1 and penis_diameter_cm <= 10))
    not valid;
exception
  when duplicate_object then null;
end $$;
