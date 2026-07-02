alter table public.profiles
  add column if not exists location_visibility text not null default 'postal_area',
  add column if not exists price_3h numeric,
  add column if not exists service_pricing jsonb not null default '{}'::jsonb;

do $$
begin
  alter table public.profiles
    add constraint profiles_location_visibility_check
    check (location_visibility in ('exact', 'postal_area', 'city_only', 'hidden'))
    not valid;
exception
  when duplicate_object then null;
end $$;
