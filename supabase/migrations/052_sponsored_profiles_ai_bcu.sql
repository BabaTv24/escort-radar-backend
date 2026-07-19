-- Sponsored profile ownership activation, AI conversations and paid BCU interactions.
-- 1 BC = 10 000 BCU. Apply after 046_bcu_favorites_atomic_transfer.sql.

alter table public.profiles
  add column if not exists sponsorship_type text not null default 'none',
  add column if not exists owner_activation_status text not null default 'not_required',
  add column if not exists owner_activated_at timestamptz,
  add column if not exists ai_agent_mode text not null default 'disabled';

alter table public.profiles drop constraint if exists profiles_sponsorship_type_check;
alter table public.profiles add constraint profiles_sponsorship_type_check
  check (sponsorship_type in ('none', 'admin_sponsored'));
alter table public.profiles drop constraint if exists profiles_owner_activation_status_check;
alter table public.profiles add constraint profiles_owner_activation_status_check
  check (owner_activation_status in ('not_required', 'awaiting_owner_activation', 'active'));
alter table public.profiles drop constraint if exists profiles_ai_agent_mode_check;
alter table public.profiles add constraint profiles_ai_agent_mode_check
  check (ai_agent_mode in ('disabled', 'pre_activation', 'owner_assistant'));

alter table public.bcu_wallets
  add column if not exists locked_balance_bcu bigint not null default 0;
alter table public.bcu_wallets drop constraint if exists bcu_wallets_locked_balance_check;
alter table public.bcu_wallets add constraint bcu_wallets_locked_balance_check
  check (locked_balance_bcu >= 0 and locked_balance_bcu <= balance_bcu);

create or replace function public.protect_locked_bcu_balance()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.balance_bcu < new.locked_balance_bcu then
    raise exception 'BCU_LOCKED_BALANCE' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists protect_locked_bcu_balance_trigger on public.bcu_wallets;
create trigger protect_locked_bcu_balance_trigger
before insert or update of balance_bcu, locked_balance_bcu on public.bcu_wallets
for each row execute function public.protect_locked_bcu_balance();

insert into public.system_bcu_products
  (product_code, display_name, amount_bcu, operation_type, active, metadata)
values
  ('sponsored_profile_activation_bonus', 'Sponsored profile activation bonus', 70000, 'credit', true, '{"locked_until_owner_activation":true}'::jsonb),
  ('profile_chat', 'Profile chat', 30000, 'transfer', true, '{}'::jsonb),
  ('profile_booking', 'Profile booking request', 50000, 'transfer', true, '{}'::jsonb),
  ('profile_videochat', 'Profile video chat attempt', 70000, 'transfer', true, '{}'::jsonb)
on conflict (product_code) do update set
  display_name = excluded.display_name,
  amount_bcu = excluded.amount_bcu,
  operation_type = excluded.operation_type,
  active = excluded.active,
  metadata = excluded.metadata,
  updated_at = now();

create table if not exists public.profile_ai_agents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  display_name text not null default 'Asystent Profilu Escort Radar',
  mode text not null default 'pre_activation'
    check (mode in ('pre_activation', 'owner_assistant', 'disabled')),
  model text not null default 'gpt-5.6-luna',
  disclosure text not null default 'Jestem Asystentem Profilu Escort Radar. To konto nie zostało jeszcze aktywowane przez właściciela.',
  active boolean not null default true,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sponsored_profile_claim_invites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_user_id uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((used_at is null and used_by_user_id is null) or (used_at is not null and used_by_user_id is not null))
);

create unique index if not exists sponsored_profile_one_open_invite_idx
  on public.sponsored_profile_claim_invites (profile_id)
  where used_at is null and revoked_at is null;

create table if not exists public.sponsored_profile_claim_attempts (
  id bigint generated always as identity primary key,
  claimant_user_id uuid not null references auth.users(id) on delete cascade,
  ip_hash text not null check (char_length(ip_hash) between 16 and 128),
  attempted_at timestamptz not null default now()
);

create index if not exists sponsored_profile_claim_attempts_user_time_idx
  on public.sponsored_profile_claim_attempts (claimant_user_id, attempted_at desc);
