alter table public.profiles
  add column if not exists moderation_note text,
  add column if not exists suspended_reason text,
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_moderation_status_check;

update public.profiles
set moderation_status = case
  when moderation_status = 'clean' then 'approved'
  when moderation_status = 'review' then 'pending'
  when moderation_status = 'blocked' then 'rejected'
  when moderation_status in ('pending', 'approved', 'rejected', 'suspended') then moderation_status
  else 'pending'
end;

alter table public.profiles
  alter column moderation_status set default 'pending';

alter table public.profiles
  add constraint profiles_moderation_status_check
  check (moderation_status in ('pending', 'approved', 'rejected', 'suspended'));

create index if not exists profiles_public_approved_idx
on public.profiles (city, is_published, moderation_status, status);
