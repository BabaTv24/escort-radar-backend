update public.profiles
set category = 'other'
where category is null
   or category not in (
    'ladies',
    'gay',
    'couples',
    'trans',
    'massage',
    'house_hotel',
    'live_cam',
    'clubs_parties',
    'other'
   );

alter table public.profiles
  alter column category set default 'other';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_category_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_category_check
      check (
        category in (
          'ladies',
          'gay',
          'couples',
          'trans',
          'massage',
          'house_hotel',
          'live_cam',
          'clubs_parties',
          'other'
        )
      ) not valid;

    alter table public.profiles validate constraint profiles_category_check;
  end if;
end $$;

create index if not exists profiles_category_idx on public.profiles (category);
create index if not exists profiles_city_category_idx on public.profiles (city, category);
