-- 059: advertiser-controlled text chat and AI assistant for every profile, on the existing
-- profile_chat_sessions / profile_chat_messages tables (migration 052). No second messaging system.
--
-- * profile_communication_settings: one optional row per profile. Without a row the previous
--   behaviour applies: admin-sponsored profiles keep chat + AI enabled, all other profiles have
--   chat disabled until the owner opts in. Video chat is not stored: it is not implemented.
-- * profile_chat_sessions.client_read_at: unread indicator for the client side
--   (owner_read_at already exists).
-- * start_paid_profile_chat: replaces the sponsored-only restriction with the owner's switch.
--   Charging, idempotency and ownership checks stay in charge_bcu_profile_interaction (052).
--
-- Additive only: no existing row, message, session or ledger entry is changed.
-- Apply to DEV first. Production only after an explicit release decision.

begin;

create table if not exists public.profile_communication_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  text_chat_enabled boolean not null default false,
  ai_assistant_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.profile_communication_settings enable row level security;
revoke all on public.profile_communication_settings from public, anon, authenticated;
grant all on public.profile_communication_settings to service_role;

drop trigger if exists set_profile_communication_settings_updated_at on public.profile_communication_settings;
create trigger set_profile_communication_settings_updated_at
before update on public.profile_communication_settings
for each row execute procedure public.set_updated_at();

alter table public.profile_chat_sessions add column if not exists client_read_at timestamptz;

create or replace function public.start_paid_profile_chat(
  p_client_user_id uuid,
  p_client_email text,
  p_profile_id uuid
)
returns public.profile_chat_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.profile_chat_sessions%rowtype;
  v_profile public.profiles%rowtype;
  v_text_chat_enabled boolean;
begin
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found then
    raise exception 'PROFILE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select s.text_chat_enabled into v_text_chat_enabled
  from public.profile_communication_settings s
  where s.profile_id = p_profile_id;
  if not coalesce(v_text_chat_enabled, v_profile.sponsorship_type = 'admin_sponsored') then
    raise exception 'TEXT_CHAT_DISABLED' using errcode = 'P0001';
  end if;

  insert into public.profile_chat_sessions (profile_id, client_user_id, client_email)
  values (p_profile_id, p_client_user_id, left(nullif(trim(p_client_email), ''), 160))
  on conflict (profile_id, client_user_id) do update set
    client_email = coalesce(excluded.client_email, public.profile_chat_sessions.client_email),
    updated_at = now()
  returning * into v_session;

  -- Charged once per client/profile relationship; the interaction key makes retries free.
  perform public.charge_bcu_profile_interaction(
    p_client_user_id, p_profile_id, 'chat',
    'chat:' || p_client_user_id::text || ':' || p_profile_id::text,
    v_session.id
  );
  return v_session;
end $$;

revoke execute on function public.start_paid_profile_chat(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.start_paid_profile_chat(uuid, text, uuid) to service_role;

commit;
