-- Read-only inspection after a partial migration 047 failure. This script changes no data or schema.
begin transaction read only;

select current_database() as database_name, current_user as database_user, version() as postgres_version;

select
  to_regprocedure('extensions.gen_random_bytes(integer)') is not null as extensions_gen_random_bytes_exists,
  to_regprocedure('public.gen_random_bytes(integer)') is not null as public_gen_random_bytes_exists;

select n.nspname as function_schema, p.proname as function_name, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.proname in ('gen_random_bytes','gen_random_uuid','digest','encode')
order by p.proname,n.nspname;

select name, installed_version, pe.extnamespace::regnamespace::text as extension_schema
from pg_available_extensions pae left join pg_extension pe on pe.extname=pae.name
where name='pgcrypto';

select c.relname as object_name, c.relkind, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('system_settings','client_referrals','bcu_wallets','bcu_ledger_entries')
order by c.relname;

select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public' and table_name in ('system_settings','client_referrals')
order by table_name,ordinal_position;

select conrelid::regclass::text as table_name,conname,contype,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in ('public.system_settings'::regclass,'public.client_referrals'::regclass)
order by table_name,conname;

select tablename,indexname,indexdef from pg_indexes
where schemaname='public' and tablename in ('system_settings','client_referrals')
order by tablename,indexname;

select event_object_table as table_name,trigger_name,event_manipulation,action_timing,action_statement
from information_schema.triggers where event_object_schema='public'
and event_object_table in ('system_settings','client_referrals')
and trigger_name in ('client_referrals_parent_immutable') order by table_name,trigger_name;

select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename in ('system_settings','client_referrals')
order by tablename,policyname;

select routine_schema,routine_name,routine_type,data_type
from information_schema.routines where routine_schema='public'
and routine_name in ('generate_referral_code','assign_referral','get_admin_referral_tree','prevent_referral_parent_change')
order by routine_name;

select grantee,table_name,privilege_type
from information_schema.role_table_grants where table_schema='public'
and table_name in ('system_settings','client_referrals')
and grantee in ('anon','authenticated','service_role') order by table_name,grantee,privilege_type;

select key,value,updated_at from public.system_settings where key='root_referrer_user_id';

with admin as (select id from auth.users where lower(email)='mtvx007@gmail.com')
select a.id as admin_user_id,
  (select count(*) from public.client_referrals r where r.user_id=a.id) as admin_referral_rows,
  (select count(*) from public.bcu_wallets w where w.user_id=a.id) as admin_wallet_rows,
  (select balance_bcu from public.bcu_wallets w where w.user_id=a.id limit 1) as balance_bcu,
  (select count(*) from public.bcu_ledger_entries l where l.user_id=a.id) as ledger_entries
from admin a;

select count(*) as client_referral_count,
  count(*) filter(where referred_by_user_id is null) as missing_parent_count,
  count(*) filter(where root_user_id is null) as missing_root_count,
  count(*) filter(where referral_depth is null) as missing_depth_count,
  count(*) filter(where registration_source is null) as missing_source_count
from public.client_referrals;

select user_id,referral_code,referred_by_code,referred_by_user_id,root_user_id,referral_depth,registration_source
from public.client_referrals order by created_at,user_id;

commit;
