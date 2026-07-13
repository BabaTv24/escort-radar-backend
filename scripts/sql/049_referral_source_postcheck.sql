begin transaction read only;

select 'exactly_one_root' check_name,count(*)=1 ok from public.client_referrals where referral_depth=0 and referred_by_user_id is null
union all select 'no_null_tree_fields',count(*)=0 from public.client_referrals where root_user_id is null or referral_depth is null or registration_source is null
union all select 'direct_clients_are_root_children',count(*)=0 from public.client_referrals r join auth.users root on lower(root.email)='mtvx007@gmail.com' where r.registration_source='direct' and (r.referred_by_user_id is distinct from root.id or r.root_user_id is distinct from root.id or r.referral_depth<>1)
union all select 'admin_sponsored_root_children_are_classified',count(*)=0 from public.profiles p join public.client_referrals r on r.user_id=p.user_id join auth.users root on lower(root.email)='mtvx007@gmail.com' where p.is_sponsored and (p.acquisition_source in ('admin_sponsored','hermes_import_sponsored') or p.provider in ('manual_admin','hermes_agent')) and r.referred_by_user_id=root.id and r.root_user_id=root.id and r.referral_depth=1 and r.registration_source<>'sponsored_profile'
union all select 'referral_sources_have_parent',count(*)=0 from public.client_referrals where registration_source in ('referral_link','referral_code') and referred_by_user_id is null;

select count(*) referral_codes_total,count(distinct referral_code) referral_codes_unique,count(*) filter(where referral_code is null) referral_codes_null from public.client_referrals;
select count(*) wallets,coalesce(sum(balance_bcu),0) total_balance_bcu from public.bcu_wallets;
select count(*) ledger_entries,coalesce(sum(case when direction='credit' then amount_bcu else -amount_bcu end),0) ledger_net_bcu from public.bcu_ledger_entries;

-- Compare these three fingerprints with the output captured from 049_referral_source_precheck.sql.
select
 (select md5(coalesce(string_agg(user_id::text||':'||referral_code,'|' order by user_id),'')) from public.client_referrals) referral_codes_fingerprint,
 (select md5(coalesce(string_agg(id::text||':'||balance_bcu||':'||lifetime_credit_bcu||':'||lifetime_debit_bcu,'|' order by id),'')) from public.bcu_wallets) wallets_fingerprint,
 (select md5(count(*)::text||':'||coalesce(sum(case when direction='credit' then amount_bcu else -amount_bcu end),0)::text) from public.bcu_ledger_entries) ledger_fingerprint;

commit;