create index if not exists sponsored_profile_claim_attempts_ip_time_idx
  on public.sponsored_profile_claim_attempts (ip_hash, attempted_at desc);

create table if not exists public.sponsored_profile_claim_audits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  invite_id uuid not null unique references public.sponsored_profile_claim_invites(id) on delete restrict,
  technical_user_id uuid not null references auth.users(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  source_wallet_id uuid not null references public.bcu_wallets(id) on delete restrict,
  target_wallet_id uuid not null references public.bcu_wallets(id) on delete restrict,
  transferred_balance_bcu bigint not null check (transferred_balance_bcu >= 0),
  activation_evidence text not null check (activation_evidence in ('confirmed_activation')),
  created_at timestamptz not null default now()
);

create table if not exists public.profile_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  client_user_id uuid not null references auth.users(id) on delete restrict,
  client_email text,
  status text not null default 'open'
    check (status in ('open', 'owner_takeover', 'closed')),
  handled_by text not null default 'agent' check (handled_by in ('agent', 'owner')),
  owner_read_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, client_user_id)
);

create table if not exists public.profile_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.profile_chat_sessions(id) on delete cascade,
  sender_type text not null check (sender_type in ('client', 'agent', 'owner')),
  sender_user_id uuid references auth.users(id) on delete set null,
  content text not null check (char_length(content) between 1 and 4000),
  agent_disclosure_shown boolean not null default false,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.bcu_profile_interactions (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  interaction_type text not null check (interaction_type in ('chat', 'booking', 'videochat')),
  interaction_key text not null unique,
  amount_bcu bigint not null check (amount_bcu in (30000, 50000, 70000)),
  debit_ledger_entry_id uuid not null unique references public.bcu_ledger_entries(id) on delete restrict,
  credit_ledger_entry_id uuid not null unique references public.bcu_ledger_entries(id) on delete restrict,
  reference_id uuid,
  status text not null default 'completed' check (status = 'completed'),
  created_at timestamptz not null default now()
);

alter table public.booking_requests
  add column if not exists requester_user_id uuid references auth.users(id) on delete set null,
  add column if not exists chat_session_id uuid references public.profile_chat_sessions(id) on delete set null,
  add column if not exists client_request_key text,
  add column if not exists owner_claimed_at timestamptz;
alter table public.booking_requests drop constraint if exists booking_requests_status_check;
alter table public.booking_requests add constraint booking_requests_status_check
  check (status in ('pending', 'awaiting_owner_activation', 'accepted', 'rejected', 'cancelled'));

create index if not exists profiles_owner_activation_idx
  on public.profiles (sponsorship_type, owner_activation_status, created_at desc);
create index if not exists profile_chat_sessions_profile_last_idx
  on public.profile_chat_sessions (profile_id, last_message_at desc);
create index if not exists profile_chat_messages_session_created_idx
  on public.profile_chat_messages (session_id, created_at);
create index if not exists bcu_profile_interactions_profile_created_idx
  on public.bcu_profile_interactions (profile_id, created_at desc);
create unique index if not exists booking_requests_client_request_unique_idx
  on public.booking_requests (requester_user_id, profile_id, client_request_key)
  where requester_user_id is not null and client_request_key is not null;

drop trigger if exists set_profile_ai_agents_updated_at on public.profile_ai_agents;
create trigger set_profile_ai_agents_updated_at before update on public.profile_ai_agents
for each row execute procedure public.set_updated_at();
drop trigger if exists set_profile_chat_sessions_updated_at on public.profile_chat_sessions;
create trigger set_profile_chat_sessions_updated_at before update on public.profile_chat_sessions
for each row execute procedure public.set_updated_at();

