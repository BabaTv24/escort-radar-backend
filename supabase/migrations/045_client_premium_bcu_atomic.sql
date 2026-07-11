-- Atomic Client Premium BCU activation and referral reward.
-- Requires 043_bcu_authoritative_wallet.sql and 044_bcu_products_and_entitlements.sql.

do $$
begin
  if exists (
    select 1
    from public.client_rewards
    where referred_user_id is not null
      and reward_type = 'client_activation_referral'
      and status = 'granted'
    group by referred_user_id, reward_type
    having count(*) > 1
  ) then
    raise exception 'CLIENT_REFERRAL_REWARD_DUPLICATES_REQUIRE_REVIEW' using errcode = 'P0001';
  end if;
end $$;

create unique index if not exists client_rewards_one_granted_activation_referral_idx
on public.client_rewards (referred_user_id, reward_type)
where referred_user_id is not null
  and reward_type = 'client_activation_referral'
  and status = 'granted';

create or replace function public.activate_client_premium_bcu(
  p_user_id uuid,
  p_activation_id uuid,
  p_referred_by_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bonus_product public.system_bcu_products%rowtype;
  v_referral_product public.system_bcu_products%rowtype;
  v_bonus_ledger public.bcu_ledger_entries%rowtype;
  v_referral_ledger public.bcu_ledger_entries%rowtype;
  v_wallet public.bcu_wallets%rowtype;
  v_entitlement public.user_entitlements%rowtype;
  v_referrer public.client_referrals%rowtype;
  v_reward public.client_rewards%rowtype;
  v_referral_granted boolean := false;
  v_bonus_key text;
  v_referral_key text;
begin
  if p_user_id is null then
    raise exception 'BCU_USER_REQUIRED' using errcode = 'P0001';
  end if;

  if p_activation_id is null then
    raise exception 'BCU_ACTIVATION_REQUIRED' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.client_activations ca
    where ca.id = p_activation_id
      and ca.user_id = p_user_id
      and ca.state = 'client_activated'
  ) then
    raise exception 'BCU_CLIENT_PREMIUM_ACTIVATION_INVALID' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('client_premium_bcu'),
    hashtext(p_user_id::text)
  );

  select * into v_bonus_product
  from public.system_bcu_products
  where product_code = 'premium_activation_bonus'
    and operation_type = 'credit'
    and active = true;

  if not found or v_bonus_product.amount_bcu <> 70000 then
    raise exception 'BCU_PREMIUM_BONUS_PRODUCT_INVALID' using errcode = 'P0001';
  end if;

  v_bonus_key := 'client-premium-bonus:' || p_user_id::text;

  select * into v_bonus_ledger
  from public.apply_bcu_ledger_entry(
    p_user_id,
    v_bonus_product.amount_bcu,
    'credit',
    'bcu_product_premium_activation_bonus',
    v_bonus_key,
    'system_bcu_product',
    v_bonus_product.id,
    'bcu',
    'system_bcu_products',
    v_bonus_product.id,
    jsonb_build_object('product_code', v_bonus_product.product_code, 'activation_id', p_activation_id),
    null
  );

  select * into v_entitlement
  from public.user_entitlements
  where user_id = p_user_id
    and entitlement_type = 'client_premium'
    and status = 'active'
  limit 1
  for update;

  if found then
    if v_entitlement.source_reference_id is distinct from v_bonus_ledger.id
      or v_entitlement.product_code is distinct from v_bonus_product.product_code then
      raise exception 'BCU_CLIENT_PREMIUM_ENTITLEMENT_CONFLICT' using errcode = 'P0001';
    end if;
  else
    insert into public.user_entitlements (
      user_id,
      entitlement_type,
      status,
      starts_at,
      ends_at,
      source,
      source_reference_id,
      product_code,
      metadata
    ) values (
      p_user_id,
      'client_premium',
      'active',
      now(),
      null,
      'premium_activation',
      v_bonus_ledger.id,
      v_bonus_product.product_code,
      jsonb_build_object('idempotency_key', v_bonus_key, 'activation_id', p_activation_id)
    )
    returning * into v_entitlement;
  end if;

  if nullif(trim(coalesce(p_referred_by_code, '')), '') is not null then
    select cr.* into v_referrer
    from public.client_referrals cr
    join public.client_activations ca
      on ca.user_id = cr.user_id
     and ca.state = 'client_activated'
    where cr.referral_code = trim(p_referred_by_code)
      and cr.user_id <> p_user_id
    limit 1;

    if found then
      select * into v_reward
      from public.client_rewards
      where referred_user_id = p_user_id
        and reward_type = 'client_activation_referral'
        and status = 'granted'
      limit 1;

      if found then
        if v_reward.user_id is distinct from v_referrer.user_id then
          raise exception 'BCU_REFERRAL_REWARD_CONFLICT' using errcode = 'P0001';
        end if;
      else
      select * into v_referral_product
      from public.system_bcu_products
      where product_code = 'referral_reward'
        and operation_type = 'credit'
        and active = true;

      if not found or v_referral_product.amount_bcu <> 100000 then
        raise exception 'BCU_REFERRAL_PRODUCT_INVALID' using errcode = 'P0001';
      end if;

      v_referral_key := 'client-premium-referral:' || p_user_id::text;

      select * into v_referral_ledger
      from public.apply_bcu_ledger_entry(
        v_referrer.user_id,
        v_referral_product.amount_bcu,
        'credit',
        'bcu_product_referral_reward',
        v_referral_key,
        'system_bcu_product',
        v_referral_product.id,
        'bcu',
        'system_bcu_products',
        v_referral_product.id,
        jsonb_build_object('product_code', v_referral_product.product_code, 'referred_user_id', p_user_id),
        null,
        p_user_id,
        v_referrer.user_id
      );

      insert into public.client_rewards (
        user_id,
        referral_id,
        referred_user_id,
        reward_type,
        coins,
        status,
        metadata
      ) values (
        v_referrer.user_id,
        v_referrer.id,
        p_user_id,
        'client_activation_referral',
        10,
        'granted',
        jsonb_build_object('ledger_entry_id', v_referral_ledger.id)
      )
      on conflict (referred_user_id, reward_type)
        where referred_user_id is not null
          and reward_type = 'client_activation_referral'
          and status = 'granted'
      do nothing
      returning * into v_reward;

      if found then
        update public.client_referrals
        set
          activation_count = coalesce(activation_count, 0) + 1,
          earned_coins = coalesce(earned_coins, 0) + 10,
          updated_at = now()
        where id = v_referrer.id;
      else
        select * into v_reward
        from public.client_rewards
        where referred_user_id = p_user_id
          and reward_type = 'client_activation_referral'
          and status = 'granted'
        limit 1;

        if v_reward.user_id is distinct from v_referrer.user_id
          or (v_reward.metadata ->> 'ledger_entry_id') is distinct from v_referral_ledger.id::text then
          raise exception 'BCU_REFERRAL_REWARD_CONFLICT' using errcode = 'P0001';
        end if;
      end if;

      end if;

      v_referral_granted := true;
    end if;
  end if;

  select * into v_wallet
  from public.bcu_wallets
  where user_id = p_user_id;

  return jsonb_build_object(
    'wallet', jsonb_build_object(
      'public_wallet_id', v_wallet.public_wallet_id,
      'balance_bcu', v_wallet.balance_bcu::text,
      'lifetime_credit_bcu', v_wallet.lifetime_credit_bcu::text,
      'lifetime_debit_bcu', v_wallet.lifetime_debit_bcu::text,
      'frozen', v_wallet.frozen,
      'created_at', v_wallet.created_at,
      'updated_at', v_wallet.updated_at
    ),
    'bonus', jsonb_build_object(
      'amount_bcu', v_bonus_ledger.amount_bcu::text,
      'direction', v_bonus_ledger.direction,
      'transaction_type', v_bonus_ledger.transaction_type,
      'status', v_bonus_ledger.status,
      'created_at', v_bonus_ledger.created_at
    ),
    'entitlement', jsonb_build_object(
      'entitlement_type', v_entitlement.entitlement_type,
      'status', v_entitlement.status,
      'starts_at', v_entitlement.starts_at,
      'ends_at', v_entitlement.ends_at,
      'product_code', v_entitlement.product_code
    ),
    'referral_granted', v_referral_granted
  );
end $$;

revoke execute on function public.activate_client_premium_bcu(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.activate_client_premium_bcu(uuid, uuid, text)
to service_role;
