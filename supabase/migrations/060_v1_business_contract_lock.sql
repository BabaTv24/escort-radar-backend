-- 060: V1 business contract lock (docs/ESCORT_RADAR_BUSINESS_CONTRACT_V1.md).
--
-- 1. Booking requests are free. The paid booking product is deactivated and the old paid RPC
--    refuses to run, so no execution path can charge a client for a booking request.
--    create_booking_request keeps the same idempotency, profile checks and the
--    awaiting_owner_activation status of the previous function, without any BC movement.
-- 2. Favorites are free. The favorite_profile transfer product is deactivated, so
--    add_bcu_favorite_with_transfer (046) can no longer charge. The backend no longer calls it.
-- 3. Voluntary gifts (Diamond I-V) get an atomic, idempotent transfer function and their own table.
--    No gift prices are inserted: a gift can only be sent once BOSS configures an active
--    gift_diamond_<level> product in system_bcu_products.
--
-- Historical ledger entries, favorite transfers, booking interactions and products are kept.
-- Apply to DEV first. Production only after an explicit release decision.

begin;

update public.system_bcu_products
set active = false,
    metadata = metadata || jsonb_build_object('disabled_by', '060_v1_business_contract_lock', 'reason', 'booking_requests_are_free'),
    updated_at = now()
where product_code = 'profile_booking';

update public.system_bcu_products
set active = false,
    metadata = metadata || jsonb_build_object('disabled_by', '060_v1_business_contract_lock', 'reason', 'favorites_are_free_gifts_are_separate'),
    updated_at = now()
where product_code = 'favorite_profile';

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
begin
  raise exception 'PAID_BOOKING_DISABLED' using errcode = 'P0001';
end $$;

drop function if exists public.create_booking_request(uuid, text, uuid, date, time, integer, text, text);
create function public.create_booking_request(
  p_client_user_id uuid,
  p_requester_email text,
  p_profile_id uuid,
  p_requested_date date,
  p_requested_time time,
  p_duration_minutes integer,
  p_message text,
  p_idempotency_key text
)
-- {created, booking}: created=false on a replay, so the caller notifies the owner exactly once.
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.booking_requests%rowtype;
  v_profile public.profiles%rowtype;
begin
  if p_client_user_id is null then raise exception 'BOOKING_CLIENT_REQUIRED' using errcode = 'P0001'; end if;
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_profile.user_id is null or v_profile.user_id = p_client_user_id
     or v_profile.status <> 'active' or v_profile.is_published is not true
     or v_profile.moderation_status <> 'approved' then
    raise exception 'PROFILE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.client_activations ca
    where ca.user_id = p_client_user_id and ca.state = 'client_activated'
  ) then
    raise exception 'CLIENT_ACTIVATION_REQUIRED' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_requester_email, '')), '') is null
     or p_requested_date is null or p_requested_time is null then
    raise exception 'BOOKING_FIELDS_REQUIRED' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null
     or char_length(p_idempotency_key) > 128 then
    raise exception 'BOOKING_IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('booking_request'),
    hashtext(p_client_user_id::text || ':' || p_profile_id::text || ':' || p_idempotency_key)
  );
  select * into v_booking from public.booking_requests
  where requester_user_id = p_client_user_id
    and profile_id = p_profile_id
    and client_request_key = p_idempotency_key;
  if found then return jsonb_build_object('created', false, 'booking', to_jsonb(v_booking)); end if;

  insert into public.booking_requests (
    profile_id, requester_user_id, requester_email, requested_date,
    requested_time, duration_minutes, message, status, client_request_key
  ) values (
    p_profile_id, p_client_user_id, left(trim(p_requester_email), 160),
    p_requested_date, p_requested_time, least(greatest(p_duration_minutes, 30), 1440),
    left(nullif(trim(p_message), ''), 2000),
    case when v_profile.owner_activation_status = 'awaiting_owner_activation'
      then 'awaiting_owner_activation' else 'pending' end,
    p_idempotency_key
  ) returning * into v_booking;
  return jsonb_build_object('created', true, 'booking', to_jsonb(v_booking));
end $$;