create or replace function public.provision_admin_sponsored_profile(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_bonus public.system_bcu_products%rowtype;
  v_entry public.bcu_ledger_entries%rowtype;
begin
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found or v_profile.sponsorship_type <> 'admin_sponsored' or v_profile.user_id is null then return; end if;

  insert into public.profile_ai_agents (profile_id, mode, active)
  values (v_profile.id, 'pre_activation', true)
  on conflict (profile_id) do nothing;

  select * into v_bonus from public.system_bcu_products
  where product_code = 'sponsored_profile_activation_bonus' and active = true;
  if not found or v_bonus.amount_bcu <> 70000 then
    raise exception 'SPONSORED_BONUS_PRODUCT_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.bcu_ledger_entries
    where idempotency_key = 'sponsored-profile-bonus:' || v_profile.id::text
  ) then
    v_entry := public.apply_bcu_ledger_entry(
      v_profile.user_id, v_bonus.amount_bcu, 'credit', 'sponsored_profile_activation_bonus',
      'sponsored-profile-bonus:' || v_profile.id::text,
      'profile', v_profile.id, 'bcu', 'profiles', v_profile.id,
      jsonb_build_object('locked_until_owner_activation', true), null,
      null, v_profile.user_id, v_profile.id
    );
    update public.bcu_wallets
    set locked_balance_bcu = locked_balance_bcu + v_bonus.amount_bcu, updated_at = now()
    where user_id = v_profile.user_id;
  end if;
end $$;

create or replace function public.sponsored_profile_provision_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sponsorship_type = 'admin_sponsored'
     and new.owner_activation_status = 'awaiting_owner_activation'
     and new.user_id is not null then
    perform public.provision_admin_sponsored_profile(new.id);
  end if;
  return new;
end $$;

create or replace function public.mark_new_admin_sponsored_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- INSERT-only provenance: a later admin edit cannot qualify an existing row.
  if new.is_sponsored is true
     and new.acquisition_source in ('admin_sponsored', 'hermes_import_sponsored')
     and new.provider in ('manual_admin', 'hermes_agent') then
    new.sponsorship_type := 'admin_sponsored';
    new.owner_activation_status := 'awaiting_owner_activation';
    new.ai_agent_mode := 'pre_activation';
  end if;
  return new;
end $$;

drop trigger if exists mark_new_admin_sponsored_profile_trigger on public.profiles;
create trigger mark_new_admin_sponsored_profile_trigger
before insert on public.profiles
for each row execute function public.mark_new_admin_sponsored_profile();

create or replace function public.replace_sponsored_profile_claim_invite(
  p_profile_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_created_by text
)
returns public.sponsored_profile_claim_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_invite public.sponsored_profile_claim_invites%rowtype;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_expires_at <= now() then
    raise exception 'SPONSORED_INVITE_INVALID' using errcode = 'P0001';
  end if;
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_profile.sponsorship_type <> 'admin_sponsored'
     or v_profile.owner_activation_status <> 'awaiting_owner_activation' then
    raise exception 'PROFILE_NOT_CLAIMABLE' using errcode = 'P0001';
  end if;

  update public.sponsored_profile_claim_invites
  set revoked_at = now()
  where profile_id = p_profile_id and used_at is null and revoked_at is null;
  insert into public.sponsored_profile_claim_invites (profile_id, token_hash, expires_at, created_by)
  values (p_profile_id, p_token_hash, p_expires_at, left(nullif(trim(p_created_by), ''), 200))
  returning * into v_invite;
  return v_invite;
end $$;

