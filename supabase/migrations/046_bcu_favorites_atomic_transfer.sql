-- Atomic, paid-once BCU Favorites transfer. Apply only after review.

create table public.bcu_favorite_transfers (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  amount_bcu bigint not null check (amount_bcu = 50000),
  debit_ledger_entry_id uuid not null unique references public.bcu_ledger_entries(id) on delete restrict,
  credit_ledger_entry_id uuid not null unique references public.bcu_ledger_entries(id) on delete restrict,
  status text not null default 'completed' check (status in ('completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bcu_favorite_transfers_paid_pair_unique unique (client_user_id, profile_id),
  check (client_user_id <> recipient_user_id)
);

create index bcu_favorite_transfers_recipient_created_idx
on public.bcu_favorite_transfers (recipient_user_id, created_at desc);

create trigger set_bcu_favorite_transfers_updated_at
before update on public.bcu_favorite_transfers
for each row execute procedure public.set_updated_at();

alter table public.bcu_favorite_transfers enable row level security;
revoke all on public.bcu_favorite_transfers from public, anon, authenticated;
grant all on public.bcu_favorite_transfers to service_role;

create or replace function public.add_bcu_favorite_with_transfer(
  p_client_user_id uuid,
  p_profile_id uuid,
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
  v_paid public.bcu_favorite_transfers%rowtype;
  v_debit public.bcu_ledger_entries%rowtype;
  v_credit public.bcu_ledger_entries%rowtype;
  v_transfer_id uuid := gen_random_uuid();
begin
  if p_client_user_id is null or p_profile_id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;
  if not public.has_active_user_entitlement(p_client_user_id, 'client_premium') then
    raise exception 'PREMIUM_REQUIRED' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bcu_favorite:' || p_client_user_id::text || ':' || p_profile_id::text, 0)
  );

  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.status <> 'active' or v_profile.is_published is not true
     or v_profile.moderation_status <> 'approved' or v_profile.shadowbanned is not false then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_product from public.system_bcu_products
  where product_code = 'favorite_profile' and active = true;
  if not found or v_product.operation_type <> 'transfer' or v_product.amount_bcu <> 50000 then
    raise exception 'BCU_FAVORITE_PRODUCT_INVALID' using errcode = 'P0001';
  end if;

  select * into v_paid from public.bcu_favorite_transfers
  where client_user_id = p_client_user_id and profile_id = p_profile_id;
  if found then
    if v_paid.amount_bcu <> v_product.amount_bcu then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    select * into v_debit from public.bcu_ledger_entries where id = v_paid.debit_ledger_entry_id;
    select * into v_credit from public.bcu_ledger_entries where id = v_paid.credit_ledger_entry_id;
    if v_debit.id is null or v_credit.id is null
       or v_debit.user_id <> v_paid.client_user_id
       or v_debit.direction <> 'debit'
       or v_debit.transaction_type <> 'favorite_sent'
       or v_debit.amount_bcu <> v_paid.amount_bcu
       or v_debit.status <> 'completed'
       or v_debit.reference_id <> v_paid.id
       or v_credit.user_id <> v_paid.recipient_user_id
       or v_credit.direction <> 'credit'
       or v_credit.transaction_type <> 'favorite_received'
       or v_credit.amount_bcu <> v_paid.amount_bcu
       or v_credit.status <> 'completed'
       or v_credit.reference_id <> v_paid.id then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    insert into public.client_favorites (client_id, profile_id)
    values (p_client_user_id, p_profile_id) on conflict (client_id, profile_id) do nothing;
    return jsonb_build_object('favorite', true, 'charged', false, 'amount_bcu', v_paid.amount_bcu::text,
      'profile_id', p_profile_id, 'recipient_credited', true);
  end if;

  if v_profile.user_id is null then
    raise exception 'FAVORITE_RECIPIENT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if v_profile.user_id = p_client_user_id then
    raise exception 'SELF_FAVORITE_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.bcu_wallets where user_id = p_client_user_id) then
    raise exception 'BCU_WALLET_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_debit := public.apply_bcu_ledger_entry(
    p_client_user_id, v_product.amount_bcu, 'debit', 'favorite_sent',
    'favorite-debit:' || p_client_user_id::text || ':' || p_profile_id::text,
    'bcu_favorite_transfer', v_transfer_id, 'bcu', 'bcu_favorite_transfers', v_transfer_id,
    jsonb_build_object('profile_id', p_profile_id), p_client_user_id,
    p_client_user_id, v_profile.user_id, p_profile_id
  );
  v_credit := public.apply_bcu_ledger_entry(
    v_profile.user_id, v_product.amount_bcu, 'credit', 'favorite_received',
    'favorite-credit:' || p_client_user_id::text || ':' || p_profile_id::text,
    'bcu_favorite_transfer', v_transfer_id, 'bcu', 'bcu_favorite_transfers', v_transfer_id,
    jsonb_build_object('profile_id', p_profile_id, 'description', 'Profile added to Favorites'),
    p_client_user_id, p_client_user_id, v_profile.user_id, p_profile_id
  );

  insert into public.bcu_favorite_transfers (
    id, client_user_id, profile_id, recipient_user_id, amount_bcu,
    debit_ledger_entry_id, credit_ledger_entry_id
  ) values (
    v_transfer_id, p_client_user_id, p_profile_id, v_profile.user_id, v_product.amount_bcu,
    v_debit.id, v_credit.id
  ) returning * into v_paid;

  insert into public.client_favorites (client_id, profile_id)
  values (p_client_user_id, p_profile_id) on conflict (client_id, profile_id) do nothing;

  return jsonb_build_object('favorite', true, 'charged', true, 'amount_bcu', v_paid.amount_bcu::text,
    'profile_id', p_profile_id, 'recipient_credited', true);
exception
  when raise_exception then
    if sqlerrm = 'BCU_INSUFFICIENT_BALANCE' then raise exception 'INSUFFICIENT_BCU' using errcode = 'P0001'; end if;
    if sqlerrm = 'BCU_WALLET_FROZEN' then raise exception 'WALLET_FROZEN' using errcode = 'P0001'; end if;
    if sqlerrm = 'BCU_IDEMPOTENCY_CONFLICT' then raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001'; end if;
    raise;
end $$;

revoke execute on function public.add_bcu_favorite_with_transfer(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.add_bcu_favorite_with_transfer(uuid, uuid, text)
to service_role;
