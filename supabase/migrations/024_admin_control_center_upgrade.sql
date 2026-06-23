alter table public.profile_images
  add column if not exists is_hidden boolean default false,
  add column if not exists is_private boolean default false,
  add column if not exists admin_note text,
  add column if not exists sort_order integer default 0;

alter table public.profile_images
  drop constraint if exists profile_images_moderation_status_check;

update public.profile_images
set moderation_status = 'approved'
where moderation_status is null;

alter table public.profile_images
  alter column moderation_status set default 'approved',
  add constraint profile_images_moderation_status_check
  check (moderation_status in ('pending', 'approved', 'rejected', 'blocked'));

alter table public.reports
  add column if not exists reporter_user_id uuid references auth.users(id) on delete set null,
  add column if not exists admin_note text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text;

alter table public.reports
  drop constraint if exists reports_admin_status_check;

update public.reports
set admin_status = case
  when admin_status in ('open', 'investigating', 'resolved', 'rejected', 'escalated') then admin_status
  when status = 'reviewing' then 'investigating'
  when status = 'dismissed' then 'rejected'
  when status = 'resolved' then 'resolved'
  else 'open'
end;

alter table public.reports
  add constraint reports_admin_status_check
  check (admin_status in ('open', 'investigating', 'resolved', 'rejected', 'escalated'));

create table if not exists public.profile_reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reporter_user_id uuid references auth.users(id) on delete set null,
  reporter_email text,
  reason text not null,
  message text,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'rejected')),
  admin_note text,
  created_at timestamptz default now(),
  resolved_at timestamptz,
  resolved_by text
);

alter table public.admin_activity_logs
  add column if not exists admin_id text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists before jsonb,
  add column if not exists after jsonb,
  add column if not exists note text;

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_email text,
  admin_id text,
  action text not null,
  target_type text,
  target_id uuid,
  entity_type text,
  entity_id text,
  details jsonb default '{}',
  before jsonb,
  after jsonb,
  note text,
  created_at timestamptz default now()
);

alter table public.admin_audit_log
  add column if not exists admin_email text,
  add column if not exists admin_id text,
  add column if not exists target_type text,
  add column if not exists target_id uuid,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists details jsonb default '{}',
  add column if not exists before jsonb,
  add column if not exists after jsonb,
  add column if not exists note text;

alter table public.app_settings
  add column if not exists updated_at timestamptz default now();

insert into public.app_settings (key, value)
values ('ai_moderation_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create index if not exists profile_images_visibility_idx
on public.profile_images (profile_id, moderation_status, is_hidden, is_private, sort_order);

create index if not exists reports_profile_status_idx
on public.reports (profile_id, admin_status, created_at desc);

create index if not exists profile_reports_profile_status_idx
on public.profile_reports (profile_id, status, created_at desc);

create index if not exists admin_activity_logs_entity_idx
on public.admin_activity_logs (entity_type, entity_id);
