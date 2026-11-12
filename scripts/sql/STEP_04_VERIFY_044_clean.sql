with expected_products(product_code, amount_bcu) as (
  values
    ('premium_activation_bonus', 70000::bigint),
    ('favorite_profile', 50000::bigint),
    ('referral_reward', 100000::bigint),
    ('communication_plus', 1000000::bigint),
    ('advertiser_30_days', 3332666::bigint),
    ('small_business_30_days', 33266666::bigint),
    ('vip_business_30_days', 119933333::bigint)
),
product_check as (
  select count(1) = 7
    and bool_and(p.id is not null and p.amount_bcu = ep.amount_bcu) as passed
  from expected_products ep
  left join public.system_bcu_products p on p.product_code = ep.product_code
),
activate_rpc as (
  select p.oid
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'activate_bcu_product'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) =
      'p_user_id uuid, p_product_code text, p_idempotency_key text, p_metadata jsonb'
),
checks(check_name, passed) as (
  values
    ('system_bcu_products_exists', to_regclass('public.system_bcu_products') is not null),
    ('user_entitlements_exists', to_regclass('public.user_entitlements') is not null),
    ('rls_enabled_all', (
      select count(1) = 2 and bool_and(c.relrowsecurity)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('system_bcu_products', 'user_entitlements')
        and c.relkind in ('r', 'p')
    )),
    ('active_entitlement_unique_index', exists (
      select 1
      from pg_catalog.pg_indexes
      where schemaname = 'public'
        and tablename = 'user_entitlements'
        and indexname = 'user_entitlements_one_active_type_idx'
        and indexdef like '%UNIQUE%'
        and indexdef like '%WHERE (status = ''active''%'
    )),
    ('activate_bcu_product_exists', to_regprocedure(
      'public.activate_bcu_product(uuid,text,text,jsonb)'
    ) is not null),
    ('has_active_user_entitlement_exists', to_regprocedure(
      'public.has_active_user_entitlement(uuid,text)'
    ) is not null),
    ('activate_bcu_product_permissions', coalesce((
      select
        not pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE')
        and pg_catalog.has_function_privilege('service_role', oid, 'EXECUTE')
      from activate_rpc
      limit 1
    ), false)),
    ('product_seed_exact', (select passed from product_check))
)
select
  'STEP 04' as step,
  case when bool_and(passed) then 'PASS' else 'STOP' end as overall_result,
  count(1) filter (where not passed) as failed_checks,
  coalesce(
    string_agg(check_name, ', ' order by check_name) filter (where not passed),
    'none'
  ) as failures
from checks;
