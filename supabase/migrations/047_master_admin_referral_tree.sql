-- Master Admin Referral Tree. Review before applying. This file is intentionally idempotent.
create extension if not exists pgcrypto;

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.client_referrals
  add column if not exists referred_by_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists root_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists referral_depth integer,
  add column if not exists registration_source text;

alter table public.client_referrals drop constraint if exists client_referrals_registration_source_check;
alter table public.client_referrals add constraint client_referrals_registration_source_check check
  (registration_source in ('direct','referral_link','referral_code','admin_created','sponsored_profile','import','backfill'));
alter table public.client_referrals drop constraint if exists client_referrals_not_self;
alter table public.client_referrals add constraint client_referrals_not_self check (referred_by_user_id is distinct from user_id);
alter table public.client_referrals drop constraint if exists client_referrals_depth_valid;
alter table public.client_referrals add constraint client_referrals_depth_valid check (referral_depth >= 0);

create index if not exists client_referrals_parent_idx on public.client_referrals(referred_by_user_id, created_at, user_id);
create index if not exists client_referrals_root_depth_idx on public.client_referrals(root_user_id, referral_depth);
create index if not exists client_referrals_source_idx on public.client_referrals(registration_source);

create or replace function public.generate_referral_code()
returns text language sql volatile set search_path = public, pg_temp
as $$ select 'ER-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)) $$;

do $$
declare v_admin_id uuid;
begin
  select id into v_admin_id from auth.users where lower(email) = 'mtvx007@gmail.com';
  if v_admin_id is null then
    raise exception 'REFERRAL_ROOT_ACCOUNT_NOT_FOUND: required auth.users account mtvx007@gmail.com does not exist';
  end if;

  insert into public.system_settings(key, value)
  values ('root_referrer_user_id', to_jsonb(v_admin_id::text))
  on conflict (key) do update set value = excluded.value, updated_at = now();

  insert into public.client_referrals(user_id, referral_code, referral_link, referred_by_user_id, root_user_id, referral_depth, registration_source)
  values (v_admin_id, public.generate_referral_code(), '', null, v_admin_id, 0, 'admin_created')
  on conflict (user_id) do nothing;

  update public.client_referrals set referred_by_user_id=null, root_user_id=v_admin_id, referral_depth=0,
    registration_source='admin_created', referral_link='https://escort-radar.fun/register?ref=' || referral_code
  where user_id=v_admin_id and (referred_by_user_id is not null or root_user_id is distinct from v_admin_id or referral_depth is distinct from 0
    or registration_source is distinct from 'admin_created' or referral_link is distinct from 'https://escort-radar.fun/register?ref=' || referral_code);

  -- Exactly one authoritative wallet; existing balances and lifetime totals are untouched.
  insert into public.bcu_wallets(user_id) values(v_admin_id) on conflict(user_id) do nothing;

  -- Every auth user, including users without a profile, gets one node. Profiles without user_id create no node.
  insert into public.client_referrals(user_id, referral_code, referral_link, registration_source)
  select u.id, public.generate_referral_code(), '',
    case when exists(select 1 from public.profiles p where p.user_id=u.id and (p.acquisition_source='admin_sponsored' or p.provider='manual_admin'))
      then 'sponsored_profile' else 'backfill' end
  from auth.users u where u.id<>v_admin_id
  on conflict(user_id) do nothing;

  update public.client_referrals set referral_link='https://escort-radar.fun/register?ref=' || referral_code
  where referral_link is distinct from 'https://escort-radar.fun/register?ref=' || referral_code;

  -- Resolve every valid legacy code edge. Existing UUID parents are never overwritten.
  update public.client_referrals child set referred_by_user_id=parent.user_id,
    registration_source=coalesce(child.registration_source,'backfill')
  from public.client_referrals parent
  where child.user_id<>v_admin_id and child.referred_by_user_id is null
    and nullif(trim(child.referred_by_code),'') is not null
    and upper(parent.referral_code)=upper(trim(child.referred_by_code))
    and parent.user_id<>child.user_id;

  -- Preserve existing parents and calculate their complete ancestry with cycle detection.
  if exists (
    with recursive walk(start_id,current_id,path,cycle) as (
      select r.user_id,r.referred_by_user_id,array[r.user_id],false from public.client_referrals r where r.referred_by_user_id is not null
      union all select w.start_id,r.referred_by_user_id,w.path||r.user_id,r.user_id=any(w.path)
      from walk w join public.client_referrals r on r.user_id=w.current_id where not w.cycle and w.current_id is not null
    ) select 1 from walk where cycle
  ) then raise exception 'REFERRAL_CYCLE_DETECTED_IN_EXISTING_DATA'; end if;

  -- Only unresolved top-level nodes fall back to root; historical source remains backfill.
  update public.client_referrals set referred_by_user_id=v_admin_id,root_user_id=v_admin_id,referral_depth=1,
    registration_source=coalesce(registration_source,'backfill')
  where user_id<>v_admin_id and referred_by_user_id is null;

  -- Calculate the final root and depth only after every orphan root has been attached.
  with recursive tree(user_id,root_id,depth,path) as (
    select r.user_id,r.user_id,0,array[r.user_id] from public.client_referrals r where r.user_id=v_admin_id
    union all select child.user_id,tree.root_id,tree.depth+1,tree.path||child.user_id
    from tree join public.client_referrals child on child.referred_by_user_id=tree.user_id
    where not child.user_id=any(tree.path) and tree.depth<100
  )
  update public.client_referrals r set root_user_id=tree.root_id,referral_depth=tree.depth
  from tree where r.user_id=tree.user_id
    and (r.root_user_id is distinct from tree.root_id or r.referral_depth is distinct from tree.depth);
