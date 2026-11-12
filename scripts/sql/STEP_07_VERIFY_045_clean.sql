with activate_rpc as (
  select p.oid, p.prosecdef, p.proconfig
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'activate_client_premium_bcu'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) =
      'p_user_id uuid, p_activation_id uuid, p_referred_by_code text'
),
checks(check_name, passed) as (
  values
    ('activate_client_premium_bcu_exists', to_regprocedure(
      'public.activate_client_premium_bcu(uuid,uuid,text)'
    ) is not null),
    ('activate_client_premium_bcu_signature', (select count(1) = 1 from activate_rpc)),
    ('activate_client_premium_bcu_security_definer', coalesce((
      select prosecdef
      from activate_rpc
      limit 1
    ), false)),
    ('activate_client_premium_bcu_search_path_public', coalesce((
      select 'search_path=public' = any(coalesce(proconfig, array[]::text[]))
      from activate_rpc
      limit 1
    ), false)),
    ('activate_client_premium_bcu_anon_no_execute', coalesce((
      select not pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
      from activate_rpc
      limit 1
    ), false)),
    ('activate_client_premium_bcu_authenticated_no_execute', coalesce((
      select not pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE')
      from activate_rpc
      limit 1
    ), false)),
    ('activate_client_premium_bcu_service_role_execute', coalesce((
      select pg_catalog.has_function_privilege('service_role', oid, 'EXECUTE')
      from activate_rpc
      limit 1
    ), false)),
    ('client_rewards_one_granted_activation_referral_idx_exists', to_regclass(
      'public.client_rewards_one_granted_activation_referral_idx'
    ) is not null),
    ('bcu_wallets_exists', to_regclass('public.bcu_wallets') is not null),
    ('bcu_ledger_entries_exists', to_regclass('public.bcu_ledger_entries') is not null),
    ('system_bcu_products_exists', to_regclass('public.system_bcu_products') is not null),
    ('user_entitlements_exists', to_regclass('public.user_entitlements') is not null),
    ('client_activations_exists', to_regclass('public.client_activations') is not null),
    ('client_referrals_exists', to_regclass('public.client_referrals') is not null),
    ('client_rewards_exists', to_regclass('public.client_rewards') is not null),
    ('apply_bcu_ledger_entry_signature', to_regprocedure(
      'public.apply_bcu_ledger_entry(uuid,bigint,text,text,text,text,uuid,text,text,uuid,jsonb,uuid,uuid,uuid,uuid,uuid,uuid,uuid)'
    ) is not null)
)
select
  'STEP 07' as step,
  case when bool_and(passed) then 'PASS' else 'STOP' end as overall_result,
  count(1) filter (where not passed) as failed_checks,
  coalesce(
    string_agg(check_name, ', ' order by check_name) filter (where not passed),
    'none'
  ) as failures
from checks;
