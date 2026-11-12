with checks(check_name, passed) as (
  values
    ('historical_referral_reward_duplicates', not exists (
      select 1
      from public.client_rewards
      where referred_user_id is not null
        and reward_type = 'client_activation_referral'
      group by referred_user_id, reward_type, status
      having count(1) > 1
    )),
    ('duplicate_granted_rewards', not exists (
      select 1
      from public.client_rewards
      where referred_user_id is not null
        and reward_type = 'client_activation_referral'
        and status = 'granted'
      group by referred_user_id, reward_type
      having count(1) > 1
    )),
    ('duplicate_entitlement_candidates', not exists (
      select 1
      from public.user_entitlements
      where entitlement_type = 'client_premium'
        and status = 'active'
      group by user_id, entitlement_type
      having count(1) > 1
    )),
    ('duplicate_idempotency_keys', not exists (
      select 1
      from public.bcu_ledger_entries
      where idempotency_key is not null
      group by idempotency_key
      having count(1) > 1
    )),
    ('duplicate_referral_targets', not exists (
      select 1
      from public.client_rewards
      where referred_user_id is not null
        and reward_type = 'client_activation_referral'
        and status = 'granted'
      group by referred_user_id
      having count(distinct user_id) > 1
    ))
)
select
  'STEP 05' as step,
  case when bool_and(passed) then 'PASS' else 'STOP' end as overall_result,
  count(1) filter (where not passed) as failed_checks,
  coalesce(
    string_agg(check_name, ', ' order by check_name) filter (where not passed),
    'none'
  ) as failures
from checks;
