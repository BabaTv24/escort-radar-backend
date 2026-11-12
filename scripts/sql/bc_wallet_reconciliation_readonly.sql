-- Escort Radar BC wallet reconciliation diagnostics.
-- Read-only script for Supabase SQL Editor. Run blocks one by one.
-- Results intentionally use shortened identifiers and no email/payment payload output.

-- BLOCK 00: schema sanity checks.
-- Confirms whether expected repo tables and columns exist in the target Supabase schema.
with expected_columns(table_name, column_name) as (
  values
    ('wallets', 'id'), ('wallets', 'user_id'), ('wallets', 'escort_token_balance'), ('wallets', 'eur_spent'), ('wallets', 'referral_balance'), ('wallets', 'frozen'), ('wallets', 'created_at'), ('wallets', 'updated_at'),
    ('token_transactions', 'id'), ('token_transactions', 'from_wallet_id'), ('token_transactions', 'to_wallet_id'), ('token_transactions', 'amount'), ('token_transactions', 'transaction_type'), ('token_transactions', 'status'), ('token_transactions', 'metadata'), ('token_transactions', 'created_at'),
    ('token_packages', 'id'), ('token_packages', 'name'), ('token_packages', 'token_amount'), ('token_packages', 'eur_price'), ('token_packages', 'bonus_tokens'), ('token_packages', 'active'),
    ('coin_wallets', 'id'), ('coin_wallets', 'user_id'), ('coin_wallets', 'balance'), ('coin_wallets', 'lifetime_earned'), ('coin_wallets', 'lifetime_spent'), ('coin_wallets', 'frozen'), ('coin_wallets', 'created_at'), ('coin_wallets', 'updated_at'),
    ('coin_transactions', 'id'), ('coin_transactions', 'wallet_id'), ('coin_transactions', 'user_id'), ('coin_transactions', 'amount'), ('coin_transactions', 'direction'), ('coin_transactions', 'transaction_type'), ('coin_transactions', 'status'), ('coin_transactions', 'reference_type'), ('coin_transactions', 'reference_id'), ('coin_transactions', 'metadata'), ('coin_transactions', 'created_at'),
    ('gifts', 'id'), ('gifts', 'sender_user_id'), ('gifts', 'receiver_profile_id'), ('gifts', 'receiver_user_id'), ('gifts', 'gift_type'), ('gifts', 'coin_cost'), ('gifts', 'status'), ('gifts', 'created_at'),
    ('client_activations', 'id'), ('client_activations', 'user_id'), ('client_activations', 'state'), ('client_activations', 'activated_at'), ('client_activations', 'created_at'), ('client_activations', 'updated_at'),
    ('client_rewards', 'id'), ('client_rewards', 'user_id'), ('client_rewards', 'referral_id'), ('client_rewards', 'referred_user_id'), ('client_rewards', 'reward_type'), ('client_rewards', 'coins'), ('client_rewards', 'status'), ('client_rewards', 'created_at'),
    ('client_referrals', 'id'), ('client_referrals', 'user_id'), ('client_referrals', 'referral_code'), ('client_referrals', 'referred_by_code'), ('client_referrals', 'earned_coins'), ('client_referrals', 'created_at'), ('client_referrals', 'updated_at'),
    ('client_favorites', 'id'), ('client_favorites', 'client_id'), ('client_favorites', 'profile_id'), ('client_favorites', 'created_at'),
    ('subscriptions', 'id'), ('subscriptions', 'user_id'), ('subscriptions', 'profile_id'), ('subscriptions', 'plan'), ('subscriptions', 'status'), ('subscriptions', 'provider'), ('subscriptions', 'external_subscription_id'), ('subscriptions', 'stripe_subscription_id'), ('subscriptions', 'amount_eur'), ('subscriptions', 'amount_cents'), ('subscriptions', 'current_period_start'), ('subscriptions', 'current_period_end'), ('subscriptions', 'created_at'),
    ('manual_payment_orders', 'id'), ('manual_payment_orders', 'user_id'), ('manual_payment_orders', 'provider'), ('manual_payment_orders', 'purpose'), ('manual_payment_orders', 'product_id'), ('manual_payment_orders', 'amount_cents'), ('manual_payment_orders', 'amount_eur'), ('manual_payment_orders', 'tokens_amount'), ('manual_payment_orders', 'status'), ('manual_payment_orders', 'approved_at'), ('manual_payment_orders', 'applied_at'), ('manual_payment_orders', 'metadata'), ('manual_payment_orders', 'created_at'),
    ('stripe_payment_events', 'id'), ('stripe_payment_events', 'stripe_event_id'), ('stripe_payment_events', 'event_type'), ('stripe_payment_events', 'user_id'), ('stripe_payment_events', 'provider'), ('stripe_payment_events', 'transaction_type'), ('stripe_payment_events', 'plan'), ('stripe_payment_events', 'coins_amount'), ('stripe_payment_events', 'amount_cents'), ('stripe_payment_events', 'amount_eur'), ('stripe_payment_events', 'stripe_checkout_session_id'), ('stripe_payment_events', 'stripe_payment_intent_id'), ('stripe_payment_events', 'stripe_subscription_id'), ('stripe_payment_events', 'created_at'),
    ('token_purchase_requests', 'id'), ('token_purchase_requests', 'user_id'), ('token_purchase_requests', 'wallet_id'), ('token_purchase_requests', 'package_id'), ('token_purchase_requests', 'token_amount'), ('token_purchase_requests', 'eur_price'), ('token_purchase_requests', 'bonus_tokens'), ('token_purchase_requests', 'status'), ('token_purchase_requests', 'stripe_checkout_session_id'), ('token_purchase_requests', 'stripe_payment_intent_id'), ('token_purchase_requests', 'created_at'),
    ('vip_gallery_unlocks', 'id'), ('vip_gallery_unlocks', 'user_id'), ('vip_gallery_unlocks', 'profile_id'), ('vip_gallery_unlocks', 'coin_cost'), ('vip_gallery_unlocks', 'created_at')
),
expected_tables as (
  select distinct table_name from expected_columns
)
select
  'block_00_schema_sanity' as block,
  et.table_name,
  case when t.table_name is null then false else true end as table_exists,
  ec.column_name,
  case when c.column_name is null then false else true end as column_exists,
  c.data_type,
  c.is_nullable
