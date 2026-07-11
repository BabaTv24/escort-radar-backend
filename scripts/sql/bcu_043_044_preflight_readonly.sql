-- Escort Radar BCU 043-045 portable preflight diagnostics.
-- Read-only script for Supabase SQL Editor. Select and run every block separately.
-- Uses only SELECT statements, information_schema and pg_catalog diagnostics.
-- No secrets, full UUIDs, emails, metadata or payment payloads are selected.

-- BLOCK 00: BCU object-name collisions before migrations 043-045.
with expected_objects(object_name, object_kind, introduced_by) as (
  values
    ('bcu_wallets', 'relation', '043'),
    ('bcu_ledger_entries', 'relation', '043'),
    ('bcu_migration_reconciliation', 'relation', '043'),
    ('system_bcu_products', 'relation', '044'),
    ('user_entitlements', 'relation', '044'),
    ('bc_to_bcu', 'function', '043'),
    ('apply_bcu_ledger_entry', 'function', '043'),
    ('prevent_bcu_ledger_mutation', 'function', '043'),
    ('has_active_user_entitlement', 'function', '044'),
    ('activate_bcu_product', 'function', '044'),
    ('activate_client_premium_bcu', 'function', '045'),
    ('client_rewards_one_granted_activation_referral_idx', 'index', '045')
),
found_relations as (
  select c.relname as object_name,
    case c.relkind when 'r' then 'table' when 'p' then 'partitioned_table'
      when 'v' then 'view' when 'm' then 'materialized_view' when 'i' then 'index'
      else c.relkind::text end as actual_type
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
),
found_functions as (
  select p.proname as object_name,
    'function(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as actual_type
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select
  'block_00_object_collisions' as block,
  eo.introduced_by,
  eo.object_kind,
  eo.object_name,
  coalesce(fr.actual_type, ff.actual_type) as actual_type,
  (fr.object_name is not null or ff.object_name is not null) as exists_before_migration,
  case when fr.object_name is null and ff.object_name is null then 'clear' else 'review_existing_object' end as finding
from expected_objects eo
left join found_relations fr on fr.object_name = eo.object_name and eo.object_kind in ('relation', 'index')
left join found_functions ff on ff.object_name = eo.object_name and eo.object_kind = 'function'
order by eo.introduced_by, eo.object_kind, eo.object_name;

-- BLOCK 01: required relations, functions and extension capabilities.
with expected_dependencies(dependency_name, dependency_kind, required_for, requirement) as (
  values
    ('auth.users', 'relation', '043-045', 'required'),
    ('public.wallets', 'relation', '043', 'required'),
    ('public.coin_wallets', 'relation', '043', 'required'),
    ('public.client_activations', 'relation', '045', 'required'),
    ('public.client_referrals', 'relation', '045', 'required'),
    ('public.client_rewards', 'relation', '045', 'required'),
    ('public.set_updated_at', 'function', '043-044', 'required'),
    ('gen_random_uuid', 'function', '043-044', 'required_capability_in_search_path'),
    ('pg_catalog.pg_advisory_xact_lock', 'function', '044-045', 'required_capability'),
    ('pgcrypto', 'extension', '043-044', 'recommended_provider_for_uuid_capability')
),
relations as (
  select n.nspname || '.' || c.relname as dependency_name,
    case c.relkind when 'r' then 'table' when 'p' then 'partitioned_table' else c.relkind::text end as actual_type
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
),
functions as (
  select n.nspname || '.' || p.proname as dependency_name, p.proname as function_name,
    'function(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as actual_type
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
),
extensions as (
  select e.extname as dependency_name, 'extension ' || e.extversion as actual_type
  from pg_catalog.pg_extension e
)
select
  'block_01_required_dependencies' as block,
  ed.required_for,
  ed.dependency_kind,
  ed.dependency_name,
  ed.requirement,
  coalesce(r.actual_type, f.actual_type, x.actual_type) as actual_type,
  (r.dependency_name is not null or f.dependency_name is not null or x.dependency_name is not null) as exists,
  case
    when ed.dependency_kind = 'extension' and x.dependency_name is null
      and exists (select 1 from functions fx where fx.function_name = 'gen_random_uuid')
      then 'capability_available_without_detected_extension'
    when r.dependency_name is not null or f.dependency_name is not null or x.dependency_name is not null then 'ready'
    else 'missing_dependency'
  end as finding
from expected_dependencies ed
left join relations r on r.dependency_name = ed.dependency_name and ed.dependency_kind = 'relation'
left join functions f on ed.dependency_kind = 'function'
  and (f.dependency_name = ed.dependency_name or f.function_name = ed.dependency_name)
left join extensions x on x.dependency_name = ed.dependency_name and ed.dependency_kind = 'extension'
order by ed.required_for, ed.dependency_kind, ed.dependency_name;

-- BLOCK 02: required column and type compatibility for FK and RPC inputs.
with expected_columns(table_schema, table_name, column_name, expected_udt, required_for) as (
  values
    ('auth', 'users', 'id', 'uuid', '043-045 FK targets'),
    ('public', 'wallets', 'id', 'uuid', '043 legacy reconciliation FK'),
    ('public', 'coin_wallets', 'id', 'uuid', '043 legacy reconciliation FK'),
    ('public', 'client_activations', 'id', 'uuid', '045 activation input'),
    ('public', 'client_activations', 'user_id', 'uuid', '045 activation ownership'),
    ('public', 'client_activations', 'state', 'text', '045 activation state'),
    ('public', 'client_referrals', 'id', 'uuid', '045 referral record'),
    ('public', 'client_referrals', 'user_id', 'uuid', '045 referral beneficiary'),
    ('public', 'client_referrals', 'referral_code', 'text', '045 referral lookup'),
    ('public', 'client_rewards', 'user_id', 'uuid', '045 reward beneficiary'),
    ('public', 'client_rewards', 'referred_user_id', 'uuid', '045 reward uniqueness'),
    ('public', 'client_rewards', 'reward_type', 'text', '045 reward uniqueness'),
    ('public', 'client_rewards', 'status', 'text', '045 partial unique predicate'),
    ('public', 'client_rewards', 'coins', 'numeric', '045 domain reward value'),
    ('public', 'client_rewards', 'metadata', 'jsonb', '045 ledger reference')
)
select
  'block_02_column_type_compatibility' as block,
  ec.required_for,
  ec.table_schema || '.' || ec.table_name as relation_name,
  ec.column_name,
  ec.expected_udt,
  c.udt_name as actual_udt,
  c.is_nullable,
  (c.column_name is not null) as exists,
  (c.udt_name = ec.expected_udt) as type_compatible,
  case when c.column_name is null then 'missing_column'
    when c.udt_name <> ec.expected_udt then 'type_mismatch' else 'ready' end as finding
from expected_columns ec
left join information_schema.columns c
  on c.table_schema = ec.table_schema
 and c.table_name = ec.table_name
 and c.column_name = ec.column_name
order by ec.required_for, relation_name, ec.column_name;

-- BLOCK 03: required Supabase roles.
with expected_roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
)
select
  'block_03_required_roles' as block,
  er.role_name,
  (r.rolname is not null) as role_exists,
  r.rolcanlogin,
  r.rolinherit,
  case when r.rolname is null then 'missing_role' else 'ready' end as finding
