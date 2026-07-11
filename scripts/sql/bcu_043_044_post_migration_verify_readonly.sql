-- Escort Radar BCU 043/044 post-migration verification diagnostics.
-- Read-only script for Supabase SQL Editor. Run blocks one by one after migrations.
-- No full UUIDs, user emails, metadata, or payment payloads are selected.

-- VERIFY 01: tables and columns.
with expected_columns(table_name, column_name) as (
  values
    ('bcu_wallets', 'id'), ('bcu_wallets', 'user_id'), ('bcu_wallets', 'public_wallet_id'), ('bcu_wallets', 'balance_bcu'), ('bcu_wallets', 'lifetime_credit_bcu'), ('bcu_wallets', 'lifetime_debit_bcu'), ('bcu_wallets', 'frozen'), ('bcu_wallets', 'migration_status'), ('bcu_wallets', 'migrated_at'), ('bcu_wallets', 'created_at'), ('bcu_wallets', 'updated_at'),
    ('bcu_ledger_entries', 'id'), ('bcu_ledger_entries', 'wallet_id'), ('bcu_ledger_entries', 'user_id'), ('bcu_ledger_entries', 'amount_bcu'), ('bcu_ledger_entries', 'direction'), ('bcu_ledger_entries', 'transaction_type'), ('bcu_ledger_entries', 'status'), ('bcu_ledger_entries', 'idempotency_key'), ('bcu_ledger_entries', 'reference_type'), ('bcu_ledger_entries', 'reference_id'), ('bcu_ledger_entries', 'source_user_id'), ('bcu_ledger_entries', 'target_user_id'), ('bcu_ledger_entries', 'profile_id'), ('bcu_ledger_entries', 'business_id'), ('bcu_ledger_entries', 'subscription_id'), ('bcu_ledger_entries', 'booking_id'), ('bcu_ledger_entries', 'source_system'), ('bcu_ledger_entries', 'source_table'), ('bcu_ledger_entries', 'source_record_id'), ('bcu_ledger_entries', 'metadata'), ('bcu_ledger_entries', 'created_by'), ('bcu_ledger_entries', 'created_at'),
    ('bcu_migration_reconciliation', 'id'), ('bcu_migration_reconciliation', 'user_id'), ('bcu_migration_reconciliation', 'legacy_wallet_id'), ('bcu_migration_reconciliation', 'coin_wallet_id'), ('bcu_migration_reconciliation', 'legacy_balance_bcu'), ('bcu_migration_reconciliation', 'coin_balance_bcu'), ('bcu_migration_reconciliation', 'recommended_balance_bcu'), ('bcu_migration_reconciliation', 'manual_balance_bcu'), ('bcu_migration_reconciliation', 'approved_balance_bcu'), ('bcu_migration_reconciliation', 'status'), ('bcu_migration_reconciliation', 'reason'), ('bcu_migration_reconciliation', 'admin_note'), ('bcu_migration_reconciliation', 'reviewed_by'), ('bcu_migration_reconciliation', 'reviewed_at'), ('bcu_migration_reconciliation', 'approved_by'), ('bcu_migration_reconciliation', 'approved_at'), ('bcu_migration_reconciliation', 'applied_ledger_entry_id'), ('bcu_migration_reconciliation', 'metadata'), ('bcu_migration_reconciliation', 'created_at'), ('bcu_migration_reconciliation', 'updated_at'),
    ('system_bcu_products', 'id'), ('system_bcu_products', 'product_code'), ('system_bcu_products', 'display_name'), ('system_bcu_products', 'amount_bcu'), ('system_bcu_products', 'operation_type'), ('system_bcu_products', 'entitlement_type'), ('system_bcu_products', 'duration_days'), ('system_bcu_products', 'active'), ('system_bcu_products', 'metadata'), ('system_bcu_products', 'created_at'), ('system_bcu_products', 'updated_at'),
    ('user_entitlements', 'id'), ('user_entitlements', 'user_id'), ('user_entitlements', 'entitlement_type'), ('user_entitlements', 'status'), ('user_entitlements', 'starts_at'), ('user_entitlements', 'ends_at'), ('user_entitlements', 'source'), ('user_entitlements', 'source_reference_id'), ('user_entitlements', 'product_code'), ('user_entitlements', 'metadata'), ('user_entitlements', 'created_at'), ('user_entitlements', 'updated_at')
)
select
  'verify_01_tables_and_columns' as block,
  ec.table_name,
  (t.table_name is not null) as table_exists,
  ec.column_name,
  (c.column_name is not null) as column_exists,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from expected_columns ec