from expected_tables et
left join information_schema.tables t
  on t.table_schema = 'public' and t.table_name = et.table_name
left join expected_columns ec
  on ec.table_name = et.table_name
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = ec.table_name and c.column_name = ec.column_name
order by et.table_name, ec.column_name;

-- BLOCK 00B: row counts.
-- Run after BLOCK 00 confirms these repo tables exist in production.
select 'block_00b_row_counts' as block, 'wallets' as table_name, count(*) as row_count from public.wallets
union all select 'block_00b_row_counts', 'token_transactions', count(*) from public.token_transactions
union all select 'block_00b_row_counts', 'token_packages', count(*) from public.token_packages
union all select 'block_00b_row_counts', 'coin_wallets', count(*) from public.coin_wallets
union all select 'block_00b_row_counts', 'coin_transactions', count(*) from public.coin_transactions
union all select 'block_00b_row_counts', 'gifts', count(*) from public.gifts
union all select 'block_00b_row_counts', 'client_activations', count(*) from public.client_activations
union all select 'block_00b_row_counts', 'client_rewards', count(*) from public.client_rewards
union all select 'block_00b_row_counts', 'client_referrals', count(*) from public.client_referrals
union all select 'block_00b_row_counts', 'client_favorites', count(*) from public.client_favorites
union all select 'block_00b_row_counts', 'subscriptions', count(*) from public.subscriptions
union all select 'block_00b_row_counts', 'manual_payment_orders', count(*) from public.manual_payment_orders
union all select 'block_00b_row_counts', 'stripe_payment_events', count(*) from public.stripe_payment_events
union all select 'block_00b_row_counts', 'token_purchase_requests', count(*) from public.token_purchase_requests
union all select 'block_00b_row_counts', 'vip_gallery_unlocks', count(*) from public.vip_gallery_unlocks
order by table_name;

-- BLOCK 01: wallet counts and overlap aggregate.
with
legacy_users as (
  select distinct user_id from public.wallets where user_id is not null
),
coin_users as (
  select distinct user_id from public.coin_wallets where user_id is not null
),
all_users as (
  select user_id from legacy_users
  union
  select user_id from coin_users
)
select
  'block_01_wallet_counts' as block,
  (select count(*) from public.wallets) as legacy_wallet_rows,
  (select count(*) from public.coin_wallets) as coin_wallet_rows,
  (select count(*) from all_users) as unique_wallet_users,
  count(*) filter (where l.user_id is not null and c.user_id is null) as users_only_legacy_wallet,
  count(*) filter (where l.user_id is null and c.user_id is not null) as users_only_coin_wallet,
  count(*) filter (where l.user_id is not null and c.user_id is not null) as users_in_both_systems
from all_users u
left join legacy_users l on l.user_id = u.user_id
left join coin_users c on c.user_id = u.user_id;