from expected_roles er
left join pg_catalog.pg_roles r on r.rolname = er.role_name
order by er.role_name;

-- BLOCK 04A: informational migration-history status.
-- History storage is intentionally outside this portable SQL preflight.
select
  'block_04a_migration_history_status' as block,
  'migration_history_unavailable' as migration_history_status,
  false as migration_blocker,
  'Verify applied versions through the deployment workflow before staging' as next_action;

-- BLOCK 05: consolidated 043-045 readiness summary and legacy isolation.
-- Uses catalog metadata and row estimates so missing application relations do not abort this block.
with required_relations(schema_name, relation_name, required_for) as (
  values
    ('auth', 'users', '043-045'),
    ('public', 'wallets', '043'),
    ('public', 'coin_wallets', '043'),
    ('public', 'client_activations', '045'),
    ('public', 'client_referrals', '045'),
    ('public', 'client_rewards', '045')
),
expected_bcu_objects(object_name, object_kind, introduced_by) as (
  values
    ('bcu_wallets', 'relation', '043'),
    ('bcu_ledger_entries', 'relation', '043'),
    ('bcu_migration_reconciliation', 'relation', '043'),
    ('system_bcu_products', 'relation', '044'),
    ('user_entitlements', 'relation', '044'),
    ('bc_to_bcu', 'function', '043'),
    ('apply_bcu_ledger_entry', 'function', '043'),
    ('prevent_bcu_ledger_mutation', 'function', '043'),
    ('has_active_user_entitlement', 'function', '044'),
    ('activate_bcu_product', 'function', '044'),
    ('activate_client_premium_bcu', 'function', '045'),
    ('client_rewards_one_granted_activation_referral_idx', 'index', '045')
),
required_typed_columns(schema_name, relation_name, column_name, expected_udt, required_for) as (
  values
    ('auth', 'users', 'id', 'uuid', '043-045'),
    ('public', 'wallets', 'id', 'uuid', '043'),
    ('public', 'coin_wallets', 'id', 'uuid', '043'),
    ('public', 'client_activations', 'id', 'uuid', '045'),
    ('public', 'client_activations', 'user_id', 'uuid', '045'),
    ('public', 'client_activations', 'state', 'text', '045'),
    ('public', 'client_referrals', 'referral_code', 'text', '045'),
    ('public', 'client_rewards', 'referred_user_id', 'uuid', '045'),
    ('public', 'client_rewards', 'reward_type', 'text', '045'),
    ('public', 'client_rewards', 'status', 'text', '045'),
    ('public', 'client_rewards', 'coins', 'numeric', '045'),
    ('public', 'client_rewards', 'metadata', 'jsonb', '045')
),
required_functions(schema_name, function_name, required_for) as (
  values
    ('public', 'set_updated_at', '043-044'),
    ('*', 'gen_random_uuid', '043-044'),
    ('pg_catalog', 'pg_advisory_xact_lock', '044-045')
),
expected_unique_targets(schema_name, relation_name, column_name, required_for) as (
  values
    ('auth', 'users', 'id', '043-045 FK target'),
    ('public', 'wallets', 'id', '043 FK target'),
    ('public', 'coin_wallets', 'id', '043 FK target'),
    ('public', 'client_activations', 'id', '045 activation identity'),
    ('public', 'client_referrals', 'referral_code', '045 referral lookup')
),
legacy_relations(relation_name) as (
  values ('wallets'), ('token_transactions'), ('coin_wallets'), ('coin_transactions')
),
catalog_relations as (
  select n.nspname as schema_name, c.relname as relation_name, c.oid,
    case c.relkind when 'r' then 'table' when 'p' then 'partitioned_table' else c.relkind::text end as actual_type,
    coalesce(s.n_live_tup, 0)::bigint as estimated_live_rows
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  left join pg_catalog.pg_stat_user_tables s on s.relid = c.oid
  where c.relkind in ('r', 'p')
),
catalog_functions as (
  select n.nspname as schema_name, p.proname as function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
),
catalog_public_objects as (
  select c.relname as object_name,
    case when c.relkind = 'i' then 'index' else 'relation' end as object_kind,
    case c.relkind when 'r' then 'table' when 'p' then 'partitioned_table'
      when 'i' then 'index' when 'v' then 'view' when 'm' then 'materialized_view'
      else c.relkind::text end as actual
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'i', 'v', 'm')
  union all
  select p.proname, 'function',
    'function(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')'
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
catalog_columns as (
  select c.table_schema as schema_name, c.table_name as relation_name,
    c.column_name, c.udt_name
  from information_schema.columns c
),
unique_columns as (
  select n.nspname as schema_name, c.relname as relation_name, a.attname as column_name
  from pg_catalog.pg_index i
  join pg_catalog.pg_class c on c.oid = i.indrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
  where i.indisunique and i.indisvalid
),
extension_capability as (
  select exists (select 1 from pg_catalog.pg_extension where extname = 'pgcrypto') as extension_exists,
    exists (
      select 1 from catalog_functions
      where function_name = 'gen_random_uuid'
    ) as uuid_function_exists
),
checks as (
  select 'name_collision'::text as check_category,
    ebo.object_kind || ':' || ebo.object_name as check_name,
    ebo.introduced_by as scope,
    (cpo.object_name is null) as ok,
    coalesce(cpo.actual, 'clear') as actual,
    'Expected BCU object name should be clear before its migration'::text as note
  from expected_bcu_objects ebo
  left join catalog_public_objects cpo
    on cpo.object_name = ebo.object_name and cpo.object_kind = ebo.object_kind

  union all

  select 'required_relation'::text as check_category,
    rr.schema_name || '.' || rr.relation_name as check_name,
    rr.required_for as scope,
    (cr.relation_name is not null) as ok,
    coalesce(cr.actual_type, 'missing') as actual,
    'Relation required before applying the listed migration'::text as note
  from required_relations rr
  left join catalog_relations cr on cr.schema_name = rr.schema_name and cr.relation_name = rr.relation_name

  union all

  select 'type_compatibility',
    rtc.schema_name || '.' || rtc.relation_name || '.' || rtc.column_name,
    rtc.required_for,
    (cc.column_name is not null and cc.udt_name = rtc.expected_udt),
    case when cc.column_name is null then 'missing'
      else cc.udt_name || '; expected=' || rtc.expected_udt end,
    'Required FK or RPC column type must match the migration contract'
  from required_typed_columns rtc
  left join catalog_columns cc on cc.schema_name = rtc.schema_name
    and cc.relation_name = rtc.relation_name and cc.column_name = rtc.column_name

  union all

  select 'required_function', rf.schema_name || '.' || rf.function_name, rf.required_for,
    exists (select 1 from catalog_functions cf
      where (rf.schema_name = '*' or cf.schema_name = rf.schema_name) and cf.function_name = rf.function_name),
    coalesce((select 'function(' || cf.identity_arguments || ')' from catalog_functions cf
      where (rf.schema_name = '*' or cf.schema_name = rf.schema_name) and cf.function_name = rf.function_name limit 1), 'missing'),
    'Function capability required by migrations'
  from required_functions rf

  union all

  select 'extension_capability', 'uuid_generation', '043-044',
    (ec.extension_exists or ec.uuid_function_exists),
    case when ec.extension_exists then 'pgcrypto extension detected'
      when ec.uuid_function_exists then 'UUID function available without detected extension' else 'missing' end,
    'The UUID function is the required capability; extension presence is reported separately'
  from extension_capability ec

  union all

  select 'fk_unique_target', eut.schema_name || '.' || eut.relation_name || '.' || eut.column_name,
    eut.required_for,
    (uc.column_name is not null),
    case when uc.column_name is not null then 'unique_or_primary_key' else 'missing_unique_target' end,
    'Referenced FK or lookup target must be unique'
  from expected_unique_targets eut
  left join unique_columns uc on uc.schema_name = eut.schema_name
    and uc.relation_name = eut.relation_name and uc.column_name = eut.column_name

  union all

  select 'required_role', er.role_name, '043-045', (r.rolname is not null),
    case when r.rolname is null then 'missing' else 'present' end,
    'Role used by privilege declarations'
  from (values ('anon'), ('authenticated'), ('service_role')) er(role_name)
  left join pg_catalog.pg_roles r on r.rolname = er.role_name

  union all

  select 'legacy_isolation', 'public.' || lr.relation_name, '043',
    (cr.relation_name is not null),
    case when cr.relation_name is null then 'missing'
      else 'present; estimated_live_rows=' || cr.estimated_live_rows::text end,
    'Read-only catalog estimate; migrations 043-045 must not mutate legacy wallet data'
  from legacy_relations lr
  left join catalog_relations cr on cr.schema_name = 'public' and cr.relation_name = lr.relation_name
)
select
  'block_05_consolidated_readiness' as block,
  check_category,
  check_name,
  scope,
  ok,
  actual,
  case when ok then 'ready' else 'blocker_or_manual_review' end as finding,
  note
from checks
order by check_category, check_name;
