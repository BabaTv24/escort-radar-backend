-- ER-V1-PUBLIC-PREVIEW-003: pre-launch interest list (double opt-in).
-- Voluntary e-mail interest in two future products. No accounts, passwords, payment data, phone numbers,
-- addresses, browsing histories or preferences are stored. Only the backend (service_role) reads or writes.
-- Collection is off unless WAITLIST_COLLECTION_ENABLED=true on the backend.

create table if not exists public.waitlist_leads (
  id uuid primary key default gen_random_uuid(),
  -- Null only after an unsubscribed record has been anonymised by the retention job.
  email text,
  interest_type text not null,
  preferred_language text not null default 'de',
  status text not null default 'pending',
  consent_version text not null,
  consent_given_at timestamptz not null default now(),
  source_page text not null default 'unknown',
  -- SHA-256 of the random confirmation token; the token itself is only in the e-mail.
  confirm_token_hash text,
  confirm_token_expires_at timestamptz,
  confirmation_sent_at timestamptz,
  confirmation_send_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  constraint waitlist_leads_interest_type_check check (interest_type in ('client_premium', 'advertiser')),
  constraint waitlist_leads_language_check check (preferred_language in ('de', 'pl', 'en')),
  constraint waitlist_leads_status_check check (status in ('pending', 'confirmed', 'unsubscribed')),
  constraint waitlist_leads_email_check check (email is null or (email = lower(email) and char_length(email) between 6 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  constraint waitlist_leads_email_required check (email is not null or status = 'unsubscribed'),
  constraint waitlist_leads_source_check check (source_page ~ '^[a-z_]{1,40}$'),
  constraint waitlist_leads_token_hash_check check (confirm_token_hash is null or confirm_token_hash ~ '^[0-9a-f]{64}$'),
  constraint waitlist_leads_confirmed_check check (status <> 'confirmed' or confirmed_at is not null)
);

-- One record per address and segment; the same address may be interested in both segments.
create unique index if not exists waitlist_leads_email_interest_key on public.waitlist_leads (email, interest_type) where email is not null;
create unique index if not exists waitlist_leads_confirm_token_key on public.waitlist_leads (confirm_token_hash) where confirm_token_hash is not null;
create index if not exists waitlist_leads_status_idx on public.waitlist_leads (status, interest_type);
create index if not exists waitlist_leads_created_idx on public.waitlist_leads (created_at);

alter table public.waitlist_leads enable row level security;
revoke all on public.waitlist_leads from public, anon, authenticated;
grant select, insert, update, delete on public.waitlist_leads to service_role;

-- Future launch announcement (prepared, sending is off unless WAITLIST_LAUNCH_SEND_ENABLED=true).
create table if not exists public.waitlist_announcements (
  id uuid primary key default gen_random_uuid(),
  interest_type text not null,
  template_version text not null,
  status text not null default 'sending',
  created_by text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  recipients integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  constraint waitlist_announcements_interest_type_check check (interest_type in ('client_premium', 'advertiser')),
  constraint waitlist_announcements_status_check check (status in ('sending', 'sent'))
);
-- At most one launch announcement per segment.
create unique index if not exists waitlist_announcements_segment_key on public.waitlist_announcements (interest_type);

create table if not exists public.waitlist_deliveries (
  id bigint generated always as identity primary key,
  announcement_id uuid not null references public.waitlist_announcements (id) on delete cascade,
  lead_id uuid not null references public.waitlist_leads (id) on delete cascade,
  status text not null,
  error_code text,
  attempted_at timestamptz not null default now(),
  constraint waitlist_deliveries_status_check check (status in ('sent', 'failed')),
  constraint waitlist_deliveries_error_check check (error_code is null or char_length(error_code) <= 80)
);
create unique index if not exists waitlist_deliveries_once_key on public.waitlist_deliveries (announcement_id, lead_id);

alter table public.waitlist_announcements enable row level security;
alter table public.waitlist_deliveries enable row level security;
revoke all on public.waitlist_announcements from public, anon, authenticated;
revoke all on public.waitlist_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.waitlist_announcements to service_role;
grant select, insert, update, delete on public.waitlist_deliveries to service_role;
revoke all on sequence public.waitlist_deliveries_id_seq from public, anon, authenticated;
grant usage, select on sequence public.waitlist_deliveries_id_seq to service_role;

-- Retention (called by the backend at startup and every 6 hours):
--   pending (never confirmed) records are deleted after p_pending_days;
--   unsubscribed records are anonymised (e-mail removed) after p_unsubscribed_days;
--   confirmed records are deleted p_confirmed_days after confirmation.
create or replace function public.prune_waitlist(p_pending_days integer default 30, p_unsubscribed_days integer default 30, p_confirmed_days integer default 730)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_pending integer;
  v_unsubscribed integer;
  v_confirmed integer;
begin
  delete from public.waitlist_leads
    where status = 'pending' and created_at < now() - make_interval(days => greatest(p_pending_days, 1));
  get diagnostics v_pending = row_count;
  update public.waitlist_leads
    set email = null, confirm_token_hash = null, confirm_token_expires_at = null, updated_at = now()
    where status = 'unsubscribed' and email is not null and unsubscribed_at < now() - make_interval(days => greatest(p_unsubscribed_days, 0));
  get diagnostics v_unsubscribed = row_count;
  delete from public.waitlist_leads
    where status = 'confirmed' and confirmed_at < now() - make_interval(days => greatest(p_confirmed_days, 30));
  get diagnostics v_confirmed = row_count;
  return jsonb_build_object('pending_deleted', v_pending, 'unsubscribed_anonymised', v_unsubscribed, 'confirmed_deleted', v_confirmed);
end;
$$;

revoke all on function public.prune_waitlist(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.prune_waitlist(integer, integer, integer) to service_role;
