-- STAGING validation for 045_client_premium_bcu_atomic.sql.
-- Read-only. Run each SELECT block separately after migration 045.

-- 045-01: atomic RPC security and required definition markers.
select
  '045_01_atomic_rpc' as block,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '') as function_config,
  coalesce(array_to_string(p.proconfig, ', '), '') like '%search_path=public%' as search_path_public,
  pg_catalog.pg_get_functiondef(p.oid) like '%pg_advisory_xact_lock%' as advisory_lock_present,
  pg_catalog.pg_get_functiondef(p.oid) like '%client-premium-bonus:%' as stable_bonus_key_present,
  pg_catalog.pg_get_functiondef(p.oid) like '%client-premium-referral:%' as stable_referral_key_present,
  pg_catalog.pg_get_functiondef(p.oid) like '%apply_bcu_ledger_entry%' as ledger_rpc_present,
  pg_catalog.pg_get_functiondef(p.oid) like '%BCU_CLIENT_PREMIUM_ENTITLEMENT_CONFLICT%' as entitlement_conflict_present,
  pg_catalog.pg_get_functiondef(p.oid) like '%BCU_REFERRAL_REWARD_CONFLICT%' as referral_conflict_present,
  pg_catalog.pg_get_functiondef(p.oid) like '%BCU_CLIENT_PREMIUM_ACTIVATION_INVALID%' as activation_guard_present
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'activate_client_premium_bcu';

-- 045-02: referral partial unique index.
select
  '045_02_referral_unique_index' as block,
  indexname,
  indexdef,
  indexname = 'client_rewards_one_granted_activation_referral_idx'
    and indexdef like '%UNIQUE%'
    and indexdef like '%referred_user_id%'
    and indexdef like '%reward_type%'
    and indexdef like '%client_activation_referral%'
    and indexdef like '%granted%'
    as valid
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename = 'client_rewards'
  and indexname = 'client_rewards_one_granted_activation_referral_idx';

-- 045-03: client_rewards schema compatibility.
with expected_columns(column_name, expected_udt) as (
  values
    ('user_id', 'uuid'),
    ('referral_id', 'uuid'),
    ('referred_user_id', 'uuid'),
    ('reward_type', 'text'),
    ('coins', 'numeric'),
    ('status', 'text'),
    ('metadata', 'jsonb')
)
select
  '045_03_client_rewards_compatibility' as block,
  ec.column_name,
  ec.expected_udt,
  c.udt_name as actual_udt,
  c.column_name is not null as exists,
  c.udt_name = ec.expected_udt as type_compatible
from expected_columns ec
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = 'client_rewards'
 and c.column_name = ec.column_name
order by ec.column_name;

-- 045-04: EXECUTE grants.
select
  '045_04_execute_privileges' as block,
  p.proname as function_name,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'activate_client_premium_bcu';

-- 045-05: duplicate domain rewards; expected result is zero rows.
select
  '045_05_duplicate_referral_rewards' as block,
  reward_type,
  status,
  count(*) as duplicate_groups
from (
  select referred_user_id, reward_type, status
  from public.client_rewards
  where referred_user_id is not null
    and reward_type = 'client_activation_referral'
    and status = 'granted'
  group by referred_user_id, reward_type, status
  having count(*) > 1
) duplicates
group by reward_type, status;

-- 045-06: Premium bonus and entitlement pairing; expected mismatch counts are zero.
with premium_bonus as (
  select user_id, id as ledger_id
  from public.bcu_ledger_entries
  where idempotency_key = 'client-premium-bonus:' || user_id::text
    and amount_bcu = 70000
    and direction = 'credit'
    and status = 'completed'
),
premium_entitlement as (
  select user_id, source_reference_id
  from public.user_entitlements
  where entitlement_type = 'client_premium'
    and status = 'active'
)
select
  '045_06_bonus_entitlement_pairing' as block,
  count(*) filter (where pb.user_id is not null and pe.user_id is null) as bonus_without_entitlement,
  count(*) filter (where pb.user_id is null and pe.user_id is not null) as entitlement_without_bonus,
  count(*) filter (where pb.user_id is not null and pe.user_id is not null
    and pe.source_reference_id is distinct from pb.ledger_id) as source_reference_mismatch
from premium_bonus pb
full join premium_entitlement pe on pe.user_id = pb.user_id;

-- 045-07: stable bonus/referral idempotency and exact amounts.
select
  '045_07_idempotency_consistency' as block,
  count(*) filter (where idempotency_key like 'client-premium-bonus:%'
    and (amount_bcu <> 70000 or direction <> 'credit' or transaction_type <> 'bcu_product_premium_activation_bonus'))
    as invalid_bonus_entries,
  count(*) filter (where idempotency_key like 'client-premium-referral:%'
    and (amount_bcu <> 100000 or direction <> 'credit' or transaction_type <> 'bcu_product_referral_reward'))
    as invalid_referral_entries,
  count(*) filter (where idempotency_key like 'client-premium-bonus:%') as premium_bonus_entries,
  count(*) filter (where idempotency_key like 'client-premium-referral:%') as premium_referral_entries
from public.bcu_ledger_entries;

-- 045-08: referral ledger and client_rewards pairing.
select
  '045_08_referral_pairing' as block,
  count(*) filter (where cr.metadata ->> 'ledger_entry_id' is null) as historical_rewards_without_bcu_reference,
  count(*) filter (where cr.metadata ->> 'ledger_entry_id' is not null and le.id is null) as broken_bcu_ledger_references,
  count(*) filter (where le.id is not null and (le.amount_bcu <> 100000 or le.direction <> 'credit')) as invalid_referral_ledger
from public.client_rewards cr
left join public.bcu_ledger_entries le
  on le.id::text = cr.metadata ->> 'ledger_entry_id'
where cr.reward_type = 'client_activation_referral'
  and cr.status = 'granted';

-- 045-09: rollback markers inferred from absence of partial Premium state.
select
  '045_09_partial_state_markers' as block,
  count(*) filter (where w.id is not null and le.id is null and ue.id is not null) as entitlement_without_bonus_ledger,
  count(*) filter (where le.id is not null and ue.id is null) as bonus_ledger_without_entitlement
from public.client_activations ca
left join public.bcu_wallets w on w.user_id = ca.user_id
left join public.bcu_ledger_entries le
  on le.user_id = ca.user_id and le.idempotency_key = 'client-premium-bonus:' || ca.user_id::text
left join public.user_entitlements ue
  on ue.user_id = ca.user_id and ue.entitlement_type = 'client_premium' and ue.status = 'active'
where ca.state = 'client_activated';