-- BLOCK 02: balance comparison samples for users with both wallet systems.
with
legacy_tx_counts as (
  select
    wallet_user_id as user_id,
    count(*) as legacy_transaction_count
  from (
    select fw.user_id as wallet_user_id, tt.id
    from public.token_transactions tt
    join public.wallets fw on fw.id = tt.from_wallet_id
    union
    select tw.user_id as wallet_user_id, tt.id
    from public.token_transactions tt
    join public.wallets tw on tw.id = tt.to_wallet_id
  ) sides
  where wallet_user_id is not null
  group by wallet_user_id
),
coin_tx_counts as (
  select user_id, count(*) as coin_transaction_count
  from public.coin_transactions
  where user_id is not null
  group by user_id
)
select
  'block_02_balance_comparison' as block,
  left(w.user_id::text, 8) || '...' || right(w.user_id::text, 4) as user_ref,
  w.escort_token_balance as legacy_balance,
  c.balance as coin_balance,
  coalesce(w.escort_token_balance, 0) - coalesce(c.balance, 0) as balance_difference_legacy_minus_coin,
  coalesce(w.updated_at, w.created_at) as legacy_wallet_updated_at,
  c.updated_at as coin_wallet_updated_at,
  coalesce(lt.legacy_transaction_count, 0) as legacy_transaction_count,
  coalesce(ct.coin_transaction_count, 0) as coin_transaction_count
from public.wallets w
join public.coin_wallets c on c.user_id = w.user_id
left join legacy_tx_counts lt on lt.user_id = w.user_id
left join coin_tx_counts ct on ct.user_id = w.user_id
where w.user_id is not null
order by abs(coalesce(w.escort_token_balance, 0) - coalesce(c.balance, 0)) desc,
  coalesce(w.updated_at, w.created_at) desc nulls last
limit 100;

-- BLOCK 03A: legacy wallet balance reconstructed from token_transactions.
with
legacy_credits as (
  select to_wallet_id as wallet_id, sum(amount) as credit_sum
  from public.token_transactions
  where to_wallet_id is not null and status in ('completed', 'approved')
  group by to_wallet_id
),
legacy_debits as (
  select from_wallet_id as wallet_id, sum(amount) as debit_sum
  from public.token_transactions
  where from_wallet_id is not null and status in ('completed', 'approved')
  group by from_wallet_id
)
select
  'block_03a_legacy_reconstructed_balance' as block,
  left(w.user_id::text, 8) || '...' || right(w.user_id::text, 4) as user_ref,
  left(w.id::text, 8) || '...' || right(w.id::text, 4) as wallet_ref,
  coalesce(c.credit_sum, 0) as credit_sum,
  coalesce(d.debit_sum, 0) as debit_sum,
  coalesce(c.credit_sum, 0) - coalesce(d.debit_sum, 0) as calculated_balance,
  w.escort_token_balance as stored_balance,
  coalesce(w.escort_token_balance, 0) - (coalesce(c.credit_sum, 0) - coalesce(d.debit_sum, 0)) as stored_minus_calculated
from public.wallets w
left join legacy_credits c on c.wallet_id = w.id
left join legacy_debits d on d.wallet_id = w.id
order by abs(coalesce(w.escort_token_balance, 0) - (coalesce(c.credit_sum, 0) - coalesce(d.debit_sum, 0))) desc,
  w.created_at desc
limit 100;

-- BLOCK 03B: coin wallet balance reconstructed from coin_transactions.
with
coin_credits as (
  select wallet_id, sum(abs(amount)) as credit_sum
  from public.coin_transactions
  where wallet_id is not null and direction = 'credit' and status = 'completed'
  group by wallet_id
),
coin_debits as (
  select wallet_id, sum(abs(amount)) as debit_sum
  from public.coin_transactions
  where wallet_id is not null and direction = 'debit' and status = 'completed'
  group by wallet_id
)
select
  'block_03b_coin_reconstructed_balance' as block,
  left(cw.user_id::text, 8) || '...' || right(cw.user_id::text, 4) as user_ref,
  left(cw.id::text, 8) || '...' || right(cw.id::text, 4) as wallet_ref,
  coalesce(c.credit_sum, 0) as credit_sum,
  coalesce(d.debit_sum, 0) as debit_sum,
  coalesce(c.credit_sum, 0) - coalesce(d.debit_sum, 0) as calculated_balance,
  cw.balance as stored_balance,
  coalesce(cw.balance, 0) - (coalesce(c.credit_sum, 0) - coalesce(d.debit_sum, 0)) as stored_minus_calculated
from public.coin_wallets cw
left join coin_credits c on c.wallet_id = cw.id
left join coin_debits d on d.wallet_id = cw.id
order by abs(coalesce(cw.balance, 0) - (coalesce(c.credit_sum, 0) - coalesce(d.debit_sum, 0))) desc,
  cw.created_at desc
