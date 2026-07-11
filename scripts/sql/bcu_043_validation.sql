-- STAGING validation for 043_bcu_authoritative_wallet.sql.
-- Read-only. Run each SELECT block separately after migration 043.

-- 043-01: required relations and RLS state.
select
  '043_01_relations' as block,
  expected.relation_name,
  c.relkind in ('r', 'p') as relation_exists,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from (values
  ('bcu_wallets'),
  ('bcu_ledger_entries'),
  ('bcu_migration_reconciliation')
) expected(relation_name)
left join pg_catalog.pg_namespace n on n.nspname = 'public'
left join pg_catalog.pg_class c on c.relnamespace = n.oid and c.relname = expected.relation_name
order by expected.relation_name;

-- 043-02: indexes, including uniqueness and predicates.
select
  '043_02_indexes' as block,
  tablename,
  indexname,
  indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename in ('bcu_wallets', 'bcu_ledger_entries', 'bcu_migration_reconciliation')
order by tablename, indexname;

-- 043-03: foreign keys with validated state and definitions.
select
  '043_03_foreign_keys' as block,
  c.relname as relation_name,
  con.conname as constraint_name,
  con.convalidated,
  pg_catalog.pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('bcu_wallets', 'bcu_ledger_entries', 'bcu_migration_reconciliation')
  and con.contype = 'f'
order by c.relname, con.conname;

-- 043-04: CHECK constraints.
select
  '043_04_check_constraints' as block,
  c.relname as relation_name,
  con.conname as constraint_name,
  con.convalidated,
  pg_catalog.pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('bcu_wallets', 'bcu_ledger_entries', 'bcu_migration_reconciliation')
  and con.contype = 'c'
order by c.relname, con.conname;

-- 043-05: RLS policies.
select
  '043_05_rls_policies' as block,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in ('bcu_wallets', 'bcu_ledger_entries', 'bcu_migration_reconciliation')
order by tablename, policyname;

-- 043-06: function security, search_path and definition markers.
select
  '043_06_functions' as block,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '') as function_config,
  coalesce(array_to_string(p.proconfig, ', '), '') like '%search_path=public%' as search_path_public,
  case when p.proname = 'apply_bcu_ledger_entry'
    then pg_catalog.pg_get_functiondef(p.oid) like '%idempotency_key%'
      and pg_catalog.pg_get_functiondef(p.oid) like '%for update%'
      and pg_catalog.pg_get_functiondef(p.oid) like '%BCU_IDEMPOTENCY_CONFLICT%'
    else true end as required_markers_present
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('bc_to_bcu', 'apply_bcu_ledger_entry', 'prevent_bcu_ledger_mutation')
order by p.proname;

-- 043-07: immutable ledger trigger.
select
  '043_07_immutable_trigger' as block,
  t.tgname as trigger_name,
  not t.tgisinternal as user_trigger,
  pg_catalog.pg_get_triggerdef(t.oid, true) as definition,
  p.proname as trigger_function
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join pg_catalog.pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and c.relname = 'bcu_ledger_entries'
order by t.tgname;

-- 043-08: table and function privileges.
select
  '043_08_table_privileges' as block,
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('bcu_wallets', 'bcu_ledger_entries', 'bcu_migration_reconciliation')
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select
  '043_09_execute_privileges' as block,
  p.proname as function_name,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('bc_to_bcu', 'apply_bcu_ledger_entry', 'prevent_bcu_ledger_mutation')
order by p.proname;

-- 043-10: stored balances remain non-negative and ledger ownership is consistent.
select
  '043_10_data_consistency' as block,
  (select count(*) from public.bcu_wallets where balance_bcu < 0 or lifetime_credit_bcu < 0 or lifetime_debit_bcu < 0) as invalid_wallet_rows,
  (select count(*) from public.bcu_ledger_entries where amount_bcu <= 0) as invalid_ledger_amount_rows,
  (select count(*) from public.bcu_ledger_entries le
    left join public.bcu_wallets w on w.id = le.wallet_id and w.user_id = le.user_id
    where w.id is null) as ledger_wallet_owner_mismatch_rows;
