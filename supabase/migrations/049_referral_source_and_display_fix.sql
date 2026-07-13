-- Correct historical referral attribution and enrich the admin referral tree.
-- Review before applying. Intentionally leaves referral codes, wallets and ledgers untouched.
begin;

create temporary table referral_049_codes_before on commit drop as
select user_id, referral_code from public.client_referrals;
create temporary table referral_049_wallets_before on commit drop as
select id, balance_bcu, lifetime_credit_bcu, lifetime_debit_bcu from public.bcu_wallets;
create temporary table referral_049_ledger_before on commit drop as
select count(*)::bigint entry_count from public.bcu_ledger_entries;

do $$
declare v_admin_id uuid;
begin
  select id into strict v_admin_id from auth.users where lower(email) = 'mtvx007@gmail.com';

  -- Reclassify only admin-origin sponsored accounts that are already canonical root children.
  -- A real multi-level parent is deliberately never rewritten by this correction.
  update public.client_referrals r
  set registration_source = 'sponsored_profile'
  where r.user_id <> v_admin_id
    and r.registration_source in ('backfill','admin_created','import','sponsored_profile')
    and r.referred_by_user_id = v_admin_id
    and r.root_user_id = v_admin_id
    and r.referral_depth = 1
    and exists (
      select 1 from public.profiles p
      where p.user_id = r.user_id
        and p.is_sponsored is true
        and (p.acquisition_source in ('admin_sponsored','hermes_import_sponsored')
          or p.provider in ('manual_admin','hermes_agent'))
    )
    and r.registration_source is distinct from 'sponsored_profile';

  -- Historical public client signups were attached to root by 047. Reclassify only unresolved
  -- root children with no advertising profile and positive client-account evidence.
  update public.client_referrals r
  set registration_source = 'direct'
  from auth.users u
  where u.id = r.user_id
    and r.user_id <> v_admin_id
    and r.registration_source = 'backfill'
    and r.referred_by_user_id = v_admin_id
    and r.root_user_id = v_admin_id
    and r.referral_depth = 1
    and nullif(trim(coalesce(r.referred_by_code,'')),'') is null
    and not exists (select 1 from public.profiles p where p.user_id = r.user_id)
    and (
      lower(coalesce(u.raw_app_meta_data->>'auth_account_type', u.raw_app_meta_data->>'account_type', '')) = 'client'
      or coalesce(u.raw_app_meta_data->>'client_state', u.raw_app_meta_data->>'client_activation_state', '') like 'client_%'
      or exists (select 1 from public.client_profiles cp where cp.user_id = r.user_id)
      or exists (select 1 from public.client_activations ca where ca.user_id = r.user_id)
      or exists (select 1 from public.client_activation_payments cap where cap.user_id = r.user_id)
    );
end $$;

