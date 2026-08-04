import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { calculateAvailableBcu, hasSufficientAvailableBcu } from '../Back/src/services/communicationPlus.ts';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('Communication Plus API is authenticated, client-only and server-priced', async () => {
  const [route, service] = await Promise.all([
    read('Back/src/routes/bcu.ts'),
    read('Back/src/services/bcuWallet.ts')
  ]);

  assert.match(route, /bcuRouter\.use\(verifyUser\)/);
  assert.match(route, /get\('\/communication-plus', requireAccountType\('client'\)/);
  assert.match(route, /post\('\/communication-plus\/purchase', requireAccountType\('client'\)/);
  assert.match(route, /req\.user!\.id/);
  assert.doesNotMatch(route, /req\.body\?\.(?:price|amount_bcu|user_id|premium)/);
  assert.match(service, /rpc\('purchase_communication_plus'/);
});

test('status exposes only own Premium, entitlement, server price and available balance facts', async () => {
  const route = await read('Back/src/routes/bcu.ts');
  const statusHandler = route.slice(route.indexOf("bcuRouter.get('/communication-plus'"), route.indexOf("bcuRouter.post('/communication-plus/purchase'"));

  for (const field of [
    'client_premium_active', 'communication_plus_active', 'price_bcu', 'price_bc',
    'available_balance_bcu', 'available_balance_bc', 'sufficient_balance'
  ]) assert.match(statusHandler, new RegExp(field));
  assert.match(statusHandler, /calculateAvailableBcu\(balanceBcu, lockedBalanceBcu\)/);
  assert.doesNotMatch(statusHandler, /user_id\s*:/);
});

test('99 BC fails, 100 BC succeeds and locked BC is never available', () => {
  assert.equal(hasSufficientAvailableBcu('990000', '0', '1000000'), false);
  assert.equal(hasSufficientAvailableBcu('1000000', '0', '1000000'), true);
  assert.equal(calculateAvailableBcu('1500000', '600000'), '900000');
  assert.equal(hasSufficientAvailableBcu('1500000', '600000', '1000000'), false);
  assert.throws(() => calculateAvailableBcu('1', '2'));
});

test('atomic SQL charges exactly 100 BC from available balance and creates ledger plus entitlement', async () => {
  const sql = await read('supabase/migrations/055_communication_plus_atomic_purchase.sql');

  assert.match(sql, /v_product\.amount_bcu <> 1000000/);
  assert.match(sql, /has_active_user_entitlement\(p_user_id, 'client_premium'\)/);
  assert.match(sql, /balance_bcu - v_wallet\.locked_balance_bcu/);
  assert.match(sql, /BCU_INSUFFICIENT_AVAILABLE_BALANCE/);
  assert.match(sql, /public\.apply_bcu_ledger_entry\(/);
  assert.match(sql, /'bcu_product_communication_plus'/);
  assert.match(sql, /insert into public\.user_entitlements/);
  assert.match(sql, /source_reference_id[\s\S]*v_ledger\.id/);
  assert.doesNotMatch(sql, /(?:real|double precision|float)/i);
});

test('paid-once and retry behavior is serialized and idempotent', async () => {
  const sql = await read('supabase/migrations/055_communication_plus_atomic_purchase.sql');

  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /entitlement_type = 'communication_plus'[\s\S]*status = 'active'[\s\S]*ends_at is null/);
  assert.match(sql, /'charged', false/);
  assert.match(sql, /'communication-plus:' \|\| p_user_id::text \|\| ':' \|\| trim\(p_idempotency_key\)/);
  assert.match(sql, /for update/);
  assert.doesNotMatch(sql, /exception\s+when[\s\S]*return/i);
});

test('client payload cannot lower the server price to zero or one', async () => {
  const [api, sql] = await Promise.all([
    read('Front/src/lib/api.ts'),
    read('supabase/migrations/055_communication_plus_atomic_purchase.sql')
  ]);
  const apiMethod = api.slice(api.indexOf('purchaseCommunicationPlus:'), api.indexOf('tokenPurchaseIntent:'));

  const requestBody = apiMethod.match(/body: JSON\.stringify\(([^\n]+)\)/)?.[1] || '';
  assert.equal(requestBody, '{ idempotency_key: idempotencyKey }');
  assert.doesNotMatch(requestBody, /price|amount_bcu|amount_bc/);
  assert.match(sql, /where product_code = 'communication_plus' and active = true/);
  assert.match(sql, /v_product\.amount_bcu <> 1000000/);
});

test('dashboard covers lock, insufficient, purchasable, loading, error and active states', async () => {
  const [card, dashboard] = await Promise.all([
    read('Front/src/components/CommunicationPlusCard.tsx'),
    read('Front/src/pages/DashboardPage.tsx')
  ]);

  for (const marker of [
    "state === 'loading'", "state === 'error'", 'communication_plus_active',
    'client_premium_active', 'sufficient_balance', 'purchasing'
  ]) assert.match(card, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(card, /to="\/pricing\?product=client_activation"/);
  assert.match(card, /to="\/coins"/);
  assert.match(dashboard, /communicationPlusRequestRef\.current/);
  assert.match(dashboard, /await loadClientDashboard\(token\)/);
  assert.match(dashboard, /communicationPlusIdempotencyRef\.current = idempotencyKey/);
});

test('Communication Plus locale keys are identical in PL, DE and EN', async () => {
  const locales = await Promise.all(['pl', 'de', 'en'].map(async (locale) => JSON.parse(await read(`Front/src/locales/${locale}.json`)) as Record<string, string>));
  const keys = locales.map((locale) => Object.keys(locale).filter((key) => key.startsWith('communicationPlus.')).sort());

  assert.ok(keys[0].length >= 20);
  assert.deepEqual(keys[1], keys[0]);
  assert.deepEqual(keys[2], keys[0]);
});