limit 100;

-- BLOCK 04: observed transaction types and amount ranges.
select
  'block_04a_legacy_transaction_types' as block,
  transaction_type,
  status,
  count(*) as rows_count,
  min(amount) as min_amount,
  max(amount) as max_amount,
  count(distinct amount) as distinct_amounts
from public.token_transactions
group by transaction_type, status
order by rows_count desc, transaction_type;

select
  'block_04b_coin_transaction_types' as block,
  transaction_type,
  direction,
  status,
  count(*) as rows_count,
  min(amount) as min_amount,
  max(amount) as max_amount,
  count(distinct amount) as distinct_amounts
from public.coin_transactions
group by transaction_type, direction, status
order by rows_count desc, transaction_type;

-- BLOCK 04C: anonymized transaction timeline for users in both wallet systems.
with
both_wallet_users as (
  select distinct w.user_id
  from public.wallets w
  join public.coin_wallets cw on cw.user_id = w.user_id
  where w.user_id is not null
),
legacy_timeline as (
  select
    bwu.user_id,
    'legacy' as wallet_system,
    tt.id as transaction_id,
    tt.transaction_type,
    case
      when fw.user_id = bwu.user_id and tw.user_id = bwu.user_id then 'internal'
      when tw.user_id = bwu.user_id then 'credit'
      when fw.user_id = bwu.user_id then 'debit'
      else 'unknown'
    end as direction,
    tt.amount,
    tt.status,
    tt.created_at
  from both_wallet_users bwu
  join public.wallets w on w.user_id = bwu.user_id
  join public.token_transactions tt on tt.from_wallet_id = w.id or tt.to_wallet_id = w.id
  left join public.wallets fw on fw.id = tt.from_wallet_id
  left join public.wallets tw on tw.id = tt.to_wallet_id
),
coin_timeline as (
  select
    bwu.user_id,
    'coin' as wallet_system,
    ct.id as transaction_id,
    ct.transaction_type,
    ct.direction,
    ct.amount,
    ct.status,
    ct.created_at
  from both_wallet_users bwu
  join public.coin_transactions ct on ct.user_id = bwu.user_id
)
select
  'block_04c_anonymized_transaction_timeline' as block,
  left(user_id::text, 8) || '...' || right(user_id::text, 4) as user_ref,
  wallet_system,
  left(transaction_id::text, 8) || '...' || right(transaction_id::text, 4) as transaction_ref,
  transaction_type,
  direction,
  amount,
  status,
  created_at
from (
  select * from legacy_timeline
  union all
  select * from coin_timeline
) timeline
order by user_ref, created_at asc, wallet_system
limit 100;

-- BLOCK 05: possible double credits between legacy token ledger and coin ledger.
with
legacy_credits as (
  select
    tt.id,
    w.user_id,
    tt.amount,
    tt.transaction_type,
    tt.created_at,
    coalesce(
      nullif(tt.metadata ->> 'stripe_checkout_session_id', ''),
      nullif(tt.metadata ->> 'checkout_session_id', ''),
      nullif(tt.metadata ->> 'stripe_payment_intent_id', ''),
      nullif(tt.metadata ->> 'payment_intent_id', ''),
      nullif(tt.metadata ->> 'manual_order_id', ''),
      nullif(tt.metadata ->> 'order_id', ''),
      nullif(tt.metadata ->> 'external_reference', '')
    ) as external_ref
  from public.token_transactions tt
  join public.wallets w on w.id = tt.to_wallet_id
  where tt.status in ('completed', 'approved')
),
coin_credits as (
  select
    ct.id,
    ct.user_id,
    ct.amount,
    ct.transaction_type,
    ct.created_at,
    coalesce(
      nullif(ct.metadata ->> 'stripe_checkout_session_id', ''),
      nullif(ct.metadata ->> 'checkout_session_id', ''),
      nullif(ct.metadata ->> 'stripe_payment_intent_id', ''),
      nullif(ct.metadata ->> 'payment_intent_id', ''),
      nullif(ct.metadata ->> 'manual_order_id', ''),
      nullif(ct.metadata ->> 'order_id', ''),
      nullif(ct.metadata ->> 'external_reference', '')
    ) as external_ref
  from public.coin_transactions ct
  where ct.direction = 'credit' and ct.status = 'completed'
)
select
  'block_05_possible_double_credits' as block,
  left(l.user_id::text, 8) || '...' || right(l.user_id::text, 4) as user_ref,
  left(l.id::text, 8) || '...' || right(l.id::text, 4) as legacy_transaction_ref,
  left(c.id::text, 8) || '...' || right(c.id::text, 4) as coin_transaction_ref,
  l.amount as legacy_amount,
  c.amount as coin_amount,
  l.transaction_type as legacy_type,
  c.transaction_type as coin_type,
  case when l.external_ref is null then null else left(md5(l.external_ref), 12) end as external_ref_hash,
  l.created_at as legacy_created_at,
  c.created_at as coin_created_at,
  case
    when l.external_ref is not null and l.external_ref = c.external_ref then 'same_external_reference_hash'
    when l.amount = c.amount and abs(extract(epoch from (l.created_at - c.created_at))) <= 600 then 'same_amount_within_10_minutes'
    else 'same_user_credit_candidate'
  end as candidate_reason
