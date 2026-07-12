import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
test('feature flag isolates legacy and BCU Favorites', async () => {
  const route = await readFile(new URL('../Back/src/routes/favorites.ts', import.meta.url), 'utf8');
  assert.match(route, /if \(config\.bcuWalletEnabled\)/);
  assert.match(route, /addBcuFavorite/);
  assert.match(route, /add_client_favorite_with_token/);
});

test('migration 046 defines atomic paid-once transfer and restricted RPC', async () => {
  const sql = await readFile(new URL('../supabase/migrations/046_bcu_favorites_atomic_transfer.sql', import.meta.url), 'utf8');
  for (const contract of [
    'create table public.bcu_favorite_transfers',
    'unique (client_user_id, profile_id)',
    'check (amount_bcu = 50000)',
    'create or replace function public.add_bcu_favorite_with_transfer',
    'security definer',
    'set search_path = public',
    'pg_advisory_xact_lock',
    "'favorite-debit:' || p_client_user_id::text || ':' || p_profile_id::text",
    "'favorite-credit:' || p_client_user_id::text || ':' || p_profile_id::text",
    "'favorite_received'",
    'on conflict (client_id, profile_id) do nothing',
    'revoke execute on function public.add_bcu_favorite_with_transfer',
    'from public, anon, authenticated',
    'to service_role',
    'alter table public.bcu_favorite_transfers enable row level security'
  ]) assert.ok(sql.toLowerCase().includes(contract.toLowerCase()), contract);
  assert.match(sql, /v_product\.amount_bcu <> 50000/);
  assert.doesNotMatch(sql, /delete from public\.bcu_favorite_transfers/i);
  assert.doesNotMatch(sql, /recipient_user_id.*p_recipient/i);
  assert.match(sql, /pg_catalog\.hashtextextended\('bcu_favorite:' \|\| p_client_user_id::text \|\| ':' \|\| p_profile_id::text, 0\)/);
  assert.match(sql, /shadowbanned is not false/);
});

test('5 BC scale is exactly 50000 BCU in wallet code product catalog and transfer constraint', async () => {
  const service = await readFile(new URL('../Back/src/services/bcuWallet.ts', import.meta.url), 'utf8');
  const products = await readFile(new URL('../supabase/migrations/044_bcu_products_and_entitlements.sql', import.meta.url), 'utf8');
  const transfer = await readFile(new URL('../supabase/migrations/046_bcu_favorites_atomic_transfer.sql', import.meta.url), 'utf8');
  assert.match(service, /BCU_PER_BC = 10000n/);
  assert.match(products, /'favorite_profile'[\s\S]*?50000[\s\S]*?'transfer'/);
  assert.match(transfer, /amount_bcu bigint not null check \(amount_bcu = 50000\)/);
});

test('paid pair is checked before current owner so owner change restores without payment', async () => {
  const sql = await readFile(new URL('../supabase/migrations/046_bcu_favorites_atomic_transfer.sql', import.meta.url), 'utf8');
  const paidLookup = sql.indexOf('select * into v_paid');
  const ownerRequired = sql.indexOf('if v_profile.user_id is null');
  const debit = sql.indexOf('v_debit := public.apply_bcu_ledger_entry');
  assert.ok(paidLookup > 0 && paidLookup < ownerRequired && ownerRequired < debit);
  assert.doesNotMatch(sql, /v_paid\.recipient_user_id <> v_profile\.user_id/);
  assert.match(sql, /'charged', false/);
  assert.match(sql, /v_debit\.user_id <> v_paid\.client_user_id[\s\S]*v_credit\.user_id <> v_paid\.recipient_user_id/);
  assert.match(sql, /v_debit\.direction <> 'debit'[\s\S]*v_credit\.direction <> 'credit'/);
});

test('static atomicity contract keeps all writes in one RPC transaction', async () => {
  const sql = await readFile(new URL('../supabase/migrations/046_bcu_favorites_atomic_transfer.sql', import.meta.url), 'utf8');
  assert.match(sql, /v_debit := public\.apply_bcu_ledger_entry[\s\S]*v_credit := public\.apply_bcu_ledger_entry[\s\S]*insert into public\.bcu_favorite_transfers[\s\S]*insert into public\.client_favorites/);
  assert.doesNotMatch(sql, /\bcommit\b|\brollback\b/i);
  for (const code of ['BCU_INSUFFICIENT_BALANCE', 'SELF_FAVORITE_NOT_ALLOWED', 'FAVORITE_RECIPIENT_NOT_AVAILABLE', 'PROFILE_NOT_FOUND']) assert.match(sql, new RegExp(code));
});

test('static concurrency and restore contract uses paid-pair and ledger uniqueness', async () => {
  const base = await readFile(new URL('../supabase/migrations/043_bcu_authoritative_wallet.sql', import.meta.url), 'utf8');
  const sql = await readFile(new URL('../supabase/migrations/046_bcu_favorites_atomic_transfer.sql', import.meta.url), 'utf8');
  assert.match(base, /idempotency_key text unique/);
  assert.match(sql, /unique \(client_user_id, profile_id\)/);
  assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(sql, /if found then[\s\S]*on conflict \(client_id, profile_id\) do nothing[\s\S]*'charged', false/);
  assert.equal((sql.match(/'favorite-debit:'/g) || []).length, 1);
  assert.equal((sql.match(/'favorite-credit:'/g) || []).length, 1);
});

test('recipient dashboard serializer excludes client identity and ledger internals', async () => {
  const route = await readFile(new URL('../Back/src/routes/bcu.ts', import.meta.url), 'utf8');
  const dashboard = await readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
  const serializer = route.slice(route.indexOf('function serializeLedgerEntry'));
  assert.doesNotMatch(serializer, /source_user_id|idempotency_key|metadata|created_by/);
  assert.match(dashboard, /transaction_type === 'favorite_received'/);
  assert.doesNotMatch(dashboard, /client_user_id/);
});

test('backend BCU branch uses session identity and never accepts price or recipient', async () => {
  const route = await readFile(new URL('../Back/src/routes/favorites.ts', import.meta.url), 'utf8');
  assert.match(route, /addBcuFavorite\(req\.user!\.id, profileId\)/);
  assert.doesNotMatch(route, /req\.body.*(?:amount|price|recipient|user_id)/);
  assert.match(route, /if \(config\.bcuWalletEnabled\)/);
  assert.match(route, /add_client_favorite_with_token/);
});

test('frontend sends only profile path and provides BCU confirmation states', async () => {
  const api = await readFile(new URL('../Front/src/lib/api.ts', import.meta.url), 'utf8');
  const page = await readFile(new URL('../Front/src/pages/ProfilePage.tsx', import.meta.url), 'utf8');
  const locales = await Promise.all(['pl', 'en', 'de'].map((locale) => readFile(new URL(`../Front/src/locales/${locale}.json`, import.meta.url), 'utf8')));
  assert.match(api, /addFavorite:[\s\S]*`\/api\/favorites\/\$\{profileId\}`[\s\S]*method: 'POST',[\s\S]*token/);
  assert.match(page, /favoriteBusy/);
  assert.match(page, /favorites\.bcuConfirmation/);
  assert.match(page, /favorites\.bcuRestored/);
  for (const locale of locales) assert.match(locale, /"favorites\.(?:bcuConfirmation|premiumRequired|profileUnavailable)"/);
});
