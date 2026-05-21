alter table public.profiles
  add column if not exists verification_status text default 'pending',
  add column if not exists moderation_status text default 'clean',
  add column if not exists is_test_account boolean default false,
  add column if not exists admin_note text,
  add column if not exists verified_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists blocked_at timestamptz;

update public.profiles
set verification_status = 'pending'
where verification_status is null
   or verification_status not in ('pending', 'verified', 'rejected', 'changes_requested');

update public.profiles
set moderation_status = 'clean'
where moderation_status is null
   or moderation_status not in ('clean', 'review', 'suspended', 'blocked');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_verification_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_verification_status_check
      check (verification_status in ('pending', 'verified', 'rejected', 'changes_requested')) not valid;

    alter table public.profiles validate constraint profiles_verification_status_check;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_moderation_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_moderation_status_check
      check (moderation_status in ('clean', 'review', 'suspended', 'blocked')) not valid;

    alter table public.profiles validate constraint profiles_moderation_status_check;
  end if;
end $$;

alter table public.reports
  add column if not exists admin_status text default 'open',
  add column if not exists admin_note text,
  add column if not exists escalated_to_authorities boolean default false,
  add column if not exists resolved_at timestamptz;

update public.reports
set admin_status = coalesce(nullif(admin_status, ''), status, 'open');

update public.reports
set admin_status = 'open'
where admin_status not in ('open', 'investigating', 'resolved', 'escalated');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reports_admin_status_check'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_admin_status_check
      check (admin_status in ('open', 'investigating', 'resolved', 'escalated')) not valid;

    alter table public.reports validate constraint reports_admin_status_check;
  end if;
end $$;

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  admin_email text,
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists profiles_verification_status_idx on public.profiles (verification_status);
create index if not exists profiles_moderation_status_idx on public.profiles (moderation_status);
create index if not exists profiles_is_test_account_idx on public.profiles (is_test_account);
create index if not exists profiles_status_verification_idx on public.profiles (status, verification_status);

create index if not exists reports_admin_status_idx on public.reports (admin_status);
create index if not exists reports_escalated_to_authorities_idx on public.reports (escalated_to_authorities);

create index if not exists admin_activity_logs_created_at_idx on public.admin_activity_logs (created_at desc);
create index if not exists admin_activity_logs_target_idx on public.admin_activity_logs (target_type, target_id);
create index if not exists admin_activity_logs_admin_email_idx on public.admin_activity_logs (admin_email);
