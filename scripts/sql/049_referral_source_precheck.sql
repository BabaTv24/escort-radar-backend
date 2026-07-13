begin transaction read only;

with root as (
  select id from auth.users where lower(email)='mtvx007@gmail.com'
), audit as (
 select u.id user_id,u.email,
  coalesce(u.raw_app_meta_data->>'role',u.raw_app_meta_data->>'auth_account_type','unknown') role,
  (p.user_id is not null) has_profile,p.display_name profile_name,coalesce(p.is_sponsored,false) is_sponsored,
  r.referral_code,r.registration_source current_source,
  case when p.is_admin_sponsored and r.registration_source in ('backfill','admin_created','import','sponsored_profile') and r.referred_by_user_id=root.id and r.root_user_id=root.id and r.referral_depth=1 then 'sponsored_profile'
   when r.registration_source='backfill' and r.referred_by_user_id=root.id and r.root_user_id=root.id and r.referral_depth=1 and nullif(trim(coalesce(r.referred_by_code,'')),'') is null and p.user_id is null and
    (coalesce(u.raw_app_meta_data->>'auth_account_type','')='client' or coalesce(u.raw_app_meta_data->>'client_state',u.raw_app_meta_data->>'client_activation_state','') like 'client_%'
     or cp.user_id is not null or ca.user_id is not null or cap.user_id is not null) then 'direct'
   else r.registration_source end predicted_source,
  r.referred_by_user_id current_parent,r.referred_by_user_id expected_parent,
  coalesce(ca.state,case when cap.provider is not null then 'client_activated' else 'client_free' end) activation_status,
  coalesce(cap.provider,case when ca.state='client_activated' then 'manual_admin' end) activation_provider
 from auth.users u cross join root left join public.client_referrals r on r.user_id=u.id
 left join public.client_profiles cp on cp.user_id=u.id left join public.client_activations ca on ca.user_id=u.id
 left join lateral (select p.user_id,p.display_name,p.is_sponsored,
   (p.is_sponsored and (p.acquisition_source in ('admin_sponsored','hermes_import_sponsored') or p.provider in ('manual_admin','hermes_agent'))) is_admin_sponsored
   from public.profiles p where p.user_id=u.id order by p.is_published desc nulls last,(p.status='active') desc,p.is_sponsored desc,p.created_at desc,p.id desc limit 1) p on true
 left join lateral (select x.user_id,x.provider from public.client_activation_payments x where x.user_id=u.id order by x.created_at desc limit 1) cap on true
)
select user_id,regexp_replace(email,'(^.).*(@.*$)','\1***\2') email_safe,role,has_profile,profile_name,is_sponsored,referral_code,
 current_source,predicted_source,current_parent,expected_parent,activation_provider,activation_status,
 current_source is distinct from predicted_source or current_parent is distinct from expected_parent will_change
from audit order by email limit 10;

select
 (select md5(coalesce(string_agg(user_id::text||':'||referral_code,'|' order by user_id),'')) from public.client_referrals) referral_codes_fingerprint,
 (select md5(coalesce(string_agg(id::text||':'||balance_bcu||':'||lifetime_credit_bcu||':'||lifetime_debit_bcu,'|' order by id),'')) from public.bcu_wallets) wallets_fingerprint,
 (select md5(count(*)::text||':'||coalesce(sum(case when direction='credit' then amount_bcu else -amount_bcu end),0)::text) from public.bcu_ledger_entries) ledger_fingerprint;

commit;