end $$;

create or replace function public.assign_referral(p_user_id uuid, p_referral_code text default null, p_source text default 'direct')
returns public.client_referrals language plpgsql security definer set search_path=public,pg_temp as $$
declare v_root uuid; v_parent public.client_referrals%rowtype; v_result public.client_referrals%rowtype; v_code text; v_source text;
begin
  select (value #>> '{}')::uuid into v_root from public.system_settings where key='root_referrer_user_id';
  if v_root is null then raise exception 'REFERRAL_ROOT_NOT_CONFIGURED'; end if;
  select * into v_result from public.client_referrals where user_id=p_user_id for update;
  if found then return v_result; end if;
  if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'REFERRAL_USER_NOT_FOUND'; end if;
  if nullif(trim(coalesce(p_referral_code,'')),'') is not null then
    select * into v_parent from public.client_referrals where referral_code=upper(trim(p_referral_code));
  end if;
  if v_parent.user_id is null or v_parent.user_id=p_user_id then
    select * into v_parent from public.client_referrals where user_id=v_root;
    v_source := case when p_source in ('admin_created','sponsored_profile','import','backfill') then p_source else 'direct' end;
  else
    v_source := case when p_source='referral_code' then 'referral_code' else 'referral_link' end;
  end if;
  if v_parent.user_id is null then raise exception 'REFERRAL_ROOT_NODE_NOT_FOUND'; end if;
  loop
    v_code:=public.generate_referral_code();
    begin
      insert into public.client_referrals(user_id,referral_code,referral_link,referred_by_code,referred_by_user_id,root_user_id,referral_depth,registration_source)
      values(p_user_id,v_code,'https://escort-radar.fun/register?ref='||v_code,v_parent.referral_code,v_parent.user_id,v_parent.root_user_id,v_parent.referral_depth+1,v_source)
      returning * into v_result; return v_result;
    exception when unique_violation then null; end;
  end loop;
end $$;

create or replace function public.prevent_referral_parent_change() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if current_setting('request.jwt.claim.role',true)='service_role' then return new; end if;
 if old.referred_by_user_id is distinct from new.referred_by_user_id or old.root_user_id is distinct from new.root_user_id or old.referral_depth is distinct from new.referral_depth
 then raise exception 'REFERRAL_PARENT_IMMUTABLE'; end if; return new;
end $$;
drop trigger if exists client_referrals_parent_immutable on public.client_referrals;
create trigger client_referrals_parent_immutable before update on public.client_referrals for each row execute function public.prevent_referral_parent_change();

create or replace function public.get_admin_referral_tree(p_parent_user_id uuid default null,p_root_user_id uuid default null,p_max_depth integer default 1,p_page integer default 1,p_page_size integer default 50,p_search text default null,p_role text default null,p_source text default null)
returns table(user_id uuid,display_name text,role text,account_status text,registration_source text,referral_code text,referral_depth integer,created_at timestamptz,direct_children_count bigint,total_descendants_count bigint,balance_bcu bigint,has_profile boolean,parent_user_id uuid)
language sql security definer set search_path=public,pg_temp as $$
 with recursive scope as (
  select r.user_id,r.referred_by_user_id,0 local_depth from public.client_referrals r
  where r.user_id=coalesce(p_parent_user_id,p_root_user_id,(select (value#>>'{}')::uuid from public.system_settings where key='root_referrer_user_id'))
  union all select c.user_id,c.referred_by_user_id,s.local_depth+1 from scope s join public.client_referrals c on c.referred_by_user_id=s.user_id where s.local_depth<least(greatest(p_max_depth,0),5)
 ), rows as (
  select r.*,coalesce(nullif(u.raw_user_meta_data->>'username',''),nullif(cp.display_name,''),'Użytkownik Escort Radar') name,
   coalesce(u.raw_app_meta_data->>'role',u.raw_app_meta_data->>'auth_account_type','client') user_role,
   case when u.banned_until is not null and u.banned_until>now() then 'blocked' else 'active' end user_status,
   exists(select 1 from public.profiles p where p.user_id=r.user_id) profile_exists,
   (select count(*) from public.client_referrals c where c.referred_by_user_id=r.user_id) child_count,
   (with recursive d as (select c.user_id from public.client_referrals c where c.referred_by_user_id=r.user_id union all select c.user_id from d join public.client_referrals c on c.referred_by_user_id=d.user_id) select count(*) from d) descendant_count
  from scope s join public.client_referrals r on r.user_id=s.user_id join auth.users u on u.id=r.user_id left join public.client_profiles cp on cp.user_id=r.user_id
 )
 select rows.user_id,rows.name,rows.user_role,rows.user_status,rows.registration_source,rows.referral_code,rows.referral_depth,rows.created_at,rows.child_count,rows.descendant_count,coalesce(w.balance_bcu,0),rows.profile_exists,rows.referred_by_user_id
 from rows left join public.bcu_wallets w on w.user_id=rows.user_id
 where (p_search is null or rows.name ilike '%'||p_search||'%' or rows.referral_code ilike '%'||p_search||'%') and (p_role is null or rows.user_role=p_role) and (p_source is null or rows.registration_source=p_source)
 order by rows.referral_depth,rows.created_at,rows.user_id offset ((greatest(p_page,1)-1)*least(greatest(p_page_size,1),100)) limit least(greatest(p_page_size,1),100)
$$;

alter table public.system_settings enable row level security;
revoke all on public.system_settings from anon,authenticated;
revoke insert,update,delete on public.client_referrals from anon,authenticated;
revoke all on function public.generate_referral_code() from public,anon,authenticated;
revoke all on function public.assign_referral(uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_admin_referral_tree(uuid,uuid,integer,integer,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.assign_referral(uuid,text,text) to service_role;
grant execute on function public.get_admin_referral_tree(uuid,uuid,integer,integer,integer,text,text,text) to service_role;
grant all on public.system_settings to service_role;
