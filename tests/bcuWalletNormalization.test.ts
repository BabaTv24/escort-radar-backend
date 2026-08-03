import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function loadBcuModules() {
  process.env.SUPABASE_URL ||= 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role';
  process.env.SUPABASE_ANON_KEY ||= 'anon-key';
  const [service, route] = await Promise.all([
    import('../Back/src/services/bcuWallet'),
    import('../Back/src/routes/bcu')
  ]);
  return { ...service, ...route };
}

test('BCU to BC conversion is identical for PostgreSQL string and safe PostgREST number values', async () => {
  const { bcuToBc } = await loadBcuModules();
  assert.equal(bcuToBc('3332666'), '333.2666');
  assert.equal(bcuToBc(3332666), '333.2666');
  assert.equal(bcuToBc('10000'), bcuToBc(10000));
  assert.equal(bcuToBc('0'), '0');
  assert.equal(bcuToBc(0), '0');
});

test('BCU conversion rejects non-finite fractional negative unsafe and malformed values', async () => {
  const { bcuToBc } = await loadBcuModules();
  const invalid = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    1.5,
    -1,
    Number.MAX_SAFE_INTEGER + 1,
    '',
    '1.5',
    '-1',
    'not-a-balance',
    null,
    undefined
  ];
  for (const value of invalid) {
    assert.throws(() => bcuToBc(value as never), /BCU amount must be a non-negative integer/);
  }
});

test('wallet serializer accepts numeric balance and locked balance without changing API scale', async () => {
  const { serializeWallet } = await loadBcuModules();
  const wallet = Object.freeze({
    id: 'wallet-id',
    user_id: 'user-id',
    public_wallet_id: 'BCU-TEST',
    balance_bcu: 150000,
    locked_balance_bcu: 50000,
    lifetime_credit_bcu: 200000,
    lifetime_debit_bcu: 50000,
    frozen: false,
    migration_status: 'not_started',
    migrated_at: null,
    created_at: '2026-08-04T00:00:00.000Z',
    updated_at: '2026-08-04T00:00:00.000Z'
  });

  const serialized = serializeWallet(wallet);
  assert.equal(serialized?.balance_bc, '15');
  assert.equal(serialized?.locked_balance_bc, '5');
  assert.equal(serialized?.available_balance_bcu, '100000');
  assert.equal(serialized?.available_balance_bc, '10');
  assert.equal(serialized?.lifetime_credit_bc, '20');
  assert.equal(serialized?.lifetime_debit_bc, '5');
  assert.equal(wallet.balance_bcu, 150000);
  assert.equal(wallet.locked_balance_bcu, 50000);
});

test('ledger and product serializers accept numeric PostgREST bigint values', async () => {
  const { serializeLedgerEntry, serializeProduct } = await loadBcuModules();
  const ledger = serializeLedgerEntry({
    id: 'ledger-id', wallet_id: 'wallet-id', user_id: 'user-id', amount_bcu: 50000,
    direction: 'debit', transaction_type: 'favorite_profile', status: 'completed',
    idempotency_key: 'key', reference_type: null, reference_id: null, source_user_id: null,
    target_user_id: null, profile_id: null, business_id: null, subscription_id: null,
    booking_id: null, source_system: 'bcu', source_table: null, source_record_id: null,
    metadata: {}, created_by: null, created_at: '2026-08-04T00:00:00.000Z'
  });
  assert.equal(ledger.amount_bc, '5');

  const product = serializeProduct({
    id: 'product-id', product_code: 'favorite_profile', display_name: 'Favorite', amount_bcu: 50000,
    operation_type: 'transfer', entitlement_type: null, duration_days: null, active: true,
    metadata: {}, created_at: '2026-08-04T00:00:00.000Z', updated_at: '2026-08-04T00:00:00.000Z'
  });
  assert.equal(product.amount_bc, '5');
});

test('wallet endpoint remains read-only for BC balances', async () => {
  const route = await readFile(new URL('../Back/src/routes/bcu.ts', import.meta.url), 'utf8');
  const handler = route.slice(route.indexOf("bcuRouter.get('/wallet'"), route.indexOf("bcuRouter.get('/ledger'"));
  assert.match(handler, /getOrCreateBcuWalletForUser\(req\.user!\.id\)/);
  assert.match(handler, /serializeWallet\(wallet\)/);
  assert.doesNotMatch(handler, /applyBcuLedgerEntry|activateBcuProduct|\.update\(|\.rpc\(|locked_balance_bcu\s*=|balance_bcu\s*=/);
});