create or replace function public.register_sponsored_profile_claim_attempt(
  p_claimant_user_id uuid,
  p_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_attempts integer;
  v_ip_attempts integer;
begin
  if p_claimant_user_id is null or char_length(coalesce(p_ip_hash, '')) not between 16 and 128 then
    return false;
  end if;
  insert into public.sponsored_profile_claim_attempts (claimant_user_id, ip_hash)
  values (p_claimant_user_id, p_ip_hash);
  select count(*) into v_user_attempts from public.sponsored_profile_claim_attempts
  where claimant_user_id = p_claimant_user_id and attempted_at > now() - interval '15 minutes';
  select count(*) into v_ip_attempts from public.sponsored_profile_claim_attempts
  where ip_hash = p_ip_hash and attempted_at > now() - interval '15 minutes';
  return v_user_attempts <= 5 and v_ip_attempts <= 20;
end $$;

drop trigger if exists sponsored_profile_provision on public.profiles;
create trigger sponsored_profile_provision
after insert or update of sponsorship_type, owner_activation_status, user_id on public.profiles
for each row execute function public.sponsored_profile_provision_trigger();

create or replace function public.charge_bcu_profile_interaction(
  p_client_user_id uuid,
  p_profile_id uuid,
  p_interaction_type text,
  p_interaction_key text,
  p_reference_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_product public.system_bcu_products%rowtype;
  v_existing public.bcu_profile_interactions%rowtype;
  v_debit public.bcu_ledger_entries%rowtype;
  v_credit public.bcu_ledger_entries%rowtype;
  v_id uuid := gen_random_uuid();
  v_code text;
begin
  if p_interaction_type not in ('chat', 'booking', 'videochat') then
    raise exception 'BCU_INTERACTION_INVALID' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_interaction_key, '')), '') is null then
    raise exception 'BCU_IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  if char_length(p_interaction_key) > 320 then
    raise exception 'BCU_IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('bcu_profile_interaction'), hashtext(p_interaction_key));

  select * into v_existing from public.bcu_profile_interactions where interaction_key = p_interaction_key;
  if found then
    if v_existing.client_user_id <> p_client_user_id or v_existing.profile_id <> p_profile_id
       or v_existing.interaction_type <> p_interaction_type then
      raise exception 'BCU_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object('charged', false, 'interaction', to_jsonb(v_existing));
  end if;

  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.user_id is null or v_profile.user_id = p_client_user_id
     or v_profile.status <> 'active' or v_profile.is_published is not true
     or v_profile.moderation_status <> 'approved' then
    raise exception 'PROFILE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  v_code := case p_interaction_type
    when 'chat' then 'profile_chat'
    when 'booking' then 'profile_booking'
    else 'profile_videochat' end;
  select * into v_product from public.system_bcu_products
  where product_code = v_code and active = true and operation_type = 'transfer';
  if not found then raise exception 'BCU_PRODUCT_NOT_FOUND' using errcode = 'P0001'; end if;

  v_debit := public.apply_bcu_ledger_entry(
    p_client_user_id, v_product.amount_bcu, 'debit', p_interaction_type || '_sent',
    'profile-interaction-debit:' || p_interaction_key,
    'bcu_profile_interaction', v_id, 'bcu', 'bcu_profile_interactions', v_id,
    jsonb_build_object('interaction_type', p_interaction_type), p_client_user_id,
    p_client_user_id, v_profile.user_id, p_profile_id, null, null,
    case when p_interaction_type = 'booking' then p_reference_id else null end
  );
  v_credit := public.apply_bcu_ledger_entry(
    v_profile.user_id, v_product.amount_bcu, 'credit', p_interaction_type || '_received',
    'profile-interaction-credit:' || p_interaction_key,
    'bcu_profile_interaction', v_id, 'bcu', 'bcu_profile_interactions', v_id,
    jsonb_build_object('interaction_type', p_interaction_type), p_client_user_id,
    p_client_user_id, v_profile.user_id, p_profile_id, null, null,
    case when p_interaction_type = 'booking' then p_reference_id else null end
  );

  insert into public.bcu_profile_interactions (
    id, client_user_id, profile_id, recipient_user_id, interaction_type,
    interaction_key, amount_bcu, debit_ledger_entry_id, credit_ledger_entry_id, reference_id
  ) values (
    v_id, p_client_user_id, p_profile_id, v_profile.user_id, p_interaction_type,
    p_interaction_key, v_product.amount_bcu, v_debit.id, v_credit.id, p_reference_id
  ) returning * into v_existing;
  return jsonb_build_object('charged', true, 'interaction', to_jsonb(v_existing));
exception
  when raise_exception then
    if sqlerrm = 'BCU_INSUFFICIENT_BALANCE' then raise exception 'INSUFFICIENT_BCU' using errcode = 'P0001'; end if;
    if sqlerrm = 'BCU_LOCKED_BALANCE' then raise exception 'INSUFFICIENT_AVAILABLE_BCU' using errcode = 'P0001'; end if;
    raise;
end $$;

