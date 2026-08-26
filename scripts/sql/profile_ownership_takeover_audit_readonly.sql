-- Escort Radar profile ownership takeover audit (P0-SEC-1A).
-- Read-only script for the Supabase SQL Editor. Run blocks one by one.
-- Contains only SELECT / WITH statements: no INSERT, UPDATE, DELETE, ALTER, DROP,
-- and no writing function is called. Nothing here changes data.
--
-- Purpose: list CANDIDATES for manual review after the self-service owner_email
-- profile link was removed. Until that fix, any account registered with a
-- profile's owner_email was attached to that profile on the next
-- GET /api/profiles/me or GET /api/auth/me call.
--
-- HOW TO READ THE RESULT
--   A mismatch between auth.users.email and profiles.owner_email is NOT proof of a
--   takeover. Legitimate mismatches are expected for: the tokenized sponsored claim
--   (claim_admin_sponsored_profile hands the profile to a different account by design),
--   admin linking, an owner who later changed their login e-mail, agencies and
--   businesses managing a profile from a shared account, and imported test data.
--   Treat every row as an item to verify by hand against billing, support history and
--   the claim audit trail. Do not act on this output automatically.
--
-- E-mail addresses are masked. Unmask only for a row you are actively investigating.


-- BLOCK 00: schema sanity checks.
-- Confirms the tables and columns the later blocks depend on. If sponsored_profile_claim_audits
-- is missing, migration 052 is not applied on this environment and BLOCK 03 will return nothing.
with expected_columns(table_name, column_name) as (
  values
    ('profiles', 'id'), ('profiles', 'user_id'), ('profiles', 'owner_email'), ('profiles', 'created_at'),
    ('profiles', 'status'), ('profiles', 'is_published'), ('profiles', 'moderation_status'), ('profiles', 'shadowbanned'),
    ('profiles', 'sponsorship_type'), ('profiles', 'owner_activation_status'), ('profiles', 'acquisition_source'),
    ('sponsored_profile_claim_audits', 'profile_id'), ('sponsored_profile_claim_audits', 'owner_user_id'),
    ('sponsored_profile_claim_audits', 'technical_user_id')
)
select
  'block_00_schema_sanity' as block,
  ec.table_name,
  ec.column_name,
  (c.column_name is not null) as column_exists,
  c.data_type
from expected_columns ec
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = ec.table_name
 and c.column_name = ec.column_name
order by ec.table_name, ec.column_name;


-- BLOCK 01: exposure surface that made the takeover possible.
-- Profiles that still have no owner account but do carry an owner_email. While the
-- profile is published, that owner_email was also readable through the public API.
-- These rows now need an explicit admin link or a claim invite: they will no longer
-- attach themselves to a self-registered account.
select
  'block_01_unowned_with_owner_email' as block,
  p.id as profile_id,
  p.display_name,
  left(split_part(coalesce(p.owner_email, ''), '@', 1), 2) || '***@' || split_part(coalesce(p.owner_email, ''), '@', 2) as owner_email_masked,
  p.status,
  p.is_published,
  p.moderation_status,
  p.shadowbanned,
  p.acquisition_source,
  p.sponsorship_type,
  p.created_at,
  (p.status = 'active' and p.is_published is true and p.moderation_status = 'approved' and p.shadowbanned is false)
    as was_publicly_listed,
  exists (
    select 1 from auth.users u
    where lower(u.email) = lower(p.owner_email)
  ) as auth_account_with_this_email_exists
from public.profiles p
where p.user_id is null
  and coalesce(p.owner_email, '') <> ''
order by was_publicly_listed desc, p.created_at desc;