drop function if exists public.get_admin_referral_tree(uuid,uuid,integer,integer,integer,text,text,text);
create function public.get_admin_referral_tree(p_parent_user_id uuid default null,p_root_user_id uuid default null,p_max_depth integer default 1,p_page integer default 1,p_page_size integer default 50,p_search text default null,p_role text default null,p_source text default null)
returns table(user_id uuid,display_name text,role text,account_status text,registration_source text,activation_status text,activation_provider text,referral_code text,referral_depth integer,created_at timestamptz,direct_children_count bigint,total_descendants_count bigint,balance_bcu bigint,has_profile boolean,is_sponsored_profile boolean,parent_user_id uuid)
language sql security definer set search_path=public,pg_temp as $$
 with recursive scope as (
  select r.user_id,r.referred_by_user_id,0 local_depth from public.client_referrals r
  where r.user_id=coalesce(p_parent_user_id,p_root_user_id,(select (value#>>'{}')::uuid from public.system_settings where key='root_referrer_user_id'))
  union all select c.user_id,c.referred_by_user_id,s.local_depth+1 from scope s join public.client_referrals c on c.referred_by_user_id=s.user_id where s.local_depth<least(greatest(p_max_depth,0),5)
 ), rows as (
  select r.*,
   case when r.referral_depth=0 then coalesce(nullif(profile.display_name,''),nullif(u.raw_user_meta_data->>'display_name',''),nullif(u.raw_user_meta_data->>'username',''),'Administrator główny')
    else coalesce(nullif(profile.display_name,''),nullif(cp.display_name,''),nullif(u.raw_user_meta_data->>'display_name',''),nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),nullif(u.raw_user_meta_data->>'username',''),nullif(left(w.public_wallet_id,14),''),case when coalesce(u.raw_app_meta_data->>'role',u.raw_app_meta_data->>'auth_account_type') is not null then initcap(replace(coalesce(u.raw_app_meta_data->>'role',u.raw_app_meta_data->>'auth_account_type'),'_',' ')) end,'Użytkownik Escort Radar') end name,
   coalesce(u.raw_app_meta_data->>'role',u.raw_app_meta_data->>'auth_account_type','client') user_role,
   case when u.banned_until is not null and u.banned_until>now() then 'blocked' else 'active' end user_status,
   coalesce(ca.state,case when activation_payment.provider is not null then 'client_activated' else 'client_free' end) activation_state,
   coalesce(activation_payment.provider,case when ca.state='client_activated' then 'manual_admin' end) activation_provider,
   (profile.user_id is not null) profile_exists,coalesce(profile.is_sponsored,false) sponsored,
   (select count(*) from public.client_referrals c where c.referred_by_user_id=r.user_id) child_count,
   (with recursive d as (select c.user_id from public.client_referrals c where c.referred_by_user_id=r.user_id union all select c.user_id from d join public.client_referrals c on c.referred_by_user_id=d.user_id) select count(*) from d) descendant_count,
   w.balance_bcu
  from scope s join public.client_referrals r on r.user_id=s.user_id join auth.users u on u.id=r.user_id
  left join public.client_profiles cp on cp.user_id=r.user_id
  left join lateral (select p.user_id,p.display_name,p.is_sponsored from public.profiles p where p.user_id=r.user_id order by p.is_published desc nulls last,(p.status='active') desc,p.is_sponsored desc,p.created_at desc,p.id desc limit 1) profile on true
  left join public.client_activations ca on ca.user_id=r.user_id
  left join lateral (select cap.provider from public.client_activation_payments cap where cap.user_id=r.user_id and coalesce(cap.payment_status,cap.status) in ('paid','succeeded','complete','completed') order by cap.created_at desc limit 1) activation_payment on true
  left join public.bcu_wallets w on w.user_id=r.user_id
 )
 select rows.user_id,rows.name,rows.user_role,rows.user_status,rows.registration_source,rows.activation_state,rows.activation_provider,rows.referral_code,rows.referral_depth,rows.created_at,rows.child_count,rows.descendant_count,coalesce(rows.balance_bcu,0),rows.profile_exists,rows.sponsored,rows.referred_by_user_id
 from rows where (p_search is null or rows.name ilike '%'||p_search||'%' or rows.referral_code ilike '%'||p_search||'%') and (p_role is null or rows.user_role=p_role) and (p_source is null or rows.registration_source=p_source)
 order by rows.referral_depth,rows.created_at,rows.user_id offset ((greatest(p_page,1)-1)*least(greatest(p_page_size,1),100)) limit least(greatest(p_page_size,1),100)
$$;

revoke all on function public.get_admin_referral_tree(uuid,uuid,integer,integer,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.get_admin_referral_tree(uuid,uuid,integer,integer,integer,text,text,text) to service_role;

do $$
begin
  if exists (select 1 from referral_049_codes_before b join public.client_referrals r using(user_id) where b.referral_code is distinct from r.referral_code)
    or (select count(*) from referral_049_codes_before) <> (select count(*) from public.client_referrals)
  then raise exception 'REFERRAL_049_CHANGED_REFERRAL_CODES'; end if;
  if exists (select 1 from referral_049_wallets_before b full join public.bcu_wallets w using(id) where b.id is null or w.id is null or (b.balance_bcu,b.lifetime_credit_bcu,b.lifetime_debit_bcu) is distinct from (w.balance_bcu,w.lifetime_credit_bcu,w.lifetime_debit_bcu))
  then raise exception 'REFERRAL_049_CHANGED_WALLETS'; end if;
  if (select entry_count from referral_049_ledger_before) <> (select count(*) from public.bcu_ledger_entries)
  then raise exception 'REFERRAL_049_CHANGED_LEDGER'; end if;
  if exists (select 1 from auth.users u join public.client_referrals r on r.user_id=u.id where lower(u.email)='bigbaba.vip@gmail.com' and r.referral_code<>'ER-9582A4BF')
  then raise exception 'REFERRAL_049_BIGBABA_CODE_MISMATCH'; end if;
end $$;

commit;
