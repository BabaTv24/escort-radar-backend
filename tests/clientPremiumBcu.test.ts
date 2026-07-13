import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  runClientPremiumBcuActivation,
  selectClientPremiumWalletFlow,
  type ClientPremiumBcuResult
} from '../Back/src/services/clientPremiumBcuFlow.ts';

type FailureMode = 'none' | 'before_commit' | 'after_commit';

function createAtomicHarness(options: { failureMode?: FailureMode; referral?: 'valid' | 'missing' | 'self' } = {}) {
  let walletCreates = 0;
  let bonusCredits = 0;
  let entitlementCreates = 0;
  let referralCredits = 0;
  let clientRewardCreates = 0;
  let committed: ClientPremiumBcuResult | null = null;
  let failurePending = options.failureMode !== 'none' && Boolean(options.failureMode);

  const result = (): ClientPremiumBcuResult => ({
    wallet: {
      public_wallet_id: 'BCU-TEST', balance_bcu: '70000', lifetime_credit_bcu: '70000', lifetime_debit_bcu: '0',
      frozen: false, created_at: '2026-07-11T00:00:00.000Z', updated_at: '2026-07-11T00:00:00.000Z'
    },
    bonus: {
      amount_bcu: '70000', direction: 'credit', transaction_type: 'bcu_product_premium_activation_bonus',
      status: 'completed', created_at: '2026-07-11T00:00:00.000Z'
    },
    entitlement: {
      entitlement_type: 'client_premium', status: 'active', starts_at: '2026-07-11T00:00:00.000Z',
      ends_at: null, product_code: 'premium_activation_bonus'
    },
    referral_granted: options.referral === undefined || options.referral === 'valid'
  });

  return {
    dependencies: {
      async activatePremium() {
        if (failurePending && options.failureMode === 'before_commit') {
          failurePending = false;
          throw new Error('transaction rolled back before commit');
        }
        if (!committed) {
          walletCreates += 1;
          bonusCredits += 1;
          entitlementCreates += 1;
          if (options.referral === undefined || options.referral === 'valid') {
            referralCredits += 1;
            clientRewardCreates += 1;
          }
          committed = result();
        }
        if (failurePending && options.failureMode === 'after_commit') {
          failurePending = false;
          throw new Error('response lost after commit');
        }
        return committed;
      }
    },
    counts: () => ({ walletCreates, bonusCredits, entitlementCreates, referralCredits, clientRewardCreates })
  };
}

const input = { userId: 'user-1', activationId: 'activation-1', referredByCode: 'ER-REF' };

test('Premium bonus and entitlement are returned by one atomic dependency', async () => {
  const harness = createAtomicHarness();
  const result = await runClientPremiumBcuActivation(input, harness.dependencies);
  assert.equal(result.bonus.amount_bcu, '70000');
  assert.equal(result.entitlement.entitlement_type, 'client_premium');
  assert.deepEqual(harness.counts(), { walletCreates: 1, bonusCredits: 1, entitlementCreates: 1, referralCredits: 1, clientRewardCreates: 1 });
});

test('Retry after rollback before entitlement creates one complete activation', async () => {
  const harness = createAtomicHarness({ failureMode: 'before_commit' });
  await assert.rejects(runClientPremiumBcuActivation(input, harness.dependencies));
  await runClientPremiumBcuActivation(input, harness.dependencies);
  assert.deepEqual(harness.counts(), { walletCreates: 1, bonusCredits: 1, entitlementCreates: 1, referralCredits: 1, clientRewardCreates: 1 });
});

test('Retry after commit before response returns existing activation', async () => {
  const harness = createAtomicHarness({ failureMode: 'after_commit' });
  await assert.rejects(runClientPremiumBcuActivation(input, harness.dependencies));
  await runClientPremiumBcuActivation(input, harness.dependencies);
  assert.deepEqual(harness.counts(), { walletCreates: 1, bonusCredits: 1, entitlementCreates: 1, referralCredits: 1, clientRewardCreates: 1 });
});

