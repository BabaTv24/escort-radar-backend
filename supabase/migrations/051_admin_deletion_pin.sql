begin;

create table if not exists public.admin_security_settings (
  admin_id text primary key,
  deletion_pin_hash text not null,
  deletion_pin_set_at timestamptz not null default now(),
  deletion_pin_updated_at timestamptz not null default now(),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  attempt_window_started_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_security_settings enable row level security;

revoke all privileges on table public.admin_security_settings from public, anon, authenticated, service_role;
grant select, insert, update on table public.admin_security_settings to service_role;

create or replace function public.record_admin_deletion_pin_failure(p_admin_id text)
returns table(failed_attempts integer, locked_until timestamptz)
language sql
security definer
set search_path = pg_catalog
as $$
  update public.admin_security_settings
  set
    failed_attempts = case
      when attempt_window_started_at is null or attempt_window_started_at <= now() - interval '15 minutes' then 1
      else failed_attempts + 1
    end,
    attempt_window_started_at = case
      when attempt_window_started_at is null or attempt_window_started_at <= now() - interval '15 minutes' then now()
      else attempt_window_started_at
    end,
    locked_until = case
      when (
        case
          when attempt_window_started_at is null or attempt_window_started_at <= now() - interval '15 minutes' then 1
          else failed_attempts + 1
        end
      ) >= 5 then now() + interval '15 minutes'
      else null
    end,
    updated_at = now()
  where admin_id = p_admin_id
  returning admin_security_settings.failed_attempts, admin_security_settings.locked_until;
$$;

revoke all on function public.record_admin_deletion_pin_failure(text) from public, anon, authenticated, service_role;
grant execute on function public.record_admin_deletion_pin_failure(text) to service_role;

commit;
