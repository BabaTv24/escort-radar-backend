begin read only;

select version() as postgresql_version;

with required_tables(name) as (values
  ('profiles'), ('client_favorites'), ('client_activations'), ('client_referrals'), ('client_rewards'),
  ('wallets'), ('coin_wallets'), ('bcu_wallets'), ('bcu_ledger_entries'),
  ('bcu_migration_reconciliation'), ('system_bcu_products'), ('user_entitlements')
)
select r.name, to_regclass('public.' || r.name) is not null as present
from required_tables r order by r.name;

with required_columns(table_name, column_name, data_type) as (values
  ('profiles','id','uuid'), ('profiles','user_id','uuid'), ('profiles','status','text'),
  ('profiles','is_published','boolean'), ('profiles','moderation_status','text'), ('profiles','shadowbanned','boolean'),
  ('client_favorites','client_id','uuid'), ('client_favorites','profile_id','uuid'),
  ('bcu_wallets','balance_bcu','bigint'), ('bcu_wallets','frozen','boolean'),
  ('bcu_ledger_entries','amount_bcu','bigint'), ('bcu_ledger_entries','idempotency_key','text')
)
select r.*, (c.column_name is not null and c.data_type = r.data_type) as valid
from required_columns r left join information_schema.columns c
  on c.table_schema='public' and c.table_name=r.table_name and c.column_name=r.column_name
order by r.table_name, r.column_name;

select to_regprocedure('public.set_updated_at()') is not null as set_updated_at,
  to_regprocedure('public.apply_bcu_ledger_entry(uuid,bigint,text,text,text,text,uuid,text,text,uuid,jsonb,uuid,uuid,uuid,uuid,uuid,uuid,uuid)') is not null as apply_ledger,
  to_regprocedure('public.has_active_user_entitlement(uuid,text)') is not null as entitlement_check,
  to_regprocedure('public.activate_client_premium_bcu(uuid,uuid,text)') is not null as premium_activation;

select conrelid::regclass as relation, conname, contype, pg_get_constraintdef(oid) as definition
from pg_catalog.pg_constraint
where conrelid in ('public.bcu_wallets'::regclass, 'public.bcu_ledger_entries'::regclass,
  'public.system_bcu_products'::regclass, 'public.user_entitlements'::regclass)
order by 1::text, conname;

select schemaname, tablename, indexname, indexdef from pg_catalog.pg_indexes
where schemaname='public' and tablename in ('bcu_wallets','bcu_ledger_entries','system_bcu_products','user_entitlements')
order by tablename,indexname;

select n.nspname as schema_name, c.relname, c.relrowsecurity
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('bcu_wallets','bcu_ledger_entries','bcu_migration_reconciliation','system_bcu_products','user_entitlements');

select p.oid::regprocedure as function,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_execute
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('apply_bcu_ledger_entry','activate_bcu_product','activate_client_premium_bcu');

select to_regclass('public.bcu_favorite_transfers') is null as migration_046_table_absent,
  to_regprocedure('public.add_bcu_favorite_with_transfer(uuid,uuid,text)') is null as migration_046_rpc_absent;

rollback;