left join information_schema.tables t
  on t.table_schema = 'public'
 and t.table_name = ec.table_name
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = ec.table_name
 and c.column_name = ec.column_name
order by ec.table_name, c.ordinal_position nulls last, ec.column_name;

-- VERIFY 02: constraints.
with expected_constraints(table_name, expected_check) as (
  values
    ('bcu_wallets', 'balance_bcu >= 0'),
    ('bcu_wallets', 'lifetime_credit_bcu >= 0'),
    ('bcu_wallets', 'lifetime_debit_bcu >= 0'),
    ('bcu_wallets', 'user_id unique'),
    ('bcu_wallets', '(id, user_id) unique'),
    ('bcu_ledger_entries', 'amount_bcu > 0'),
    ('bcu_ledger_entries', 'direction in credit/debit'),
    ('bcu_ledger_entries', 'idempotency_key unique'),
    ('bcu_ledger_entries', '(wallet_id, user_id) composite fk'),
    ('bcu_migration_reconciliation', 'manual/recommended/approved balances >= 0'),
    ('system_bcu_products', 'amount_bcu > 0'),
    ('system_bcu_products', 'operation_type check'),
    ('user_entitlements', 'status check'),
    ('user_entitlements', 'entitlement_type check'),
    ('user_entitlements', 'ends_at after starts_at'),
    ('user_entitlements', 'product_code fk')
),
constraints as (
  select
    conrelid::regclass::text as table_name,
    conname,
    contype,
    pg_catalog.pg_get_constraintdef(oid) as constraint_definition
  from pg_catalog.pg_constraint
  where connamespace = 'public'::regnamespace
),
indexes as (
  select
    schemaname,
    tablename as table_name,
    indexname,
    indexdef
  from pg_catalog.pg_indexes
  where schemaname = 'public'
    and indexname = 'user_entitlements_one_active_type_idx'
)
select
  'verify_02_constraints' as block,
  ec.table_name,
  ec.expected_check,
  c.conname,
  c.contype,
  c.constraint_definition,
  null::text as indexname,
  null::text as indexdef
from expected_constraints ec
left join constraints c
  on c.table_name = ('public.' || ec.table_name)
 and (
    c.constraint_definition ilike '%' || split_part(ec.expected_check, ' ', 1) || '%'
    or c.conname ilike '%' || replace(split_part(ec.expected_check, ' ', 1), '(', '') || '%'
 )
union all
select
  'verify_02_constraints',
  'user_entitlements',
  'partial unique active entitlement',
  null,
  null,
  null,
  i.indexname,
  i.indexdef
from indexes i
order by table_name, expected_check, conname nulls last, indexname nulls last;

-- VERIFY 03: indexes.
with expected_indexes(index_name, table_name) as (
  values
    ('bcu_wallets_user_id_idx', 'bcu_wallets'),
    ('bcu_ledger_entries_wallet_created_idx', 'bcu_ledger_entries'),
    ('bcu_ledger_entries_user_created_idx', 'bcu_ledger_entries'),
    ('bcu_ledger_entries_type_status_idx', 'bcu_ledger_entries'),
    ('bcu_ledger_entries_reference_idx', 'bcu_ledger_entries'),
    ('bcu_ledger_entries_source_idx', 'bcu_ledger_entries'),
    ('bcu_migration_reconciliation_status_idx', 'bcu_migration_reconciliation'),
    ('user_entitlements_one_active_type_idx', 'user_entitlements'),
    ('user_entitlements_user_status_idx', 'user_entitlements'),
    ('system_bcu_products_active_idx', 'system_bcu_products')
)
select
  'verify_03_indexes' as block,
  ei.table_name,
  ei.index_name,
  (i.indexname is not null) as exists,
  i.indexdef