from legacy_credits l
join coin_credits c on c.user_id = l.user_id
where (
  l.external_ref is not null and l.external_ref = c.external_ref
) or (
  l.amount = c.amount and abs(extract(epoch from (l.created_at - c.created_at))) <= 600
)
order by greatest(l.created_at, c.created_at) desc
limit 100;

-- BLOCK 06: activation bonus and referral anomalies.
with
legacy_bonus as (
  select
    w.user_id,
    string_agg(distinct tt.transaction_type, ', ' order by tt.transaction_type) as legacy_bonus_types,
    count(*) as legacy_bonus_count,
    sum(tt.amount) as legacy_bonus_sum,
    min(tt.created_at) as legacy_first_bonus_at,
    max(tt.created_at) as legacy_last_bonus_at
  from public.token_transactions tt
  join public.wallets w on w.id = tt.to_wallet_id
  where tt.transaction_type in ('activation_bonus_correction', 'welcome_bonus', 'client_activation_bonus', 'premium_activation_bonus')
    and tt.status in ('completed', 'approved')
  group by w.user_id
),
coin_bonus as (
  select
    user_id,
    string_agg(distinct transaction_type, ', ' order by transaction_type) as coin_bonus_types,
    count(*) as coin_bonus_count,
    sum(abs(amount)) as coin_bonus_sum,
    min(created_at) as coin_first_bonus_at,
    max(created_at) as coin_last_bonus_at
  from public.coin_transactions
  where transaction_type in ('activation_bonus_correction', 'welcome_bonus', 'client_activation_bonus', 'premium_activation_bonus')
    and direction = 'credit'
    and status = 'completed'
  group by user_id
),
bonus_users as (
  select user_id from legacy_bonus
  union
  select user_id from coin_bonus
)
select
  'block_06a_activation_bonus_anomalies' as block,
  left(bu.user_id::text, 8) || '...' || right(bu.user_id::text, 4) as user_ref,
  lb.legacy_bonus_types,
  coalesce(lb.legacy_bonus_count, 0) as legacy_bonus_count,
  coalesce(lb.legacy_bonus_sum, 0) as legacy_bonus_sum,
  lb.legacy_first_bonus_at,
  lb.legacy_last_bonus_at,
  cb.coin_bonus_types,
  coalesce(cb.coin_bonus_count, 0) as coin_bonus_count,
  coalesce(cb.coin_bonus_sum, 0) as coin_bonus_sum,
  cb.coin_first_bonus_at,
  cb.coin_last_bonus_at,
  case
    when lb.user_id is not null and cb.user_id is not null
    then abs(extract(epoch from (lb.legacy_first_bonus_at - cb.coin_first_bonus_at)))::bigint
    else null
  end as seconds_between_system_bonus,
  case
    when coalesce(lb.legacy_bonus_count, 0) > 1 or coalesce(cb.coin_bonus_count, 0) > 1 then 'multiple_bonus_same_system'
    when lb.user_id is not null and cb.user_id is not null
      and (
        lb.legacy_bonus_types like '%activation_bonus_correction%'
        or cb.coin_bonus_types like '%welcome_bonus%'
        or abs(extract(epoch from (lb.legacy_first_bonus_at - cb.coin_first_bonus_at))) <= 2592000
      ) then 'possible_migration_replacement'
    when lb.user_id is not null and cb.user_id is not null
      and coalesce(lb.legacy_bonus_sum, 0) <> coalesce(cb.coin_bonus_sum, 0) then 'different_bonus_values'
    when lb.user_id is not null and cb.user_id is not null then 'bonus_in_both_systems_same_user'
    else 'single_bonus_observed'
  end as finding
from bonus_users bu
left join legacy_bonus lb on lb.user_id = bu.user_id
left join coin_bonus cb on cb.user_id = bu.user_id
order by user_ref
limit 100;

