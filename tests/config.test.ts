import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLIENT_PREMIUM_BONUS_BCU,
  CLIENT_PREMIUM_REFERRAL_BCU,
  selectClientPremiumWalletFlow
} from '../Back/src/services/clientPremiumBcuFlow.ts';

test('Premium client environment contract keeps new priority and legacy defaults', async () => {
  process.env.SUPABASE_URL ||= 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';
  process.env.SUPABASE_ANON_KEY ||= 'test-anon-key';

  const {
    resolveClientActivationWelcomeCoins,
    resolveClientReferralRewardCoins
  } = await import('../Back/src/config.ts');

  assert.equal(resolveClientActivationWelcomeCoins({
    CLIENT_ACTIVATION_WELCOME_COINS: '7',
    CLIENT_ACTIVATION_TOKEN_BONUS: '8'
  }), 7);
  assert.equal(resolveClientActivationWelcomeCoins({
    CLIENT_ACTIVATION_TOKEN_BONUS: '8'
  }), 8);
  assert.equal(resolveClientActivationWelcomeCoins({}), 7);
  assert.equal(resolveClientReferralRewardCoins({}), 10);
  assert.equal(resolveClientReferralRewardCoins({
    CLIENT_REFERRAL_REWARD_COINS: '12'
  }), 12);
});

test('Legacy false stays isolated and BCU true keeps authoritative product amounts', () => {
  assert.equal(selectClientPremiumWalletFlow(false), 'legacy');
  assert.equal(selectClientPremiumWalletFlow(true), 'bcu');
  assert.equal(CLIENT_PREMIUM_BONUS_BCU, '70000');
  assert.equal(CLIENT_PREMIUM_REFERRAL_BCU, '100000');
});
