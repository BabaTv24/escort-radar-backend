import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Placeholder env so the backend modules load; no network call is made by these tests.
process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role';
process.env.SUPABASE_ANON_KEY ||= 'test-anon';
const loadPayments = () => import('../Back/src/manualPayments.ts');
const loadAuth = () => import('../Back/src/middleware/auth.ts');

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');
const day = 24 * 60 * 60 * 1000;

test('only the two approved products are orderable, at the approved prices', async () => {
  const { CUSTOMER_ORDER_PRODUCT_IDS, CUSTOMER_PAYMENT_PROVIDERS, isCustomerOrderableProduct, manualPaymentProducts } = await loadPayments();
  assert.deepEqual([...CUSTOMER_ORDER_PRODUCT_IDS].sort(), ['advertiser_30d', 'client_activation']);
  const advertiser = manualPaymentProducts.find((product) => product.id === 'advertiser_30d');
  const client = manualPaymentProducts.find((product) => product.id === 'client_activation');
  assert.equal(advertiser?.amount_cents, 4999);
  assert.equal((advertiser as { days?: number })?.days, 30);
  assert.equal(client?.amount_cents, 99);
  for (const closed of ['agency_30d', 'bc_66', 'bc_166', 'bc_666']) assert.equal(isCustomerOrderableProduct(closed), false, closed);
  assert.deepEqual([...CUSTOMER_PAYMENT_PROVIDERS], ['bank_transfer']);
});

test('bank transfer is offered only with complete merchant data', async () => {
  const { isBankTransferConfigured } = await loadPayments();
  const full = { manualBankTransferEnabled: true, manualBankTransferRecipient: 'Merchant', manualBankTransferIban: 'DE89370400440532013000', legalOperatorName: 'Operator' };
  assert.equal(isBankTransferConfigured(full), true);
  assert.equal(isBankTransferConfigured({ ...full, manualBankTransferEnabled: false }), false);
  assert.equal(isBankTransferConfigured({ ...full, manualBankTransferIban: ' ' }), false);
  assert.equal(isBankTransferConfigured({ ...full, manualBankTransferRecipient: '' }), false);
  assert.equal(isBankTransferConfigured({ ...full, legalOperatorName: '' }), false);
});

test('renewal starts from the latest valid end date in any subscription field', async () => {
  const { subscriptionRenewalBase } = await loadPayments();
  const now = new Date('2026-11-12T12:00:00Z');
  assert.equal(subscriptionRenewalBase(null, now).toISOString(), now.toISOString());
  assert.equal(subscriptionRenewalBase({ premium_valid_until: '2026-11-01T00:00:00Z' }, now).toISOString(), now.toISOString(), 'expired end restarts today');
  assert.equal(subscriptionRenewalBase({ premium_valid_until: '2026-12-01T00:00:00Z' }, now).toISOString(), '2026-12-01T00:00:00.000Z');
  // Admin-granted subscription stored only in subscription_end is preserved.
  assert.equal(subscriptionRenewalBase({ premium_valid_until: null, subscription_end: '2027-02-20T00:00:00Z' }, now).toISOString(), '2027-02-20T00:00:00.000Z');
  assert.equal(subscriptionRenewalBase({ premium_valid_until: '2026-12-01T00:00:00Z', subscription_expires_at: '2027-01-05T00:00:00Z' }, now).toISOString(), '2027-01-05T00:00:00.000Z');
});

test('a paid advertiser subscription expires at its end date; accounts without one are unchanged', async () => {
  const { getAdvertiserAccess, isPaidSubscriptionExpired } = await loadAuth();
  const user = (metadata: Record<string, unknown>) => ({ id: 'u', email: 'a@example.test', app_metadata: { auth_account_type: 'escort', subscription_status: 'active', plan: 'escort_monthly', ...metadata } });
  assert.ok(getAdvertiserAccess(user({ subscription_expires_at: new Date(Date.now() + day).toISOString() })));
  assert.equal(getAdvertiserAccess(user({ subscription_expires_at: new Date(Date.now() - 1000).toISOString() })), null);
  assert.ok(getAdvertiserAccess(user({})), 'existing active accounts without an end date keep access');
  assert.equal(isPaidSubscriptionExpired(user({ subscription_expires_at: 'not-a-date' })), false);
});

test('revenue summary counts only admin-confirmed payments', async () => {
  const { summarizeManualPaymentOrders } = await loadPayments();
  const summary = summarizeManualPaymentOrders([
    { status: 'pending', amount_cents: 4999, applied_at: null },
    { status: 'paid', amount_cents: 4999, applied_at: '2026-11-12T00:00:00Z' },
    { status: 'paid', amount_cents: 99, applied_at: '2026-11-12T00:00:00Z' },
    { status: 'rejected', amount_cents: 99, applied_at: null },
    { status: 'cancelled', amount_cents: 4999, applied_at: null }
  ]);
  assert.deepEqual(summary, { created: 5, pending: 1, confirmed: 2, activated: 2, rejected: 1, cancelled: 1, pending_amount_eur: 49.99, received_revenue_eur: 50.98 });
});

test('admin approval requires verified receipt and locks the order atomically', async () => {
  const admin = await read('../Back/src/routes/admin.ts');
  const approve = admin.slice(admin.indexOf("adminRouter.post('/manual-payment-orders/:id/approve'"), admin.indexOf("adminRouter.post('/manual-payment-orders/:id/reject'"));
  assert.match(approve, /payment_received !== true/);
  assert.match(approve, /RECEIVED_AMOUNT_MISMATCH/);
  assert.match(approve, /PRODUCT_AMOUNT_MISMATCH/);
  assert.match(approve, /\.eq\('status', 'pending'\)\s*\n\s*\.is\('applied_at', null\)/);
  assert.match(approve, /already_applied: true/);
  assert.match(approve, /ORDER_IN_PROGRESS/);
  // The lock is taken before the entitlement is applied.
  assert.ok(approve.indexOf(".eq('status', 'pending')") < approve.indexOf('applyManualPaymentOrder(order'));
});

test('checkout offers bank transfer only, in DE/PL/EN, and never presents an order as paid', async () => {
  const [page, de, pl, en] = await Promise.all([
    read('../Front/src/pages/PricingPage.tsx'),
    read('../Front/src/locales/de.json').then(JSON.parse),
    read('../Front/src/locales/pl.json').then(JSON.parse),
    read('../Front/src/locales/en.json').then(JSON.parse)
  ]);
  assert.doesNotMatch(page, /crypto|ccbill|paysafe/i);
  assert.match(page, /provider: 'bank_transfer'/);
  const keys = [...page.matchAll(/t\('((?:checkout|pricing\.page)\.[A-Za-z0-9_.]+)'/g)].map((match) => match[1]);
  for (const code of ['ALREADY_ACTIVE', 'PROFILE_REQUIRED', 'ADVERTISER_ACCOUNT_REQUIRED', 'PRODUCT_NOT_AVAILABLE', 'PAYMENT_NOT_CONFIGURED']) keys.push(`checkout.errors.${code}`);
  for (const product of ['client_activation', 'advertiser_30d']) keys.push(`checkout.product.${product}`, `checkout.interval.${product}`);
  for (const locale of [de, pl, en]) for (const key of keys) assert.ok(locale[key], `missing ${key}`);
  assert.match(de['checkout.notPaidYet'], /keine Zahlung/);
  assert.doesNotMatch(de['subscription.activate'], /kommt bald/);
});
