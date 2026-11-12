with wallet_system as (
  select count(1) = 3 as ready
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relname in (
      'bcu_wallets',
      'bcu_ledger_entries',
      'bcu_migration_reconciliation'
    )
),
expected_products(product_code, amount_bcu) as (
  values
    ('premium_activation_bonus', 70000::bigint),
    ('favorite_profile', 50000::bigint),
    ('referral_reward', 100000::bigint),
    ('communication_plus', 1000000::bigint),
    ('advertiser_30_days', 3332666::bigint),
    ('small_business_30_days', 33266666::bigint),
    ('vip_business_30_days', 119933333::bigint)
),
entitlement_system as (
  select
    to_regclass('public.system_bcu_products') is not null
    and to_regclass('public.user_entitlements') is not null
    and to_regclass('public.user_entitlements_one_active_type_idx') is not null
    and count(1) = 7
    and bool_and(p.id is not null and p.amount_bcu = ep.amount_bcu) as ready
  from expected_products ep
  left join public.system_bcu_products p on p.product_code = ep.product_code
),
referral_system as (
  select
    to_regclass('public.client_activations') is not null
    and to_regclass('public.client_referrals') is not null
    and to_regclass('public.client_rewards') is not null
    and to_regclass(
      'public.client_rewards_one_granted_activation_referral_idx'
    ) is not null as ready
),
rpc_system as (
  select
    to_regprocedure(
      'public.apply_bcu_ledger_entry(uuid,bigint,text,text,text,text,uuid,text,text,uuid,jsonb,uuid,uuid,uuid,uuid,uuid,uuid,uuid)'
    ) is not null
    and to_regprocedure(
      'public.activate_bcu_product(uuid,text,text,jsonb)'
    ) is not null
    and to_regprocedure(
      'public.has_active_user_entitlement(uuid,text)'
    ) is not null
    and to_regprocedure(
      'public.activate_client_premium_bcu(uuid,uuid,text)'
    ) is not null as ready
),
rls_system as (
  select count(1) = 5 and bool_and(c.relrowsecurity) as ready
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relname in (
      'bcu_wallets',
      'bcu_ledger_entries',
      'bcu_migration_reconciliation',
      'system_bcu_products',
      'user_entitlements'
    )
),
permission_functions as (
  select to_regprocedure(
    'public.apply_bcu_ledger_entry(uuid,bigint,text,text,text,text,uuid,text,text,uuid,jsonb,uuid,uuid,uuid,uuid,uuid,uuid,uuid)'
  ) as oid
  union all
  select to_regprocedure(
    'public.activate_bcu_product(uuid,text,text,jsonb)'
  )
  union all
  select to_regprocedure(
    'public.activate_client_premium_bcu(uuid,uuid,text)'
  )
),
permission_system as (
  select
    count(1) = 3
    and bool_and(
      oid is not null
      and not pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE')
      and pg_catalog.has_function_privilege('service_role', oid, 'EXECUTE')
    ) as ready
  from permission_functions
),
readiness as (
  select
    coalesce(w.ready, false) as wallet_ready,
    coalesce(e.ready, false) as entitlement_ready,
    coalesce(r.ready, false) as referral_ready,
    coalesce(f.ready, false) as rpc_ready,
    coalesce(l.ready, false) as rls_ready,
    coalesce(p.ready, false) as permissions_ready
  from wallet_system w
  cross join entitlement_system e
  cross join referral_system r
  cross join rpc_system f
  cross join rls_system l
  cross join permission_system p
)
select
  'STEP 08' as step,
  case
    when wallet_ready
      and entitlement_ready
      and referral_ready
      and rpc_ready
    then 'PASS'
    else 'STOP'
  end as migrations_043_044_045,
  case when wallet_ready then 'YES' else 'NO' end as wallet_system_ready,
  case when entitlement_ready then 'YES' else 'NO' end as entitlement_system_ready,
  case when referral_ready then 'YES' else 'NO' end as referral_system_ready,
  case when rpc_ready then 'YES' else 'NO' end as rpc_ready,
  case when rls_ready then 'YES' else 'NO' end as rls_ready,
  case when permissions_ready then 'YES' else 'NO' end as permissions_ready,
  false as feature_flag,
  case
    when wallet_ready
      and entitlement_ready
      and referral_ready
      and rpc_ready
      and rls_ready
      and permissions_ready
    then 'READY_FOR_BACKEND_DEPLOY'
    else 'STOP'
  end as deployment_status
from readiness;