select
  'block_06b_referral_reward_anomalies' as block,
  left(cr.user_id::text, 8) || '...' || right(cr.user_id::text, 4) as rewarded_user_ref,
  left(cr.referred_user_id::text, 8) || '...' || right(cr.referred_user_id::text, 4) as referred_user_ref,
  cr.reward_type,
  cr.coins,
  cr.status,
  ca.state as referred_activation_state,
  cr.created_at,
  case
    when cr.user_id = cr.referred_user_id then 'self_referral'
    when ca.state is distinct from 'client_activated' then 'reward_without_client_activated'
    when cr.coins is distinct from 5 then 'different_current_reward_value'
    else 'review'
  end as finding
from public.client_rewards cr
left join public.client_activations ca on ca.user_id = cr.referred_user_id
where cr.user_id = cr.referred_user_id
   or ca.state is distinct from 'client_activated'
   or cr.coins is distinct from 5
order by cr.created_at desc
limit 100;

select
  'block_06c_duplicate_referral_rewards' as block,
  left(referred_user_id::text, 8) || '...' || right(referred_user_id::text, 4) as referred_user_ref,
  reward_type,
  status,
  count(*) as reward_rows,
  min(coins) as min_reward,
  max(coins) as max_reward
from public.client_rewards
where referred_user_id is not null
group by referred_user_id, reward_type, status
having count(*) > 1 or min(coins) is distinct from max(coins)
order by reward_rows desc
limit 100;