create or replace function public.claim_admin_sponsored_profile(p_claimant_user_id uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.sponsored_profile_claim_invites%rowtype;
  v_profile public.profiles%rowtype;
  v_source_wallet public.bcu_wallets%rowtype;
  v_target_wallet public.bcu_wallets%rowtype;
  v_transfer_amount bigint;
begin
  if p_claimant_user_id is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'SPONSORED_CLAIM_TOKEN_INVALID' using errcode = 'P0001';
  end if;
  select * into v_invite from public.sponsored_profile_claim_invites
  where token_hash = p_token_hash for update;
  if not found then raise exception 'SPONSORED_CLAIM_TOKEN_INVALID' using errcode = 'P0001'; end if;
  if v_invite.used_at is not null then
    if v_invite.used_by_user_id = p_claimant_user_id then
      select * into v_profile from public.profiles
      where id = v_invite.profile_id and user_id = p_claimant_user_id
        and owner_activation_status = 'active';
      if found then
        return jsonb_build_object('claimed', false, 'profile', to_jsonb(v_profile), 'idempotent', true);
      end if;
    end if;
    raise exception 'SPONSORED_CLAIM_TOKEN_USED' using errcode = 'P0001';
  end if;
  if v_invite.revoked_at is not null then raise exception 'SPONSORED_CLAIM_TOKEN_REVOKED' using errcode = 'P0001'; end if;
  if v_invite.expires_at <= now() then raise exception 'SPONSORED_CLAIM_TOKEN_EXPIRED' using errcode = 'P0001'; end if;

  select * into v_profile from public.profiles where id = v_invite.profile_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_profile.sponsorship_type <> 'admin_sponsored'
     or v_profile.owner_activation_status <> 'awaiting_owner_activation' then
    raise exception 'PROFILE_NOT_CLAIMABLE' using errcode = 'P0001';
  end if;
  if v_profile.user_id is null then
    raise exception 'SPONSORED_CLAIM_TECHNICAL_OWNER_REQUIRED' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.client_activations
    where user_id = p_claimant_user_id and state = 'client_activated' and activated_at is not null
  ) then
    raise exception 'SPONSORED_CLAIM_ACTIVATION_REQUIRED' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.bcu_ledger_entries
    where idempotency_key = 'sponsored-profile-bonus:' || v_profile.id::text
      and user_id = v_profile.user_id and amount_bcu = 70000
      and direction = 'credit' and status = 'completed'
  ) then
    raise exception 'SPONSORED_BONUS_NOT_PROVISIONED' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.profiles
    where user_id = v_profile.user_id and id <> v_profile.id
  ) or exists (
    select 1 from public.bcu_ledger_entries
    where user_id = v_profile.user_id and profile_id is distinct from v_profile.id
  ) then
    raise exception 'SPONSORED_CLAIM_SOURCE_WALLET_CONFLICT' using errcode = 'P0001';
  end if;

  select * into v_source_wallet from public.bcu_wallets
  where user_id = v_profile.user_id for update;
  if not found or v_source_wallet.locked_balance_bcu <> 70000 then
    raise exception 'SPONSORED_BONUS_LOCK_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_profile.user_id = p_claimant_user_id then
    v_target_wallet := v_source_wallet;
    v_transfer_amount := 0;
    update public.bcu_wallets set locked_balance_bcu = locked_balance_bcu - 70000, updated_at = now()
    where id = v_source_wallet.id and locked_balance_bcu = 70000;
  else
    insert into public.bcu_wallets (user_id) values (p_claimant_user_id)
    on conflict (user_id) do nothing;
    select * into v_target_wallet from public.bcu_wallets
    where user_id = p_claimant_user_id for update;
    if not found then raise exception 'SPONSORED_CLAIM_TARGET_WALLET_CONFLICT' using errcode = 'P0001'; end if;

    update public.bcu_wallets set locked_balance_bcu = locked_balance_bcu - 70000, updated_at = now()
    where id = v_source_wallet.id and locked_balance_bcu = 70000;
    if not found then raise exception 'SPONSORED_BONUS_LOCK_NOT_FOUND' using errcode = 'P0001'; end if;
    v_transfer_amount := v_source_wallet.balance_bcu;
    if v_transfer_amount > 0 then
      perform public.apply_bcu_ledger_entry(
        v_profile.user_id, v_transfer_amount, 'debit', 'sponsored_profile_claim_transfer_sent',
        'sponsored-profile-claim-debit:' || v_profile.id::text,
        'sponsored_profile_claim', v_profile.id, 'bcu', 'profiles', v_profile.id,
        jsonb_build_object('owner_user_id', p_claimant_user_id), p_claimant_user_id,
        v_profile.user_id, p_claimant_user_id, v_profile.id
      );
      perform public.apply_bcu_ledger_entry(
        p_claimant_user_id, v_transfer_amount, 'credit', 'sponsored_profile_claim_transfer_received',
        'sponsored-profile-claim-credit:' || v_profile.id::text,
        'sponsored_profile_claim', v_profile.id, 'bcu', 'profiles', v_profile.id,
        jsonb_build_object('technical_user_id', v_profile.user_id), p_claimant_user_id,
        v_profile.user_id, p_claimant_user_id, v_profile.id
      );
    end if;
  end if;

  insert into public.sponsored_profile_claim_audits (
    profile_id, invite_id, technical_user_id, owner_user_id,
    source_wallet_id, target_wallet_id, transferred_balance_bcu, activation_evidence
  ) values (
    v_profile.id, v_invite.id, v_profile.user_id, p_claimant_user_id,
    v_source_wallet.id, v_target_wallet.id, v_transfer_amount, 'confirmed_activation'
  );
  update public.profiles set
    user_id = p_claimant_user_id,
    owner_activation_status = 'active', owner_activated_at = now(), ai_agent_mode = 'owner_assistant'
  where id = v_profile.id returning * into v_profile;
  update public.profile_ai_agents set mode = 'owner_assistant', active = true, activated_at = now()
  where profile_id = v_profile.id;
  update public.profile_chat_sessions set status = 'owner_takeover', handled_by = 'owner'
  where profile_id = v_profile.id and status = 'open';
  update public.booking_requests set status = 'pending', owner_claimed_at = now()
  where profile_id = v_profile.id and status = 'awaiting_owner_activation';
  update public.sponsored_profile_claim_invites set used_at = now(), used_by_user_id = p_claimant_user_id
  where id = v_invite.id and used_at is null;
  if not found then raise exception 'SPONSORED_CLAIM_TOKEN_USED' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'claimed', true,
    'profile', to_jsonb(v_profile),
    'transferred_balance_bcu', v_transfer_amount::text,
    'source_wallet_id', v_source_wallet.id,
    'target_wallet_id', v_target_wallet.id
  );