from expected_indexes ei
left join pg_catalog.pg_indexes i
  on i.schemaname = 'public'
 and i.tablename = ei.table_name
 and i.indexname = ei.index_name
order by ei.table_name, ei.index_name;

-- VERIFY 04: RLS.
select
  'verify_04_rls' as block,
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity,
  p.policyname,
  p.cmd,
  p.roles,
  p.qual as using_expression,
  p.with_check as with_check_expression
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
left join pg_catalog.pg_policies p
  on p.schemaname = n.nspname
 and p.tablename = c.relname
where n.nspname = 'public'
  and c.relname in (
    'bcu_wallets',
    'bcu_ledger_entries',
    'bcu_migration_reconciliation',
    'system_bcu_products',
    'user_entitlements'
  )
order by c.relname, p.policyname nulls last;

-- VERIFY 05: function security.
with expected_functions(function_name) as (
  values
    ('bc_to_bcu'),
    ('apply_bcu_ledger_entry'),
    ('prevent_bcu_ledger_mutation'),
    ('has_active_user_entitlement'),
    ('activate_bcu_product')
)
select
  'verify_05_function_security' as block,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as signature,
  p.prosecdef as security_definer,
  p.proowner::regrole::text as owner,
  array_to_string(p.proconfig, ', ') as function_config,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from expected_functions ef
left join pg_catalog.pg_proc p on p.proname = ef.function_name
left join pg_catalog.pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where n.nspname = 'public' or p.oid is null
order by ef.function_name, signature;

-- VERIFY 06: product seeds.
with expected_products(product_code, expected_amount_bcu) as (
  values
    ('premium_activation_bonus', 70000::bigint),
    ('favorite_profile', 50000::bigint),
    ('referral_reward', 100000::bigint),
    ('communication_plus', 1000000::bigint),
    ('advertiser_30_days', 3332666::bigint),
    ('small_business_30_days', 33266666::bigint),
    ('vip_business_30_days', 119933333::bigint)
)
select
  'verify_06_product_seeds' as block,
  ep.product_code,
  p.amount_bcu,
  p.operation_type,
  p.entitlement_type,
  p.duration_days,
  p.active,
  ep.expected_amount_bcu,
  (p.amount_bcu = ep.expected_amount_bcu) as amount_matches_expected
from expected_products ep
left join public.system_bcu_products p on p.product_code = ep.product_code
order by ep.product_code;

-- VERIFY 07: no migrated balances.
select 'verify_07_no_migrated_balances' as block, 'bcu_wallets' as table_name, count(*) as row_count from public.bcu_wallets
union all select 'verify_07_no_migrated_balances', 'bcu_ledger_entries', count(*) from public.bcu_ledger_entries
union all select 'verify_07_no_migrated_balances', 'bcu_migration_reconciliation', count(*) from public.bcu_migration_reconciliation
order by table_name;

-- VERIFY 08: legacy unchanged.
-- Before running migrations, replace null::bigint with manually recorded preflight row counts.
-- This block does not save or mutate snapshots.
with manual_baseline(table_name, before_row_count) as (
  values
    ('wallets', null::bigint),
    ('token_transactions', null::bigint),
    ('coin_wallets', null::bigint),
    ('coin_transactions', null::bigint)
),
current_counts(table_name, current_row_count) as (
  select 'wallets', count(*) from public.wallets
  union all select 'token_transactions', count(*) from public.token_transactions
  union all select 'coin_wallets', count(*) from public.coin_wallets
  union all select 'coin_transactions', count(*) from public.coin_transactions
)
select
  'verify_08_legacy_unchanged' as block,
  mb.table_name,
  mb.before_row_count,
  cc.current_row_count,
  case
    when mb.before_row_count is null then 'baseline_not_entered'
    when mb.before_row_count = cc.current_row_count then 'unchanged'
    else 'changed_stop'
  end as finding
from manual_baseline mb
join current_counts cc on cc.table_name = mb.table_name
order by mb.table_name;