test('Webhook confirm and concurrent retries create one wallet bonus entitlement and referral record', async () => {
  const harness = createAtomicHarness();
  await Promise.all(Array.from({ length: 6 }, () => runClientPremiumBcuActivation(input, harness.dependencies)));
  assert.deepEqual(harness.counts(), { walletCreates: 1, bonusCredits: 1, entitlementCreates: 1, referralCredits: 1, clientRewardCreates: 1 });
});

test('Missing referrer produces no financial or domain reward', async () => {
  const harness = createAtomicHarness({ referral: 'missing' });
  const result = await runClientPremiumBcuActivation({ ...input, referredByCode: null }, harness.dependencies);
  assert.equal(result.referral_granted, false);
  assert.equal(harness.counts().referralCredits, 0);
  assert.equal(harness.counts().clientRewardCreates, 0);
});

test('Self referral produces no financial or domain reward', async () => {
  const harness = createAtomicHarness({ referral: 'self' });
  const result = await runClientPremiumBcuActivation(input, harness.dependencies);
  assert.equal(result.referral_granted, false);
  assert.equal(harness.counts().referralCredits, 0);
  assert.equal(harness.counts().clientRewardCreates, 0);
});

test('Feature flag selects isolated legacy and BCU flows', () => {
  assert.equal(selectClientPremiumWalletFlow(false), 'legacy');
  assert.equal(selectClientPremiumWalletFlow(true), 'bcu');
});

test('Migration 045 secures atomic Premium and referral concurrency', async () => {
  const migration = await readFile(new URL('../supabase/migrations/045_client_premium_bcu_atomic.sql', import.meta.url), 'utf8');
  for (const contract of [
    'create or replace function public.activate_client_premium_bcu',
    'security definer',
    'set search_path = public',
    'pg_advisory_xact_lock',
    "'client-premium-bonus:' || p_user_id::text",
    "'client-premium-referral:' || p_user_id::text",
    'client_rewards_one_granted_activation_referral_idx',
    'on conflict (referred_user_id, reward_type)',
    'BCU_CLIENT_PREMIUM_ENTITLEMENT_CONFLICT',
    'BCU_CLIENT_PREMIUM_ACTIVATION_INVALID',
    'BCU_REFERRAL_REWARD_CONFLICT',
    'revoke execute on function public.activate_client_premium_bcu',
    'to service_role'
  ]) assert.ok(migration.toLowerCase().includes(contract.toLowerCase()), contract);
  assert.match(migration, /select \* into v_reward\r?\n\s+from public\.client_rewards/i);
  assert.match(migration, /v_bonus_product\.amount_bcu <> 70000/);
  assert.match(migration, /v_referral_product\.amount_bcu <> 100000/);
  assert.doesNotMatch(migration, /activate_bcu_product\s*\(/);
  assert.equal((migration.match(/'client-premium-bonus:' \|\| p_user_id::text/g) || []).length, 1);
  assert.equal((migration.match(/'client-premium-referral:' \|\| p_user_id::text/g) || []).length, 1);
});

test('Premium dashboard API is explicit sanitized and keeps legacy me contract', async () => {
  const route = await readFile(new URL('../Back/src/routes/clientActivation.ts', import.meta.url), 'utf8');
  const api = await readFile(new URL('../Front/src/lib/api.ts', import.meta.url), 'utf8');
  assert.match(route, /clientActivationRouter\.get\('\/dashboard'/);
  assert.match(api, /\/api\/client-activation\/dashboard/);
  assert.doesNotMatch(api, /dashboard=1/);
  assert.doesNotMatch(route, /return res\.json\(\{ activation, wallet_system: 'bcu', wallet, entitlements, ledger \}\)/);
  assert.match(route, /clientActivationRouter\.get\('\/me'[\s\S]*res\.json\(legacy\)/);
  assert.doesNotMatch(route, /metadata:\s*entry\.metadata/);
});

test('BCU activation branch does not call legacy credit services', async () => {
  const service = await readFile(new URL('../Back/src/services/clientActivation.ts', import.meta.url), 'utf8');
  assert.match(service, /if \(walletFlow === 'legacy'\) \{[\s\S]*adjustTokenWalletBalance[\s\S]*applyReferralReward/);
  assert.match(service, /walletFlow === 'bcu'[\s\S]*activateClientPremiumBcu/);
});