end $$;

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
begin
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.sponsorship_type <> 'admin_sponsored' then
    raise exception 'PROFILE_NOT_SPONSORED' using errcode = 'P0001';
  end if;
  insert into public.profile_chat_sessions (profile_id, client_user_id, client_email)
  values (p_profile_id, p_client_user_id, left(nullif(trim(p_client_email), ''), 160))
  on conflict (profile_id, client_user_id) do update set
    client_email = coalesce(excluded.client_email, public.profile_chat_sessions.client_email),
    updated_at = now()
  returning * into v_session;

  perform public.charge_bcu_profile_interaction(
    p_client_user_id, p_profile_id, 'chat',
    'chat:' || p_client_user_id::text || ':' || p_profile_id::text,
    v_session.id
  );
  return v_session;
end $$;

create or replace function public.create_paid_booking_request(
  p_client_user_id uuid,
  p_requester_email text,
  p_profile_id uuid,
  p_requested_date date,
  p_requested_time time,
  p_duration_minutes integer,
  p_message text,
  p_idempotency_key text
)
returns public.booking_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.booking_requests%rowtype;
  v_profile public.profiles%rowtype;
  v_id uuid := gen_random_uuid();
  v_interaction_key text;
begin
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001'; end if;
  if nullif(trim(coalesce(p_requester_email, '')), '') is null
     or p_requested_date is null or p_requested_time is null then
    raise exception 'BOOKING_FIELDS_REQUIRED' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null
     or char_length(p_idempotency_key) > 128 then
    raise exception 'BCU_IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('paid_booking'),
    hashtext(p_client_user_id::text || ':' || p_profile_id::text || ':' || p_idempotency_key)
  );
  select * into v_booking from public.booking_requests
  where requester_user_id = p_client_user_id
    and profile_id = p_profile_id
    and client_request_key = p_idempotency_key;
  if found then return v_booking; end if;

  v_interaction_key := 'booking:' || p_client_user_id::text || ':' || p_profile_id::text || ':' || p_idempotency_key;

  perform public.charge_bcu_profile_interaction(
    p_client_user_id, p_profile_id, 'booking', v_interaction_key, v_id
  );
  insert into public.booking_requests (
    id, profile_id, requester_user_id, requester_email, requested_date,
    requested_time, duration_minutes, message, status, client_request_key
  ) values (
    v_id, p_profile_id, p_client_user_id, left(trim(p_requester_email), 160),
    p_requested_date, p_requested_time, least(greatest(p_duration_minutes, 30), 1440),
    left(nullif(trim(p_message), ''), 2000),
    case when v_profile.owner_activation_status = 'awaiting_owner_activation'
      then 'awaiting_owner_activation' else 'pending' end,
    p_idempotency_key
  ) returning * into v_booking;
  return v_booking;
