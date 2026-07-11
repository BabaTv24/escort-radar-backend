-- STAGING validation for 044_bcu_products_and_entitlements.sql.
-- Read-only. Run each SELECT block separately after migration 044.

-- 044-01: relations and RLS.
select
  '044_01_relations' as block,
  expected.relation_name,
  c.relkind in ('r', 'p') as relation_exists,
  c.relrowsecurity as rls_enabled
from (values ('system_bcu_products'), ('user_entitlements')) expected(relation_name)
left join pg_catalog.pg_namespace n on n.nspname = 'public'
left join pg_catalog.pg_class c on c.relnamespace = n.oid and c.relname = expected.relation_name
order by expected.relation_name;

-- 044-02: backend product seed and exact prices.
with expected_products(product_code, amount_bcu, operation_type, entitlement_type, duration_days) as (
  values
    ('premium_activation_bonus', 70000::bigint, 'credit', null::text, null::integer),
    ('favorite_profile', 50000::bigint, 'transfer', null::text, null::integer),
    ('referral_reward', 100000::bigint, 'credit', null::text, null::integer),
    ('communication_plus', 1000000::bigint, 'debit', 'communication_plus', null::integer),
    ('advertiser_30_days', 3332666::bigint, 'debit', 'advertiser', 30),
    ('small_business_30_days', 33266666::bigint, 'debit', 'small_business', 30),
    ('vip_business_30_days', 119933333::bigint, 'debit', 'vip_business', 30)
)
select
  '044_02_product_seed' as block,
  ep.product_code,
  ep.amount_bcu as expected_amount_bcu,
  p.amount_bcu as actual_amount_bcu,
  ep.operation_type as expected_operation_type,
  p.operation_type as actual_operation_type,
  ep.entitlement_type as expected_entitlement_type,
  p.entitlement_type as actual_entitlement_type,
  ep.duration_days as expected_duration_days,
  p.duration_days as actual_duration_days,
  p.active,
  p.id is not null
    and p.amount_bcu = ep.amount_bcu
    and p.operation_type = ep.operation_type
    and p.entitlement_type is not distinct from ep.entitlement_type
    and p.duration_days is not distinct from ep.duration_days
    and p.active as valid
from expected_products ep
left join public.system_bcu_products p on p.product_code = ep.product_code
order by ep.product_code;

-- 044-03: indexes and active-entitlement uniqueness.
select
  '044_03_indexes' as block,
  tablename,
  indexname,
  indexdef,
  indexname = 'user_entitlements_one_active_type_idx'
    and indexdef like '%UNIQUE%'
    and indexdef like '%WHERE (status = ''active''%'
    as active_entitlement_unique_contract
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename in ('system_bcu_products', 'user_entitlements')
order by tablename, indexname;

-- 044-04: functions, security, search_path and idempotency markers.
select
  '044_04_functions' as block,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '') as function_config,
  coalesce(array_to_string(p.proconfig, ', '), '') like '%search_path=public%' as search_path_public,
  case when p.proname = 'activate_bcu_product'
    then pg_catalog.pg_get_functiondef(p.oid) like '%p_idempotency_key%'
      and pg_catalog.pg_get_functiondef(p.oid) like '%pg_advisory_xact_lock%'
      and pg_catalog.pg_get_functiondef(p.oid) like '%apply_bcu_ledger_entry%'
      and pg_catalog.pg_get_functiondef(p.oid) like '%BCU_LEDGER_PRODUCT_MISMATCH%'
    else pg_catalog.pg_get_functiondef(p.oid) like '%user_entitlements%' end as required_markers_present
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('activate_bcu_product', 'has_active_user_entitlement')
order by p.proname;

-- 044-05: RLS policies.
select
  '044_05_rls_policies' as block,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in ('system_bcu_products', 'user_entitlements')
order by tablename, policyname;

-- 044-06: grants and EXECUTE privileges.
select
  '044_06_table_privileges' as block,
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('system_bcu_products', 'user_entitlements')
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select
  '044_07_execute_privileges' as block,
  p.proname as function_name,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('activate_bcu_product', 'has_active_user_entitlement')
order by p.proname;

-- 044-08: current entitlement consistency and duplicate-active guard.
select
  '044_08_entitlement_consistency' as block,
  count(*) filter (where ends_at is not null and ends_at <= starts_at) as invalid_period_rows,
  count(*) filter (where status = 'active' and ends_at is not null and ends_at <= now()) as stale_active_rows
from public.user_entitlements;

select
  '044_09_duplicate_active_entitlements' as block,
  entitlement_type,
  count(*) as duplicate_groups
from (
  select user_id, entitlement_type
  from public.user_entitlements
  where status = 'active'
  group by user_id, entitlement_type
  having count(*) > 1
) duplicates
group by entitlement_type
order by entitlement_type;
