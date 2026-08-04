-- Communication Plus paid-once purchase using available (not locked) BCU balance.
-- Apply manually after review. 1 BC = 10 000 BCU; the server-owned price is 1 000 000 BCU (100 BC).

create or replace function public.purchase_communication_plus(
  p_user_id uuid,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.system_bcu_products%rowtype;
  v_wallet public.bcu_wallets%rowtype;
  v_existing public.user_entitlements%rowtype;
  v_entitlement public.user_entitlements%rowtype;
  v_ledger public.bcu_ledger_entries%rowtype;
  v_safe_metadata jsonb;
begin
  if p_user_id is null then
    raise exception 'BCU_USER_REQUIRED' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null or length(trim(p_idempotency_key)) > 128 then
    raise exception 'BCU_IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('communication_plus:' || p_user_id::text, 0)
  );

  select * into v_product
  from public.system_bcu_products
  where product_code = 'communication_plus' and active = true;

  if not found or v_product.amount_bcu <> 1000000
     or v_product.operation_type <> 'debit'
     or v_product.entitlement_type <> 'communication_plus'
     or v_product.duration_days is not null then
    raise exception 'BCU_COMMUNICATION_PLUS_PRODUCT_INVALID' using errcode = 'P0001';
  end if;

  if not public.has_active_user_entitlement(p_user_id, 'client_premium') then
    raise exception 'BCU_CLIENT_PREMIUM_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.user_entitlements
  where user_id = p_user_id
    and entitlement_type = 'communication_plus'
    and status = 'active'
    and ends_at is null
  limit 1;

  if found then
    return jsonb_build_object(
      'product_code', v_product.product_code,
      'amount_bcu', v_product.amount_bcu::text,
      'charged', false,
      'ledger_entry', null,
      'entitlement', to_jsonb(v_existing)
    );
  end if;

  select * into v_wallet
  from public.bcu_wallets
  where user_id = p_user_id
  for update;

  if not found then raise exception 'BCU_WALLET_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_wallet.frozen then raise exception 'BCU_WALLET_FROZEN' using errcode = 'P0001'; end if;
  if (v_wallet.balance_bcu - v_wallet.locked_balance_bcu) < v_product.amount_bcu then
    raise exception 'BCU_INSUFFICIENT_AVAILABLE_BALANCE' using errcode = 'P0001';
  end if;

  v_safe_metadata := coalesce(p_metadata, '{}'::jsonb)
    - 'amount_bcu' - 'amount_bc' - 'price' - 'user_id' - 'status'
    - 'starts_at' - 'ends_at' - 'product_code' - 'entitlement_type';

  v_ledger := public.apply_bcu_ledger_entry(
    p_user_id,
    v_product.amount_bcu,
    'debit',
    'bcu_product_communication_plus',
    'communication-plus:' || p_user_id::text || ':' || trim(p_idempotency_key),
    'system_bcu_product',
    v_product.id,
    'bcu',
    'system_bcu_products',
    v_product.id,
    jsonb_build_object('product_code', 'communication_plus', 'request_metadata', v_safe_metadata),
    p_user_id
  );

  insert into public.user_entitlements (
    user_id, entitlement_type, status, starts_at, ends_at, source,
    source_reference_id, product_code, metadata
  ) values (
    p_user_id, 'communication_plus', 'active', now(), null, 'bcu_product',
    v_ledger.id, 'communication_plus',
    jsonb_build_object('idempotency_key', trim(p_idempotency_key), 'request_metadata', v_safe_metadata)
  )
  returning * into v_entitlement;

  return jsonb_build_object(
    'product_code', v_product.product_code,
    'amount_bcu', v_product.amount_bcu::text,
    'charged', true,
    'ledger_entry', to_jsonb(v_ledger),
    'entitlement', to_jsonb(v_entitlement)
  );
end $$;

revoke execute on function public.purchase_communication_plus(uuid, text, jsonb)
from public, anon, authenticated;
grant execute on function public.purchase_communication_plus(uuid, text, jsonb)
to service_role;