end $$;

update public.profiles
set sponsorship_type = 'admin_sponsored',
    owner_activation_status = case when owner_activated_at is null then 'awaiting_owner_activation' else 'active' end,
    ai_agent_mode = case when owner_activated_at is null then 'pre_activation' else 'owner_assistant' end
where sponsorship_type = 'none'
  and (
    exists (
      select 1 from public.admin_activity_logs log
      where log.target_type = 'profile'
        and log.target_id = public.profiles.id
        and log.action = 'profile_studio_created'
    )
    or (
      acquisition_source = 'hermes_import_sponsored'
      and provider = 'hermes_agent'
      and nullif(btrim(source_url), '') is not null
    )
  );

do $$ declare v_profile_id uuid; begin
  for v_profile_id in
    select id from public.profiles
    where sponsorship_type = 'admin_sponsored' and owner_activation_status = 'awaiting_owner_activation' and user_id is not null
  loop perform public.provision_admin_sponsored_profile(v_profile_id); end loop;
end $$;

alter table public.profile_ai_agents enable row level security;
alter table public.sponsored_profile_claim_invites enable row level security;
alter table public.sponsored_profile_claim_attempts enable row level security;
alter table public.sponsored_profile_claim_audits enable row level security;
alter table public.profile_chat_sessions enable row level security;
alter table public.profile_chat_messages enable row level security;
alter table public.bcu_profile_interactions enable row level security;
revoke all on public.profile_ai_agents, public.sponsored_profile_claim_invites, public.sponsored_profile_claim_attempts, public.sponsored_profile_claim_audits, public.profile_chat_sessions, public.profile_chat_messages, public.bcu_profile_interactions from public, anon, authenticated;
grant all on public.profile_ai_agents, public.sponsored_profile_claim_invites, public.sponsored_profile_claim_attempts, public.sponsored_profile_claim_audits, public.profile_chat_sessions, public.profile_chat_messages, public.bcu_profile_interactions to service_role;
revoke execute on function public.provision_admin_sponsored_profile(uuid) from public, anon, authenticated;
revoke execute on function public.charge_bcu_profile_interaction(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.replace_sponsored_profile_claim_invite(uuid, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.register_sponsored_profile_claim_attempt(uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_admin_sponsored_profile(uuid, text) from public, anon, authenticated;
revoke execute on function public.start_paid_profile_chat(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.create_paid_booking_request(uuid, text, uuid, date, time, integer, text, text) from public, anon, authenticated;
grant execute on function public.provision_admin_sponsored_profile(uuid) to service_role;
grant execute on function public.charge_bcu_profile_interaction(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.replace_sponsored_profile_claim_invite(uuid, text, timestamptz, text) to service_role;
grant execute on function public.register_sponsored_profile_claim_attempt(uuid, text) to service_role;
grant execute on function public.claim_admin_sponsored_profile(uuid, text) to service_role;
grant execute on function public.start_paid_profile_chat(uuid, text, uuid) to service_role;
grant execute on function public.create_paid_booking_request(uuid, text, uuid, date, time, integer, text, text) to service_role;
