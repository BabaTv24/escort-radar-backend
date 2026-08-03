import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('advertiser wallet is session-bound and returns backend-computed BC values', async () => {
  const [route, service, api] = await Promise.all([
    read('../Back/src/routes/bcu.ts'),
    read('../Back/src/services/bcuWallet.ts'),
    read('../Front/src/lib/api.ts')
  ]);
  assert.match(route, /bcuRouter\.use\(verifyUser\)/);
  assert.match(route, /getOrCreateBcuWalletForUser\(req\.user!\.id\)/);
  assert.match(route, /available_balance_bc: bcuToBc\(availableBalanceBcu\)/);
  assert.doesNotMatch(route, /req\.(?:body|query|params)\.user_id/);
  assert.match(service, /\.eq\('user_id', userId\)/);
  assert.match(api, /bcuWallet: \(token: string\)[\s\S]*'\/api\/bcu\/wallet'/);
});

test('advertiser wallet UI covers loading error retry empty locked balance and safe history', async () => {
  const source = await read('../Front/src/components/advertiser-dashboard/AdvertiserWalletSection.tsx');
  for (const contract of [
    "setStatus('loading')",
    "setStatus('error')",
    "status === 'success' && !wallet",
    'advertiserDashboard.retry',
    'available_balance_bc',
    'locked_balance_bc',
    'api.bcuLedger(token)'
  ]) assert.match(source, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(source, /balance_bcu\s*[-+*/]/);
  assert.doesNotMatch(source, /user_id|userId/);
});

test('personal referral endpoint is stable private canonical and contains no email', async () => {
  const route = await read('../Back/src/routes/referrals.ts');
  const handler = route.slice(route.indexOf("get('/me"), route.indexOf('export const adminReferralsRouter'));
  assert.match(handler, /get\('\/me', verifyUser/);
  assert.match(handler, /p_user_id: req\.user!\.id/);
  assert.match(handler, /https:\/\/escort-radar\.fun\/register\?ref=/);
  assert.match(handler, /encodeURIComponent\(referral\.referral_code\)/);
  assert.doesNotMatch(handler, /req\.(?:body|query|params)\.user_id|email/);
});

test('advertiser QR uses the exact personal link locally and supports PNG download', async () => {
  const source = await read('../Front/src/components/advertiser-dashboard/AdvertiserReferralSection.tsx');
  assert.match(source, /QRCode\.toDataURL\(result\.referralLink/);
  assert.match(source, /setReferral\(result\)/);
  assert.match(source, /margin: 4/);
  assert.match(source, /light: '#ffffff'/);
  assert.match(source, /download=\{qrFileName\}/);
  assert.match(source, /escort-radar-referral-qr\.png/);
  assert.doesNotMatch(source, /qrserver|googleapis|userEmail|email/);
});

test('copy action uses Clipboard API with a local fallback and confirmation state', async () => {
  const [clipboard, referral] = await Promise.all([
    read('../Front/src/lib/clipboard.ts'),
    read('../Front/src/components/advertiser-dashboard/AdvertiserReferralSection.tsx')
  ]);
  assert.match(clipboard, /navigator\.clipboard\?\.writeText/);
  assert.match(clipboard, /document\.createElement\('textarea'\)/);
  assert.match(clipboard, /document\.execCommand\('copy'\)/);
  assert.match(referral, /copyTextWithFallback\(referral\.referralLink\)/);
  assert.match(referral, /setCopied\(true\)/);
});

test('stage-three sections replace only wallet and referral placeholders', async () => {
  const dashboard = await read('../Front/src/pages/DashboardPage.tsx');
  assert.match(dashboard, /activeSection === 'wallet'[\s\S]*AdvertiserWalletSection/);
  assert.match(dashboard, /activeSection === 'referrals'[\s\S]*AdvertiserReferralSection/);
  assert.match(dashboard, /!\['overview', 'profile', 'location', 'wallet', 'referrals', 'settings'\]\.includes\(activeSection\)/);
  assert.match(dashboard, /activeSection === 'location'[\s\S]*AdvertiserLocationSection/);
});

test('stage-three translations exist in every supported locale', async () => {
  const keys = [
    'advertiserDashboard.wallet.available',
    'advertiserDashboard.wallet.locked',
    'advertiserDashboard.wallet.error',
    'advertiserDashboard.referral.copy',
    'advertiserDashboard.referral.copied',
    'advertiserDashboard.referral.download',
    'advertiserDashboard.referral.qrHint'
  ];
  for (const language of ['pl', 'en', 'de']) {
    const messages = JSON.parse(await read(`../Front/src/locales/${language}.json`));
    for (const key of keys) assert.equal(typeof messages[key], 'string', `${language}:${key}`);
  }
});