create table if not exists public.bcu_profile_gifts (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  gift_level smallint not null check (gift_level between 1 and 5),
  product_code text not null,
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 200),
  amount_bcu bigint not null check (amount_bcu > 0),
  debit_ledger_entry_id uuid not null unique references public.bcu_ledger_entries(id) on delete restrict,
  credit_ledger_entry_id uuid not null unique references public.bcu_ledger_entries(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists bcu_profile_gifts_profile_created_idx on public.bcu_profile_gifts (profile_id, created_at desc);
create index if not exists bcu_profile_gifts_recipient_idx on public.bcu_profile_gifts (recipient_user_id);

create or replace function public.send_bcu_profile_gift(
  p_client_user_id uuid,
  p_profile_id uuid,
  p_gift_level integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_product public.system_bcu_products%rowtype;
  v_existing public.bcu_profile_gifts%rowtype;
  v_debit public.bcu_ledger_entries%rowtype;
  v_credit public.bcu_ledger_entries%rowtype;
  v_id uuid := gen_random_uuid();
  v_code text;
  v_key text;
begin
  if p_client_user_id is null then raise exception 'GIFT_CLIENT_REQUIRED' using errcode = 'P0001'; end if;
  if p_gift_level is null or p_gift_level not between 1 and 5 then
    raise exception 'GIFT_LEVEL_INVALID' using errcode = 'P0001';
  end if;
  v_key := trim(coalesce(p_idempotency_key, ''));
  if char_length(v_key) < 8 or char_length(v_key) > 128 then
    raise exception 'GIFT_IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;
  v_key := 'gift:' || p_client_user_id::text || ':' || v_key;
  v_code := 'gift_diamond_' || p_gift_level::text;

  perform pg_advisory_xact_lock(hashtext('bcu_profile_gift'), hashtext(v_key));
  select * into v_existing from public.bcu_profile_gifts where idempotency_key = v_key;
  if found then
    if v_existing.profile_id <> p_profile_id or v_existing.gift_level <> p_gift_level then
      raise exception 'GIFT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object('charged', false, 'gift', to_jsonb(v_existing));
  end if;

  if not exists (
    select 1 from public.client_activations ca
    where ca.user_id = p_client_user_id and ca.state = 'client_activated'
  ) then
    raise exception 'CLIENT_ACTIVATION_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.user_id is null or v_profile.user_id = p_client_user_id
     or v_profile.status <> 'active' or v_profile.is_published is not true
     or v_profile.moderation_status <> 'approved'
     or v_profile.owner_activation_status = 'awaiting_owner_activation' then
    raise exception 'PROFILE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select * into v_product from public.system_bcu_products
  where product_code = v_code and active = true and operation_type = 'transfer' and amount_bcu > 0;
  if not found then raise exception 'GIFT_NOT_CONFIGURED' using errcode = 'P0001'; end if;

  v_debit := public.apply_bcu_ledger_entry(
    p_client_user_id, v_product.amount_bcu, 'debit', 'gift_sent', v_key || ':debit',
    'bcu_profile_gift', v_id, 'bcu', 'bcu_profile_gifts', v_id,
    jsonb_build_object('product_code', v_code, 'gift_level', p_gift_level), p_client_user_id,
    p_client_user_id, v_profile.user_id, p_profile_id, null, null, null
  );
  v_credit := public.apply_bcu_ledger_entry(
    v_profile.user_id, v_product.amount_bcu, 'credit', 'gift_received', v_key || ':credit',
    'bcu_profile_gift', v_id, 'bcu', 'bcu_profile_gifts', v_id,
    jsonb_build_object('product_code', v_code, 'gift_level', p_gift_level), p_client_user_id,
    p_client_user_id, v_profile.user_id, p_profile_id, null, null, null
  );

  insert into public.bcu_profile_gifts (
    id, client_user_id, profile_id, recipient_user_id, gift_level, product_code,
    idempotency_key, amount_bcu, debit_ledger_entry_id, credit_ledger_entry_id
  ) values (
    v_id, p_client_user_id, p_profile_id, v_profile.user_id, p_gift_level, v_code,
    v_key, v_product.amount_bcu, v_debit.id, v_credit.id
  ) returning * into v_existing;
  return jsonb_build_object('charged', true, 'gift', to_jsonb(v_existing));
exception
  when raise_exception then
    if sqlerrm = 'BCU_INSUFFICIENT_BALANCE' then raise exception 'INSUFFICIENT_BCU' using errcode = 'P0001'; end if;
    if sqlerrm = 'BCU_LOCKED_BALANCE' then raise exception 'INSUFFICIENT_AVAILABLE_BCU' using errcode = 'P0001'; end if;
    raise;
end $$;

alter table public.bcu_profile_gifts enable row level security;
revoke all on public.bcu_profile_gifts from public, anon, authenticated;
grant all on public.bcu_profile_gifts to service_role;

revoke execute on function public.create_booking_request(uuid, text, uuid, date, time, integer, text, text) from public, anon, authenticated;
revoke execute on function public.create_paid_booking_request(uuid, text, uuid, date, time, integer, text, text) from public, anon, authenticated;
revoke execute on function public.send_bcu_profile_gift(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.create_booking_request(uuid, text, uuid, date, time, integer, text, text) to service_role;
grant execute on function public.create_paid_booking_request(uuid, text, uuid, date, time, integer, text, text) to service_role;
grant execute on function public.send_bcu_profile_gift(uuid, uuid, integer, text) to service_role;

commit;
