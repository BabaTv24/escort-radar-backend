begin;

alter table public.profiles
  drop constraint if exists profiles_location_mode_check;

alter table public.profiles
  add constraint profiles_location_mode_check
  check (
    location_mode is null
    or location_mode in (
      'exact',
      'exact_hidden',
      'approximate',
      'city_only'
    )
  );

commit;