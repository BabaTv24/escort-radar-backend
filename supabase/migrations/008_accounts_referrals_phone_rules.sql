alter table public.profiles
  add column if not exists account_type text default 'private',
  add column if not exists primary_phone text,
  add column if not exists additional_phones text[] default '{}',
  add column if not exists phone_owner_identity_label text,
  add column if not exists phone_rule_confirmed boolean default false,
  add column if not exists phone_conflict_status text default 'clear',
  add column if not exists public_user_id text unique,
  add column if not exists referral_code text unique,
  add column if not exists referred_by_code text,
  add column if not exists referral_count integer default 0;

update public.profiles
set account_type = 'private'
where account_type is null
   or account_type not in ('private', 'agency', 'massage_salon', 'club_party', 'live_cam');

update public.profiles
set phone_conflict_status = 'clear'
where phone_conflict_status is null
   or phone_conflict_status not in ('clear', 'warning', 'conflict');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_account_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_type_check
      check (account_type in ('private', 'agency', 'massage_salon', 'club_party', 'live_cam')) not valid;

    alter table public.profiles validate constraint profiles_account_type_check;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_phone_conflict_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_phone_conflict_status_check
      check (phone_conflict_status in ('clear', 'warning', 'conflict')) not valid;

    alter table public.profiles validate constraint profiles_phone_conflict_status_check;
  end if;
end $$;

create index if not exists profiles_account_type_idx on public.profiles (account_type);
create index if not exists profiles_primary_phone_idx on public.profiles (primary_phone);
create index if not exists profiles_referral_code_idx on public.profiles (referral_code);
create index if not exists profiles_public_user_id_idx on public.profiles (public_user_id);
create index if not exists profiles_phone_conflict_status_idx on public.profiles (phone_conflict_status);