-- BLOCK 07: favorites and gifts.
with
favorite_charges as (
  select
    tt.id,
    w.user_id as client_id,
    case
      when (tt.metadata ->> 'profile_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (tt.metadata ->> 'profile_id')::uuid
      else null
    end as profile_id,
    tt.amount,
    tt.created_at
  from public.token_transactions tt
  join public.wallets w on w.id = tt.from_wallet_id
  where tt.transaction_type = 'favorite_profile'
    and tt.status in ('completed', 'approved')
),
favorite_pairs as (
  select client_id, profile_id, count(*) as favorite_rows
  from public.client_favorites
  group by client_id, profile_id
),
charge_pairs as (
  select client_id, profile_id, count(*) as charge_rows, sum(amount) as charged_total, min(amount) as min_charge, max(amount) as max_charge
  from favorite_charges
  where profile_id is not null
  group by client_id, profile_id
)
select
  'block_07a_favorite_charge_anomalies' as block,
  left(coalesce(fp.client_id, cp.client_id)::text, 8) || '...' || right(coalesce(fp.client_id, cp.client_id)::text, 4) as client_ref,
  left(coalesce(fp.profile_id, cp.profile_id)::text, 8) || '...' || right(coalesce(fp.profile_id, cp.profile_id)::text, 4) as profile_ref,
  coalesce(fp.favorite_rows, 0) as favorite_rows,
  coalesce(cp.charge_rows, 0) as charge_rows,
  coalesce(cp.charged_total, 0) as charged_total,
  cp.min_charge,
  cp.max_charge,
  case
    when coalesce(cp.charge_rows, 0) > 1 then 'multiple_paid_additions_same_pair'
    when fp.client_id is null then 'charge_without_current_favorite'
    when cp.client_id is null then 'favorite_without_charge'
    when cp.min_charge is distinct from cp.max_charge then 'different_favorite_prices'
    when cp.min_charge is distinct from 1 then 'favorite_price_not_current_config_1'
    else 'review'
  end as finding
from favorite_pairs fp
full join charge_pairs cp on cp.client_id = fp.client_id and cp.profile_id = fp.profile_id
where coalesce(cp.charge_rows, 0) <> 1
   or coalesce(fp.favorite_rows, 0) <> 1
   or cp.min_charge is distinct from cp.max_charge
   or cp.min_charge is distinct from 1
order by charge_rows desc, favorite_rows desc
limit 100;

select
  'block_07b_gift_anomalies' as block,
  left(g.sender_user_id::text, 8) || '...' || right(g.sender_user_id::text, 4) as sender_ref,
  left(g.receiver_profile_id::text, 8) || '...' || right(g.receiver_profile_id::text, 4) as receiver_profile_ref,
  left(g.receiver_user_id::text, 8) || '...' || right(g.receiver_user_id::text, 4) as receiver_user_ref,
  g.gift_type,
  g.coin_cost,
  g.status,
  g.created_at,
  case
    when g.receiver_profile_id is null and g.receiver_user_id is null then 'gift_without_receiver'
    when not exists (
      select 1 from public.coin_transactions ct
      where ct.user_id = g.sender_user_id
        and ct.transaction_type = 'gift_sent'
        and ct.direction = 'debit'
        and abs(ct.amount) = g.coin_cost
        and abs(extract(epoch from (ct.created_at - g.created_at))) <= 600
    ) then 'gift_without_matching_sender_debit'
    when g.receiver_user_id is not null and not exists (
      select 1 from public.coin_transactions ct
      where ct.user_id = g.receiver_user_id
        and ct.direction = 'credit'
        and abs(ct.amount) = g.coin_cost
        and abs(extract(epoch from (ct.created_at - g.created_at))) <= 600
    ) then 'gift_without_receiver_credit_candidate'
    else 'review'
  end as finding
from public.gifts g
where g.receiver_profile_id is null
   or g.receiver_user_id is null
   or not exists (
      select 1 from public.coin_transactions ct
      where ct.user_id = g.sender_user_id
        and ct.transaction_type = 'gift_sent'
        and ct.direction = 'debit'
        and abs(ct.amount) = g.coin_cost
        and abs(extract(epoch from (ct.created_at - g.created_at))) <= 600
   )
   or (
      g.receiver_user_id is not null
      and not exists (
        select 1 from public.coin_transactions ct
        where ct.user_id = g.receiver_user_id
          and ct.direction = 'credit'
          and abs(ct.amount) = g.coin_cost
          and abs(extract(epoch from (ct.created_at - g.created_at))) <= 600
      )
   )
order by g.created_at desc
limit 100;

-- BLOCK 08: subscriptions and payment source aggregates.
select
  'block_08a_subscription_anomalies' as block,
  left(s.user_id::text, 8) || '...' || right(s.user_id::text, 4) as user_ref,
  left(s.profile_id::text, 8) || '...' || right(s.profile_id::text, 4) as profile_ref,
  s.plan,
  s.status,
  s.provider,
  s.amount_eur,
  s.amount_cents,
  s.current_period_start,
  s.current_period_end,
  case when coalesce(s.external_subscription_id, s.stripe_subscription_id) is null then null else 'present' end as external_reference_present,
  s.created_at,
  case
    when s.status = 'active' and s.current_period_start is null then 'active_without_period_start'
    when s.status = 'active' and s.current_period_end is null then 'active_without_period_end'
    when s.current_period_end < s.current_period_start then 'period_end_before_start'
    when s.status = 'active' and s.provider is null then 'active_without_provider'
    else 'review'
  end as finding
from public.subscriptions s
where (s.status = 'active' and (s.current_period_start is null or s.current_period_end is null or s.provider is null))
   or s.current_period_end < s.current_period_start
order by s.created_at desc
limit 100;

select
  'block_08b_multiple_active_subscriptions' as block,
  left(user_id::text, 8) || '...' || right(user_id::text, 4) as user_ref,
  plan,
  count(*) as active_rows,
  min(current_period_start) as first_start,
  max(current_period_end) as last_end
from public.subscriptions
where status = 'active'
group by user_id, plan
having count(*) > 1
order by active_rows desc
limit 100;

select
  'block_08c_subscription_payment_sources' as block,
  source,
  plan_or_purpose,
  provider,
  count(*) as rows_count,
  min(amount_eur) as min_amount_eur,
  max(amount_eur) as max_amount_eur,
  min(created_at) as first_seen_at,
  max(created_at) as last_seen_at
from (
  select 'subscriptions' as source, plan as plan_or_purpose, provider, amount_eur, created_at
  from public.subscriptions
  union all
  select 'manual_payment_orders' as source, purpose as plan_or_purpose, provider, amount_eur, created_at
  from public.manual_payment_orders
  where purpose in ('advertiser_subscription', 'agency_subscription')
  union all
  select 'stripe_payment_events' as source, coalesce(plan, transaction_type) as plan_or_purpose, provider, amount_eur, created_at
  from public.stripe_payment_events
  where transaction_type in ('escort_subscription', 'business_subscription')
) payment_sources
group by source, plan_or_purpose, provider
order by source, rows_count desc;

-- BLOCK 09: general wallet and transaction anomalies.
select
  'block_09a_wallet_anomalies' as block,
  system_name,
  left(user_id::text, 8) || '...' || right(user_id::text, 4) as user_ref,
  left(wallet_id::text, 8) || '...' || right(wallet_id::text, 4) as wallet_ref,
  balance,
  created_at,
  finding
from (
  select
    'legacy_wallets' as system_name,
    user_id,
    id as wallet_id,
    escort_token_balance as balance,
    created_at,
    case
      when user_id is null then 'wallet_without_user'
      when escort_token_balance is null then 'null_balance'
      when escort_token_balance < 0 then 'negative_balance'
      when escort_token_balance <> round(escort_token_balance, 4) then 'more_than_4_decimal_places'
      else null
    end as finding
  from public.wallets
  union all
  select
    'coin_wallets' as system_name,
    user_id,
    id as wallet_id,
    balance,
    created_at,
    case
      when user_id is null then 'wallet_without_user'
      when balance is null then 'null_balance'
      when balance < 0 then 'negative_balance'
      when balance <> round(balance, 4) then 'more_than_4_decimal_places'
      else null
    end as finding
  from public.coin_wallets
) anomalies
where finding is not null
order by system_name, created_at desc
limit 100;

select
  'block_09b_transactions_without_wallets' as block,
  system_name,
  left(transaction_id::text, 8) || '...' || right(transaction_id::text, 4) as transaction_ref,
  left(user_id::text, 8) || '...' || right(user_id::text, 4) as user_ref,
  transaction_type,
  amount,
  created_at,
  finding
from (
  select
    'legacy_token_transactions' as system_name,
    tt.id as transaction_id,
    coalesce(fw.user_id, tw.user_id) as user_id,
    tt.transaction_type,
    tt.amount,
    tt.created_at,
    case
      when tt.from_wallet_id is not null and fw.id is null then 'missing_from_wallet'
      when tt.to_wallet_id is not null and tw.id is null then 'missing_to_wallet'
      when tt.from_wallet_id is null and tt.to_wallet_id is null then 'no_wallet_side'
      else null
    end as finding
  from public.token_transactions tt
  left join public.wallets fw on fw.id = tt.from_wallet_id
  left join public.wallets tw on tw.id = tt.to_wallet_id
  union all
  select
    'coin_transactions' as system_name,
    ct.id as transaction_id,
    ct.user_id,
    ct.transaction_type,
    ct.amount,
    ct.created_at,
    case when cw.id is null then 'missing_coin_wallet' else null end as finding
  from public.coin_transactions ct
  left join public.coin_wallets cw on cw.id = ct.wallet_id
) tx_anomalies
where finding is not null
order by created_at desc
limit 100;

select
  'block_09c_unknown_transaction_types' as block,
  system_name,
  transaction_type,
  count(*) as rows_count,
  min(created_at) as first_seen_at,
  max(created_at) as last_seen_at
from (
  select 'legacy_token_transactions' as system_name, transaction_type, created_at
  from public.token_transactions
  where transaction_type not in (
    'client_activation_bonus', 'premium_activation_bonus', 'manual_payment_tokens', 'stripe_coins_purchase',
    'coins_purchase', 'favorite_profile', 'premium_unlock', 'admin_token_credit', 'admin_token_debit'
  )
  union all
  select 'coin_transactions' as system_name, transaction_type, created_at
  from public.coin_transactions
  where transaction_type not in (
    'coins_purchase', 'gift_sent', 'vip_gallery_unlock', 'referral_activation_reward',
    'admin_credit', 'admin_debit', 'client_activation_bonus', 'premium_activation_bonus'
  )
) unknown_types
group by system_name, transaction_type
order by rows_count desc, system_name, transaction_type;

-- BLOCK 10: unit map derived from current schema/code naming.
select *
from (
  values
    ('wallets.escort_token_balance', 'legacy numeric token/BC Coins display unit', 'favorite RPC current default cost 1', 'BCU bigint'),
    ('token_transactions.amount', 'legacy numeric token/BC Coins display unit', 'favorite_profile amount 1', 'BCU bigint ledger amount'),
    ('token_packages.token_amount', 'integer package display amount', '66, 166, 666, 1200, 2560, 5200, 10200', 'keep package display amount, convert to BCU at credit time'),
    ('coin_wallets.balance', 'numeric coins unit', 'gift/vip/referral amounts from code/config', 'BCU bigint'),
    ('coin_transactions.amount', 'numeric amount with separate direction', 'gift_sent debit, referral credit', 'BCU bigint ledger amount'),
    ('gifts.coin_cost', 'numeric coins unit supplied by API request', '10 from frontend default', 'BCU bigint server-priced action'),
    ('client_rewards.coins', 'numeric coins unit', '5 currently configured in code', '100000 BCU'),
    ('client_favorites cost', 'legacy token RPC p_cost numeric', '1 current RPC/backend constant', '50000 BCU'),
    ('subscriptions.amount_eur', 'EUR numeric', '49.99 legacy advertiser monthly', 'not wallet unit; subscription debit should be BCU'),
    ('manual_payment_orders.tokens_amount', 'integer package coins/tokens amount', 'token package purchased manually', 'convert to BCU at wallet credit time')
) as unit_map(area, current_unit_from_schema_or_code, example, target_unit);