-- BLOCK 02: owner mismatch candidates.
-- Profiles that DO have an owner account whose login e-mail differs from owner_email.
-- review_signal ranks how much attention a row deserves; it is a hint, never a verdict.
with owned as (
  select
    p.id as profile_id,
    p.display_name,
    p.owner_email,
    p.user_id,
    p.created_at as profile_created_at,
    p.sponsorship_type,
    p.owner_activation_status,
    p.acquisition_source,
    u.email as auth_email,
    u.created_at as account_created_at,
    u.raw_app_meta_data ->> 'created_by' as account_created_by,
    (u.raw_app_meta_data ->> 'admin') as account_admin_flag
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where coalesce(p.owner_email, '') <> ''
    and lower(coalesce(u.email, '')) is distinct from lower(p.owner_email)
),
claimed as (
  select distinct profile_id, owner_user_id
  from public.sponsored_profile_claim_audits
)
select
  'block_02_owner_mismatch_candidates' as block,
  o.profile_id,
  o.display_name,
  left(split_part(coalesce(o.owner_email, ''), '@', 1), 2) || '***@' || split_part(coalesce(o.owner_email, ''), '@', 2) as owner_email_masked,
  left(split_part(coalesce(o.auth_email, ''), '@', 1), 2) || '***@' || split_part(coalesce(o.auth_email, ''), '@', 2) as auth_email_masked,
  o.user_id as current_owner_user_id,
  o.profile_created_at,
  o.account_created_at,
  (o.account_created_at > o.profile_created_at) as account_registered_after_profile,
  o.account_created_by,
  o.sponsorship_type,
  o.owner_activation_status,
  (c.profile_id is not null and c.owner_user_id = o.user_id) as explained_by_sponsored_claim,
  case
    when c.profile_id is not null and c.owner_user_id = o.user_id then 'explained_by_sponsored_claim'
    when o.account_created_by is not null then 'explained_by_admin_or_importer_provenance'
    when o.account_created_at > o.profile_created_at then 'review_self_registered_after_profile'
    else 'review_email_mismatch_only'
  end as review_signal
from owned o
left join claimed c on c.profile_id = o.profile_id
order by
  case
    when c.profile_id is not null and c.owner_user_id = o.user_id then 3
    when o.account_created_by is not null then 2
    when o.account_created_at > o.profile_created_at then 0
    else 1
  end,
  o.account_created_at desc;


-- BLOCK 03: sponsored claim cross-check.
-- Every ownership change that went through the tokenized SMS claim is audited here.
-- Use it to clear rows from BLOCK 02: a profile listed here changed hands legitimately.
select
  'block_03_audited_sponsored_claims' as block,
  a.profile_id,
  a.technical_user_id,
  a.owner_user_id,
  a.transferred_balance_bcu,
  a.activation_evidence,
  a.created_at,
  p.display_name,
  p.owner_activation_status,
  (p.user_id = a.owner_user_id) as profile_still_held_by_claimant
from public.sponsored_profile_claim_audits a
left join public.profiles p on p.id = a.profile_id
order by a.created_at desc;


-- BLOCK 04: accounts registered on an address that is an owner_email somewhere.
-- Self-registered accounts (no admin/importer provenance) whose login e-mail matches a
-- profile's owner_email. Where such an account currently owns that profile and the account
-- was created after the profile, the self-service link is the most likely explanation --
-- but an owner who simply signed up for their own profile looks exactly the same. Verify
-- against billing and support history before drawing any conclusion.
select
  'block_04_self_registered_on_owner_email' as block,
  u.id as user_id,
  left(split_part(coalesce(u.email, ''), '@', 1), 2) || '***@' || split_part(coalesce(u.email, ''), '@', 2) as auth_email_masked,
  u.created_at as account_created_at,
  (u.email_confirmed_at is not null) as email_confirmed,
  u.raw_app_meta_data ->> 'created_by' as account_created_by,
  u.raw_app_meta_data ->> 'auth_account_type' as auth_account_type,
  p.id as profile_id,
  p.display_name,
  p.created_at as profile_created_at,
  (p.user_id = u.id) as account_currently_owns_this_profile,
  (u.created_at > p.created_at) as account_registered_after_profile
from auth.users u
join public.profiles p
  on lower(p.owner_email) = lower(u.email)
where coalesce(p.owner_email, '') <> ''
  and u.raw_app_meta_data ->> 'created_by' is null
order by account_currently_owns_this_profile desc, account_registered_after_profile desc, u.created_at desc;


-- BLOCK 05: summary counts for the report.
select
  'block_05_summary' as block,
  count(*) filter (where p.user_id is null and coalesce(p.owner_email, '') <> '') as unowned_with_owner_email,
  count(*) filter (
    where p.user_id is null and coalesce(p.owner_email, '') <> ''
      and p.status = 'active' and p.is_published is true
      and p.moderation_status = 'approved' and p.shadowbanned is false
  ) as unowned_published_with_owner_email,
  count(*) filter (where p.user_id is not null) as owned_profiles,
  count(*) as total_profiles
from public.profiles p;
