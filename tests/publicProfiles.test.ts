import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { isPublicProfile } from '../Back/src/publicProfiles.ts';
import { isRealPaidSubscription, isRealRevenueTransaction, sumRealRevenue } from '../Back/src/revenue.ts';
import {
  buildAdminClient,
  enrichClientActivationPayments,
  enrichTokenTransactionsWithEmails,
  filterSortPaginateClients,
  importantLiveTestClientEmail,
  isRealClientActivationPayment
} from '../Back/src/adminClients.ts';
import { mapApiProfileToPublicProfile } from '../Front/src/lib/publicProfiles.ts';
import { isValidLatLng, resolveProfileRadarLocation, safeDistanceKm } from '../Front/src/lib/geo.ts';
import { getSafeNextPath } from '../Front/src/lib/authRedirect.ts';
import { normalizeOperatorStatus, normalizeProfileCategory, validateProfileInput } from '../Back/src/validation.ts';
import { canLinkExistingImportedUser, extractImportPairs, extractPublicPhone, mapImportedServiceValues, normalizeImportedDetails, normalizeImportedPhone, parseEscortClubProfile } from '../Back/src/hermesImport.ts';
import { fetchPublicImportResource, readImportResponseLimited, validatePublicImportUrl } from '../Back/src/publicImportSecurity.ts';

test('published admin profile is public without premium, GPS, prices, or photos', () => {
  assert.equal(isPublicProfile({
    status: 'active',
    is_published: true,
    moderation_status: 'approved',
    shadowbanned: false
  }), true);
});

test('profile without a photo remains mappable and visible', () => {
  const profile = mapApiProfileToPublicProfile({
    id: 'admin-profile',
    display_name: 'Real profile',
    city: 'berlin',
    status: 'active',
    is_published: true,
    moderation_status: 'approved'
  });
  assert.ok(profile);
  assert.deepEqual(profile.profile_images, []);
});

test('hidden and unpublished profiles are not public', () => {
  assert.equal(isPublicProfile({ status: 'active', is_published: true, moderation_status: 'approved', shadowbanned: true }), false);
  assert.equal(isPublicProfile({ status: 'suspended', is_published: true, moderation_status: 'approved', shadowbanned: false }), false);
  assert.equal(isPublicProfile({ status: 'active', is_published: false, moderation_status: 'approved', shadowbanned: false }), false);
  assert.equal(isPublicProfile({ status: 'active', is_published: true, moderation_status: 'pending', shadowbanned: false }), false);
});

test('mapper supports alternate API field and image formats', () => {
  const profile = mapApiProfileToPublicProfile({
    id: 'mapped-profile',
    name: 'Mapped profile',
    work_city: 'Berlin',
    hourly_rate: '220',
    photos: ['https://cdn.example/one.jpg'],
    avatar_url: 'https://cdn.example/avatar.jpg',
    availableNow: true
  });
  assert.ok(profile);
  assert.equal(profile.display_name, 'Mapped profile');
  assert.equal(profile.city, 'Berlin');
  assert.equal(profile.price_1h, 220);
  assert.equal(profile.profile_images?.length, 2);
});

test('production pages use the shared public profile source and no demo fallback', async () => {
  const files = await Promise.all([
    readFile(new URL('../Front/src/pages/HomePage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/pages/CityPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/pages/ProfilePage.tsx', import.meta.url), 'utf8')
  ]);
  for (const source of files) {
    assert.match(source, /getPublicProfiles|mapApiProfileToPublicProfile/);
    assert.doesNotMatch(source, /demoProfiles|getDemoProfiles|getDemoProfile|mockProfiles|fallbackProfiles/);
  }
});

test('API failure path cannot enable mock profiles', async () => {
  const source = await readFile(new URL('../Front/src/lib/publicProfiles.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /mockProfiles|demoProfiles|sampleProfiles|fallbackProfiles/);
  assert.match(source, /throw new Error/);
});

test('5 manual_admin profiles give monthly revenue = 0', () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({
    id: `manual-${index}`,
    transaction_type: 'escort_subscription',
    payment_status: 'paid',
    amount_eur: 49.99,
    provider: 'manual_admin',
    stripe_checkout_session_id: `cs_manual_${index}`,
    livemode: true
  }));
  assert.equal(sumRealRevenue(rows), 0);
});

test('Stripe client activation 0.99 is real revenue', () => {
  const payment = {
    transaction_type: 'client_activation',
    payment_status: 'paid',
    amount_cents: 99,
    provider: 'stripe',
    stripe_checkout_session_id: 'cs_live_client',
    livemode: true
  };
  assert.equal(isRealRevenueTransaction(payment), true);
  assert.equal(sumRealRevenue([payment]), 0.99);
});

test('Stripe escort subscription 49.99 is real revenue and paid subscription', () => {
  const subscription = {
    transaction_type: 'escort_subscription',
    payment_status: 'succeeded',
    amount_eur: 49.99,
    provider: 'stripe',
    stripe_payment_intent_id: 'pi_live_escort',
    livemode: true,
    status: 'active',
    role: 'escort'
  };
  assert.equal(isRealRevenueTransaction(subscription), true);
  assert.equal(isRealPaidSubscription(subscription), true);
  assert.equal(sumRealRevenue([subscription]), 49.99);
});

test('Stripe business subscription 499 is real revenue and paid subscription', () => {
  const subscription = {
    transaction_type: 'business_subscription',
    payment_status: 'completed',
    amount_eur: 499,
    provider: 'stripe',
    stripe_checkout_session_id: 'cs_live_business',
    livemode: true,
    status: 'active',
    role: 'business'
  };
  assert.equal(isRealRevenueTransaction(subscription), true);
  assert.equal(isRealPaidSubscription(subscription), true);
  assert.equal(sumRealRevenue([subscription]), 499);
});

test('Stripe test mode does not increase real revenue', () => {
  const payment = {
    transaction_type: 'client_activation',
    payment_status: 'paid',
    amount_cents: 99,
    provider: 'stripe',
    stripe_checkout_session_id: 'cs_test_client',
    livemode: false
  };
  assert.equal(isRealRevenueTransaction(payment), false);
  assert.equal(sumRealRevenue([payment]), 0);
});

test('sponsored profile is public, mapped, and does not count as paid subscription', () => {
  const apiProfile = {
    id: 'sponsored-profile',
    display_name: 'Sponsored profile',
    status: 'active',
    is_published: true,
    moderation_status: 'approved',
    is_sponsored: true,
    acquisition_source: 'admin_sponsored',
    provider: 'manual_admin'
  };
  assert.equal(isPublicProfile(apiProfile), true);
  const profile = mapApiProfileToPublicProfile(apiProfile);
  assert.ok(profile);
  assert.equal(profile.is_sponsored, true);
  assert.equal(isRealPaidSubscription({
    transaction_type: 'escort_subscription',
    payment_status: 'paid',
    amount_eur: 49.99,
    provider: 'manual_admin',
    stripe_checkout_session_id: 'cs_manual',
    livemode: true,
    status: 'active'
  }), false);
});

test('sponsored profiles have a public homepage section and badge', async () => {
  const homeSource = await readFile(new URL('../Front/src/pages/HomePage.tsx', import.meta.url), 'utf8');
  const cardSource = await readFile(new URL('../Front/src/components/ProfileCard.tsx', import.meta.url), 'utf8');
  assert.match(homeSource, /home\.sponsoredTitle/);
  assert.match(homeSource, /sponsoredProfiles/);
  assert.match(cardSource, /SPONSOROWANY/);
});

test('premium client office redesign keeps high-end UI tokens and mobile chrome', async () => {
  const styles = await readFile(new URL('../Front/src/styles.css', import.meta.url), 'utf8');
  const homeSource = await readFile(new URL('../Front/src/pages/HomePage.tsx', import.meta.url), 'utf8');
  const en = await readFile(new URL('../Front/src/locales/en.json', import.meta.url), 'utf8');
  assert.match(styles, /--er-bg:/);
  assert.match(styles, /--er-gold:/);
  assert.match(styles, /\.premium-client-office/);
  assert.match(styles, /\.client-tools-grid/);
  assert.match(styles, /\.radar-panel/);
  assert.match(styles, /\.luxury-bottom-nav/);
  assert.match(styles, /@keyframes er-shimmer/);
  assert.match(homeSource, /home\.heroTitle/);
  assert.match(en, /Your Private Client Office/);
});

test('business profile limit is enforced for max 30 and 31st profile returns 409', async () => {
  const migration = await readFile(new URL('../supabase/migrations/029_real_revenue_and_sponsored_profiles.sql', import.meta.url), 'utf8');
  const adminSource = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  assert.match(migration, /enforce_business_profile_limit/);
  assert.match(migration, /linked_count >= parent_max/);
  assert.match(adminSource, /validateBusinessProfileLimit/);
  assert.match(adminSource, /status\(409\)/);
});

test('admin clients list includes client users and supports search/filter', () => {
  const clients = [
    buildAdminClient({ user: { id: 'client-1', email: 'one@example.com', app_metadata: { auth_account_type: 'client' }, created_at: '2026-01-01' } }),
    buildAdminClient({ user: { id: 'escort-1', email: 'escort@example.com', app_metadata: { auth_account_type: 'escort' }, created_at: '2026-01-02' } }),
    buildAdminClient({
      user: { id: 'client-2', email: 'paid@example.com', app_metadata: { auth_account_type: 'client' }, created_at: '2026-01-03' },
      activation: { state: 'client_activated', activated_at: '2026-01-04' },
      payments: [{ provider: 'stripe', payment_status: 'paid', amount_cents: 99, stripe_checkout_session_id: 'cs_live', livemode: true, created_at: '2026-01-04' }]
    })
  ].filter((row) => row.email.includes('client') || row.email.includes('paid') || row.email.includes('one'));
  const page = filterSortPaginateClients(clients, { search: 'paid', status: 'stripe_activated' });
  assert.equal(page.total, 1);
  assert.equal(page.rows[0].email, 'paid@example.com');
});

test('Stripe activated client is marked as real payment', () => {
  const client = buildAdminClient({
    user: { id: 'paid-client', email: 'paid@example.com', app_metadata: { auth_account_type: 'client' }, created_at: '2026-01-01' },
    activation: { state: 'client_activated', activated_at: '2026-01-02' },
    payments: [{ provider: 'stripe', payment_status: 'succeeded', amount_cents: 99, stripe_payment_intent_id: 'pi_live', livemode: true, created_at: '2026-01-02' }]
  });
  assert.equal(client.account_status, 'stripe_activated');
  assert.equal(client.has_real_stripe_activation, true);
  assert.equal(isRealClientActivationPayment(client.payments[0]), true);
});

test('manual_admin client without Stripe does not increase revenue', () => {
  const client = buildAdminClient({
    user: { id: 'manual-client', email: 'manual@example.com', app_metadata: { auth_account_type: 'client' }, created_at: '2026-01-01' },
    activation: { state: 'client_activated', activated_at: '2026-01-02' },
    payments: [{ provider: 'manual_admin', payment_status: 'paid', amount_cents: 99, livemode: true, created_at: '2026-01-02' }]
  });
  assert.equal(client.account_status, 'admin_activated');
  assert.equal(client.has_real_stripe_activation, false);
  assert.equal(sumRealRevenue(client.payments), 0);
});

test('client@example.test is treated as active only when live Stripe reference is complete', () => {
  const client = buildAdminClient({
    user: { id: 'clientFixture', email: importantLiveTestClientEmail, app_metadata: { auth_account_type: 'client' }, created_at: '2026-01-01' },
    activation: { state: 'client_activated', activated_at: '2026-01-02' },
    payments: [{ provider: 'stripe', payment_status: 'paid', amount_cents: 99, stripe_checkout_session_id: 'cs_live_clientFixture', livemode: true, created_at: '2026-01-02' }]
  });
  assert.equal(client.account_status, 'stripe_activated');
  assert.equal(client.has_real_stripe_activation, true);
  assert.equal(sumRealRevenue(client.payments), 0.99);
});

test('client activation payment with email is visible in Admin Transactions', () => {
  const rows = enrichClientActivationPayments([{
    id: 'payment-email',
    email: 'paid@example.com',
    provider: 'stripe',
    payment_status: 'paid',
    amount_cents: 99,
    stripe_checkout_session_id: 'cs_live_email',
    livemode: true,
    created_at: '2026-06-10T07:33:00.000Z'
  }]);
  assert.equal(rows[0].email, 'paid@example.com');
  assert.equal(rows[0].amount, 0.99);
  assert.equal(rows[0].has_real_stripe_activation, true);
});

test('client activation payment with user_id joins email for Admin Transactions', () => {
  const rows = enrichClientActivationPayments([{
    id: 'payment-user',
    user_id: 'client-user',
    provider: 'stripe',
    payment_status: 'succeeded',
    amount_cents: 99,
    stripe_payment_intent_id: 'pi_live_user',
    livemode: true
  }], [{ id: 'client-user', email: 'joined@example.com' }]);
  assert.equal(rows[0].email, 'joined@example.com');
  assert.equal(rows[0].has_real_stripe_activation, true);
});

test('client@example.test live Stripe 0.99 is marked paid and warning disappears', () => {
  const client = buildAdminClient({
    user: { id: 'clientFixture', email: importantLiveTestClientEmail, app_metadata: { auth_account_type: 'client' }, created_at: '2026-06-10' },
    activation: { state: 'client_activated', activated_at: '2026-06-10T07:33:00.000Z' },
    payments: [{
      user_id: 'clientFixture',
      email: importantLiveTestClientEmail,
      provider: 'stripe',
      payment_status: 'paid',
      amount_cents: 99,
      stripe_checkout_session_id: 'cs_live_clientFixture_099',
      stripe_payment_intent_id: 'pi_live_clientFixture_099',
      livemode: true
    }]
  });
  assert.equal(client.account_status, 'stripe_activated');
  assert.equal(client.has_real_stripe_activation, true);
  assert.equal(client.stripe_warning, null);
});

test('client activation without Stripe reference keeps warning', () => {
  const client = buildAdminClient({
    user: { id: 'warn-client', email: 'warn@example.com', app_metadata: { auth_account_type: 'client' }, created_at: '2026-06-10' },
    activation: { state: 'client_activated', activated_at: '2026-06-10T07:33:00.000Z' },
    payments: [{
      user_id: 'warn-client',
      email: 'warn@example.com',
      provider: 'stripe',
      payment_status: 'paid',
      amount_cents: 99,
      livemode: true
    }]
  });
  assert.equal(client.has_real_stripe_activation, false);
  assert.equal(client.stripe_warning, 'Brak kompletnego potwierdzenia live Stripe');
});

test('revenue counts only real live Stripe 0.99 client activations', () => {
  const livePayment = {
    transaction_type: 'client_activation',
    provider: 'stripe',
    payment_status: 'paid',
    amount_cents: 99,
    stripe_checkout_session_id: 'cs_live_099',
    livemode: true
  };
  const noReference = {
    transaction_type: 'client_activation',
    provider: 'stripe',
    payment_status: 'paid',
    amount_cents: 99,
    livemode: true
  };
  const testPayment = {
    transaction_type: 'client_activation',
    provider: 'stripe',
    payment_status: 'paid',
    amount_cents: 99,
    stripe_checkout_session_id: 'cs_test_099',
    livemode: false
  };
  assert.equal(sumRealRevenue([livePayment, noReference, testPayment]), 0.99);
});

test('token transactions show email next to wallet ids', () => {
  const rows = enrichTokenTransactionsWithEmails([{
    id: 'token-tx',
    to_wallet_id: 'wallet-1',
    amount: 100,
    transaction_type: 'manual_purchase_approval',
    status: 'completed'
  }], [{ id: 'wallet-1', user_id: 'client-user' }], [{ id: 'client-user', email: 'tokens@example.com' }]);
  assert.equal(rows[0].email, 'tokens@example.com');
  assert.equal(rows[0].to_email, 'tokens@example.com');
});

test('Stripe Escort Radar checkout is disabled by default behind explicit flag', async () => {
  const configSource = await readFile(new URL('../Back/src/config.ts', import.meta.url), 'utf8');
  const paymentsSource = await readFile(new URL('../Back/src/routes/payments.ts', import.meta.url), 'utf8');
  const activationSource = await readFile(new URL('../Back/src/routes/clientActivation.ts', import.meta.url), 'utf8');
  const stripeSource = await readFile(new URL('../Back/src/services/stripePayments.ts', import.meta.url), 'utf8');
  const envSource = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(configSource, /stripeEscortRadarEnabled: envBoolean\('STRIPE_ESCORT_RADAR_ENABLED', false\)/);
  assert.match(envSource, /STRIPE_ESCORT_RADAR_ENABLED=false/);
  assert.match(paymentsSource, /!config\.stripeEnabled \|\| !config\.stripeEscortRadarEnabled/);
  assert.match(activationSource, /!config\.stripeEnabled \|\| !config\.stripeEscortRadarEnabled/);
  assert.match(stripeSource, /Stripe checkout is disabled for Escort Radar/);
  assert.match(paymentsSource, /status\(410\)/);
});

test('Escort Radar frontend uses manual orders and does not expose Stripe checkout calls', async () => {
  const apiSource = await readFile(new URL('../Front/src/lib/api.ts', import.meta.url), 'utf8');
  const pricingSource = await readFile(new URL('../Front/src/pages/PricingPage.tsx', import.meta.url), 'utf8');
  const tokenShopSource = await readFile(new URL('../Front/src/pages/TokenShopPage.tsx', import.meta.url), 'utf8');
  const dashboardSource = await readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
  const profileSource = await readFile(new URL('../Front/src/pages/ProfilePage.tsx', import.meta.url), 'utf8');
  assert.match(apiSource, /\/api\/payments\/manual-orders/);
  assert.match(apiSource, /\/api\/payments\/my-orders/);
  assert.doesNotMatch(apiSource, /clientActivationCheckout|coinsCheckout|escortSubscriptionCheckout|businessSubscriptionCheckout/);
  assert.match(pricingSource, /createManualPaymentOrder/);
  assert.match(tokenShopSource, /createManualPaymentOrder/);
  assert.match(tokenShopSource, /tokenProductCodes/);
  assert.match(dashboardSource, /navigate\('\/pricing\?product=client_activation'\)/);
  assert.match(dashboardSource, /navigate\('\/pricing\?product=advertiser_30d'\)/);
  assert.match(dashboardSource, /navigate\('\/pricing\?product=agency_30d'\)/);
  assert.match(profileSource, /navigate\('\/pricing\?product=client_activation'\)/);
  assert.doesNotMatch(`${pricingSource}\n${tokenShopSource}\n${dashboardSource}\n${profileSource}`, /checkout_url|stripe\.redirect|createCheckout/i);
});

test('manual payment catalog contains current Escort Radar token packages', async () => {
  process.env.SUPABASE_URL ||= 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role';
  process.env.SUPABASE_ANON_KEY ||= 'anon-key';
  const tokenEconomyMigration = await readFile(new URL('../supabase/migrations/009_closed_token_economy.sql', import.meta.url), 'utf8');
  const packageUpdateMigration = await readFile(new URL('../supabase/migrations/040_update_bc_coin_packages.sql', import.meta.url), 'utf8');
  const { manualPaymentProducts } = await import('../Back/src/manualPayments.ts');
  assert.deepEqual(manualPaymentProducts.filter((item) => item.purpose === 'token_package').map((item) => [item.id, item.tokens, item.bonus_tokens, item.total_tokens, item.amount_cents]), [
    ['bc_66', 66, 0, 66, 999],
    ['bc_166', 166, 20, 186, 2499],
    ['bc_666', 666, 150, 816, 9999],
    ['bc_1200', 1200, 450, 1650, 18000],
    ['bc_2560', 2560, 700, 3260, 38400],
    ['bc_5200', 5200, 1500, 6700, 78000],
    ['bc_10200', 10200, 3133, 13333, 153000]
  ]);
  for (const source of [tokenEconomyMigration, packageUpdateMigration]) {
    assert.match(source, /66 BC Coins/);
    assert.match(source, /166 BC Coins/);
    assert.match(source, /666 BC Coins/);
    assert.match(source, /3133/);
  }
  assert.doesNotMatch(`${tokenEconomyMigration}\n${packageUpdateMigration}`, /120, 18\.00|520, 78\.00|1800, false, true/);
});

test('BCU wallet architecture is isolated from historical wallet tables', async () => {
  const migration = await readFile(new URL('../supabase/migrations/043_bcu_authoritative_wallet.sql', import.meta.url), 'utf8');
  const serviceSource = await readFile(new URL('../Back/src/services/bcuWallet.ts', import.meta.url), 'utf8');

  assert.match(migration, /1 BC = 10 000 BCU/);
  assert.match(migration, /create table if not exists public\.bcu_wallets/);
  assert.match(migration, /create table if not exists public\.bcu_ledger_entries/);
  assert.match(migration, /create table if not exists public\.bcu_migration_reconciliation/);
  assert.match(migration, /balance_bcu bigint not null default 0 check \(balance_bcu >= 0\)/);
  assert.match(migration, /amount_bcu bigint not null check \(amount_bcu > 0\)/);
  assert.match(migration, /direction text not null check \(direction in \('credit', 'debit'\)\)/);
  assert.match(migration, /idempotency_key text unique/);
  assert.match(migration, /foreign key \(wallet_id, user_id\) references public\.bcu_wallets\(id, user_id\)/);
  assert.match(migration, /create or replace function public\.bc_to_bcu/);
  assert.match(migration, /p_bc <> round\(p_bc, 4\)/);
  assert.match(migration, /return \(p_bc \* 10000\)::bigint/);
  assert.match(migration, /create or replace function public\.apply_bcu_ledger_entry/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public/);
  assert.match(migration, /for update/);
  assert.match(migration, /BCU_INSUFFICIENT_BALANCE/);
  assert.match(migration, /where idempotency_key = p_idempotency_key/);
  assert.match(migration, /return v_existing/);
  assert.match(migration, /BCU_IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /v_existing\.wallet_id is not distinct from v_wallet\.id/);
  assert.match(migration, /v_existing\.source_user_id is not distinct from p_source_user_id/);
  assert.match(migration, /v_existing\.target_user_id is not distinct from p_target_user_id/);
  assert.match(migration, /v_existing\.profile_id is not distinct from p_profile_id/);
  assert.match(migration, /v_existing\.business_id is not distinct from p_business_id/);
  assert.match(migration, /v_existing\.subscription_id is not distinct from p_subscription_id/);
  assert.match(migration, /v_existing\.booking_id is not distinct from p_booking_id/);
  assert.match(migration, /BCU_IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(migration, /BCU_DIRECTION_INVALID/);
  assert.match(migration, /BCU_TRANSACTION_TYPE_INVALID/);
  assert.match(migration, /v_wallet\.user_id/);
  assert.match(migration, /create or replace function public\.prevent_bcu_ledger_mutation/);
  assert.match(migration, /before update or delete on public\.bcu_ledger_entries/);
  assert.match(migration, /BCU_LEDGER_IMMUTABLE/);
  assert.match(migration, /test_account_manual_reconciliation/);
  assert.match(migration, /manual_balance_bcu bigint/);
  assert.match(migration, /approved_balance_bcu bigint/);
  assert.match(migration, /approved_by uuid references auth\.users\(id\)/);
  assert.match(migration, /approved_at timestamptz/);
  assert.match(migration, /applied_ledger_entry_id uuid references public\.bcu_ledger_entries/);
  assert.match(migration, /source_system in \('bcu', 'legacy_wallet', 'coin_wallet', 'manual_admin', 'migration'\)/);
  assert.match(migration, /bcu_ledger_entries_reference_idx/);
  assert.match(migration, /bcu_ledger_entries_source_idx/);
  assert.match(migration, /revoke all on public\.bcu_wallets from anon, authenticated/);
  assert.match(migration, /grant select on public\.bcu_wallets to authenticated/);
  assert.match(migration, /revoke execute on function public\.apply_bcu_ledger_entry/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.apply_bcu_ledger_entry[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /create policy "Users can read own BCU migration reconciliation"/);
  assert.doesNotMatch(migration, /(update|delete from|insert into)\s+public\.(wallets|token_transactions|coin_wallets|coin_transactions)\b/i);

  assert.match(serviceSource, /export const BCU_PER_BC = 10000n/);
  assert.match(serviceSource, /BigInt\(wholePart\) \* BCU_PER_BC/);
  assert.match(serviceSource, /supabaseAdmin\.rpc\('apply_bcu_ledger_entry'/);
  assert.match(serviceSource, /p_amount_bcu: input\.amountBcu\.trim\(\)/);
  assert.match(serviceSource, /p_direction: input\.direction/);
  assert.match(serviceSource, /if \(!input\.idempotencyKey\.trim\(\)\) throw new Error\('BCU idempotency key is required'\)/);
  assert.match(serviceSource, /BCU amount must be a positive integer string/);
  assert.doesNotMatch(serviceSource, /Number\(|parseInt|parseFloat|Math\.round/);
  assert.doesNotMatch(serviceSource, /\.from\('wallets'\)|\.from\('token_transactions'\)|\.from\('coin_wallets'\)|\.from\('coin_transactions'\)/);
});

test('BCU conversion and validation helpers are bigint-safe', async () => {
  process.env.SUPABASE_URL ||= 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role';
  process.env.SUPABASE_ANON_KEY ||= 'anon-key';
  const { bcToBcu, bcuToBc, assertPositiveBcuAmount, assertBcuTransactionType } = await import('../Back/src/services/bcuWallet.ts');

  assert.equal(bcToBcu('1'), '10000');
  assert.equal(bcToBcu('7'), '70000');
  assert.equal(bcToBcu('333.2666'), '3332666');
  assert.equal(bcToBcu('3326.6666'), '33266666');
  assert.equal(bcToBcu('11993.3333'), '119933333');
  assert.equal(bcuToBc('10000'), '1');
  assert.equal(bcuToBc('3332666'), '333.2666');

  assert.throws(() => bcToBcu('0.00001'), /max 4 places/);
  assert.throws(() => bcToBcu('-1'), /max 4 places/);
  assert.throws(() => bcToBcu('not-a-number'), /max 4 places/);
  assert.throws(() => assertPositiveBcuAmount('0'), /positive integer string/);
  assert.throws(() => assertPositiveBcuAmount('-1'), /positive integer string/);
  assert.throws(() => assertPositiveBcuAmount('1.5'), /positive integer string/);
  assert.throws(() => assertBcuTransactionType('x'), /transaction type is invalid/);
  assert.throws(() => assertBcuTransactionType('bad type'), /transaction type is invalid/);
});

test('BCU products entitlements and routes are feature-flagged and backend-priced', async () => {
  const migration = await readFile(new URL('../supabase/migrations/044_bcu_products_and_entitlements.sql', import.meta.url), 'utf8');
  const serviceSource = await readFile(new URL('../Back/src/services/bcuWallet.ts', import.meta.url), 'utf8');
  const routeSource = await readFile(new URL('../Back/src/routes/bcu.ts', import.meta.url), 'utf8');
  const serverSource = await readFile(new URL('../Back/src/server.ts', import.meta.url), 'utf8');
  const configSource = await readFile(new URL('../Back/src/config.ts', import.meta.url), 'utf8');
  const favoritesSource = await readFile(new URL('../Back/src/routes/favorites.ts', import.meta.url), 'utf8');
  const clientActivationSource = await readFile(new URL('../Back/src/routes/clientActivation.ts', import.meta.url), 'utf8');
  const paymentsSource = await readFile(new URL('../Back/src/routes/payments.ts', import.meta.url), 'utf8');

  for (const snippet of [
    'create table if not exists public.system_bcu_products',
    'create table if not exists public.user_entitlements',
    "operation_type text not null check (operation_type in ('credit', 'debit', 'transfer'))",
    "entitlement_type text not null check (entitlement_type in ('client_premium', 'advertiser', 'small_business', 'vip_business', 'communication_plus'))",
    'create unique index if not exists user_entitlements_one_active_type_idx',
    "where status = 'active'",
    "('premium_activation_bonus', 'Premium activation bonus', 70000, 'credit'",
    "('favorite_profile', 'Favorite profile', 50000, 'transfer'",
    "('referral_reward', 'Referral reward', 100000, 'credit'",
    "('communication_plus', 'Communication Plus', 1000000, 'debit', 'communication_plus'",
    "('advertiser_30_days', 'Advertiser 30 days', 3332666, 'debit', 'advertiser', 30",
    "('small_business_30_days', 'Small Business 30 days', 33266666, 'debit', 'small_business', 30",
    "('vip_business_30_days', 'VIP Business 30 days', 119933333, 'debit', 'vip_business', 30",
    'create or replace function public.activate_bcu_product',
    'security definer',
    'set search_path = public',
    "where product_code = p_product_code",
    'and active = true',
    "not public.has_active_user_entitlement(p_user_id, 'client_premium')",
    "raise exception 'BCU_CLIENT_PREMIUM_REQUIRED'",
    'pg_advisory_xact_lock',
    "where user_id = p_user_id",
    "and entitlement_type = 'communication_plus'",
    "charged', false",
    'v_product.amount_bcu',
    'from public.apply_bcu_ledger_entry',
    'BCU_LEDGER_PRODUCT_MISMATCH',
    "'bcu_product'",
    'on conflict (user_id, entitlement_type) where status = \'active\'',
    'revoke execute on function public.activate_bcu_product(uuid, text, text, jsonb) from public, anon, authenticated',
    'grant execute on function public.activate_bcu_product(uuid, text, text, jsonb) to service_role'
  ]) {
    assert.match(migration, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(migration, /500\s*(profiles|profile|limit)/i);
  assert.match(migration, /- 'amount_bcu'[\s\S]*- 'user_id'[\s\S]*- 'status'[\s\S]*- 'starts_at'[\s\S]*- 'ends_at'/);
  assert.match(serviceSource, /getBcuLedgerForUser/);
  assert.match(serviceSource, /getActiveBcuProducts/);
  assert.match(serviceSource, /getUserEntitlements/);
  assert.match(serviceSource, /hasActiveEntitlement/);
  assert.match(serviceSource, /activateBcuProduct/);
  assert.match(serviceSource, /p_product_code: input\.productCode\.trim\(\)/);
  assert.match(serviceSource, /p_idempotency_key: input\.idempotencyKey\.trim\(\)/);
  assert.doesNotMatch(serviceSource, /amount_bcu:\s*Number|balance_bcu:\s*number|parseInt|parseFloat|Math\.round/);

  assert.match(configSource, /bcuWalletEnabled: boolean/);
  assert.match(configSource, /bcuWalletEnabled: envBoolean\('BCU_WALLET_ENABLED', false\)/);
  assert.match(routeSource, /bcuRouter\.use\(verifyUser\)/);
  assert.match(routeSource, /!config\.bcuWalletEnabled/);
  assert.match(routeSource, /status\(404\)\.json\(\{ error: 'BCU wallet is not available' \}\)/);
  assert.match(routeSource, /bcuRouter\.get\('\/wallet'/);
  assert.match(routeSource, /bcuRouter\.get\('\/ledger'/);
  assert.match(routeSource, /Math\.min\(100/);
  assert.match(routeSource, /bcuRouter\.get\('\/products'/);
  assert.match(routeSource, /bcuRouter\.get\('\/entitlements'/);
  assert.match(routeSource, /bcuRouter\.post\('\/products\/:productCode\/activate'/);
  assert.match(routeSource, /productCode !== 'communication_plus'/);
  assert.doesNotMatch(routeSource, /req\.body\?\.(amount_bcu|amountBcu|price|price_bcu|priceBcu)/);
  assert.doesNotMatch(routeSource, /\.\.\.entry|\.\.\.entitlement|\.\.\.result/);
  assert.doesNotMatch(routeSource, /metadata: entry\.metadata|metadata: entitlement\.metadata|created_by: entry\.created_by/);
  assert.match(routeSource, /function serializeLedgerEntry/);
  assert.match(routeSource, /function serializeEntitlement/);
  assert.match(routeSource, /products: products\.map\(serializeProduct\)/);
  assert.match(routeSource, /entitlements: entitlements\.map\(serializeEntitlement\)/);
  assert.match(serverSource, /app\.use\('\/api\/bcu', bcuRouter\)/);

  assert.doesNotMatch(`${favoritesSource}\n${clientActivationSource}\n${paymentsSource}`, /activateBcuProduct|getActiveBcuProducts|system_bcu_products/);
});

test('legacy Stripe webhook route is mounted but gated by Escort Radar flag', async () => {
  const serverSource = await readFile(new URL('../Back/src/server.ts', import.meta.url), 'utf8');
  const webhookRouteSource = await readFile(new URL('../Back/src/routes/stripeWebhook.ts', import.meta.url), 'utf8');
  const webhookSource = await readFile(new URL('../Back/src/services/stripePayments.ts', import.meta.url), 'utf8');
  assert.match(serverSource, /express\.raw\(\{ type: 'application\/json'/);
  assert.match(serverSource, /\/api\/stripe/);
  assert.match(webhookRouteSource, /!config\.stripeEnabled \|\| !config\.stripeEscortRadarEnabled/);
  assert.match(webhookRouteSource, /status\(410\)/);
  for (const eventName of [
    'checkout.session.completed',
    'payment_intent.succeeded',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted'
  ]) {
    assert.match(webhookSource, new RegExp(eventName.replaceAll('.', '\\.')));
  }
});

test('Stripe migration stores event ids and prevents duplicate revenue events', async () => {
  const migration = await readFile(new URL('../supabase/migrations/030_escort_radar_stripe_integration.sql', import.meta.url), 'utf8');
  assert.match(migration, /create table if not exists public\.stripe_payment_events/);
  assert.match(migration, /stripe_event_id text unique not null/);
  assert.match(migration, /stripe_payment_events_checkout_session_uidx/);
  assert.match(migration, /stripe_payment_events_payment_intent_uidx/);
});

test('admin revenue can still display legacy historical Stripe revenue', () => {
  const rows = [
    { transaction_type: 'client_activation', payment_status: 'paid', amount_cents: 99, provider: 'stripe', stripe_checkout_session_id: 'cs_client', livemode: true },
    { transaction_type: 'escort_subscription', payment_status: 'paid', amount_cents: 4999, provider: 'stripe', stripe_subscription_id: 'sub_escort', livemode: true },
    { transaction_type: 'business_subscription', payment_status: 'paid', amount_cents: 49999, provider: 'stripe', stripe_subscription_id: 'sub_business', livemode: true },
    { transaction_type: 'coins_purchase', payment_status: 'paid', amount_cents: 1999, provider: 'stripe', stripe_payment_intent_id: 'pi_coins', livemode: true },
    { transaction_type: 'coins_purchase', payment_status: 'paid', amount_cents: 1999, provider: 'stripe', stripe_payment_intent_id: 'pi_test', livemode: false }
  ];
  assert.equal(sumRealRevenue(rows.filter((row) => row.transaction_type === 'client_activation')), 0.99);
  assert.equal(sumRealRevenue(rows.filter((row) => row.transaction_type === 'escort_subscription')), 49.99);
  assert.equal(sumRealRevenue(rows.filter((row) => row.transaction_type === 'business_subscription')), 499.99);
  assert.equal(sumRealRevenue(rows.filter((row) => row.transaction_type === 'coins_purchase')), 19.99);
});

test('admin client endpoints and coin actions exist', async () => {
  const adminSource = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const apiSource = await readFile(new URL('../Front/src/lib/api.ts', import.meta.url), 'utf8');
  const typesSource = await readFile(new URL('../Front/src/types.ts', import.meta.url), 'utf8');
  const pageSource = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  assert.match(adminSource, /adminRouter\.get\('\/clients'/);
  assert.match(adminSource, /adminRouter\.patch\('\/clients\/:id\/coins'/);
  assert.match(apiSource, /adminClients/);
  assert.match(apiSource, /adjustAdminClientCoins/);
  assert.match(pageSource, /\/admin\/clients/);
  assert.match(pageSource, /client-mobile-cards/);
  for (const field of [
    'bc_coin_package_revenue_eur',
    'bc_coin_package_transactions',
    'bc_coin_sold_amount',
    'bc_coin_bonus_amount'
  ]) {
    assert.match(adminSource, new RegExp(field));
    assert.match(typesSource, new RegExp(field));
    assert.match(pageSource, new RegExp(field));
  }
  assert.match(adminSource, /buildBcCoinPackageStats/);
  assert.match(adminSource, /manual_payment_orders'\)\.select\('purpose, status, amount_eur, amount_cents, tokens_amount, metadata'\)\.eq\('purpose', 'token_package'\)/);
  assert.match(adminSource, /token_purchase_requests'\)\.select\('status, token_amount, eur_price, bonus_tokens'\)/);
  assert.match(apiSource, /AdminStats/);
  assert.match(pageSource, /admin\.dashboard\.bcCoinPackageRevenue/);
  assert.match(pageSource, /admin\.dashboard\.bcCoinPackageSummary/);
  const plLocale = await readFile(new URL('../Front/src/locales/pl.json', import.meta.url), 'utf8');
  assert.match(plLocale, /"admin\.dashboard\.bcCoinPackageRevenue": "Przychód z pakietów BC Coins"/);
  assert.match(plLocale, /"admin\.dashboard\.bcCoinPackageSummary": "\{\{packages\}\} pakietów · \{\{sold\}\} BC sprzedanych · \{\{bonus\}\} BC bonus"/);
});

test('merchant review footer exposes required public compliance links', async () => {
  const layoutSource = await readFile(new URL('../Front/src/components/Layout.tsx', import.meta.url), 'utf8');
  const legalSource = await readFile(new URL('../Front/src/pages/LegalPage.tsx', import.meta.url), 'utf8');
  for (const href of ['/terms', '/privacy', '/refund-policy', '/content-rules', '/report-abuse', '/contact', '/pricing', '/legal-notice']) {
    assert.match(layoutSource, new RegExp(`to="${href.replace('/', '\\/')}"`));
  }
  assert.match(layoutSource, /footer\.operatedBy/);
  assert.match(legalSource, /Escort Radar is operated by/);
  assert.match(legalSource, /<dt>Product<\/dt><dd>Escort Radar<\/dd>/);
});

test('pricing page lists required platform products, token packages and compliance text', async () => {
  const source = await readFile(new URL('../Front/src/pages/PricingPage.tsx', import.meta.url), 'utf8');
  for (const text of [
    'Client Activation',
    '0.99 EUR',
    'Solo Advertiser Premium Listing',
    '49.99 EUR',
    'Agency / Business Plan',
    '499.00 EUR',
    '10200 BC Coins',
    '1530,00 EUR',
    'The platform does not process payments for physical meetings between users.',
    'discreet prepaid payment',
    'manual bank transfer',
    'CCBill card payments - coming soon',
    'Paysafecard/Paysafe - coming soon',
    'Payment reference'
  ]) {
    assert.match(source, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(source, new RegExp(`anon${'ymous'} payment`, 'i'));
});

test('manual payment orders migration and admin endpoints are present and idempotent', async () => {
  const migration = await readFile(new URL('../supabase/migrations/031_manual_payment_orders_and_compliance.sql', import.meta.url), 'utf8');
  const paymentsSource = await readFile(new URL('../Back/src/routes/payments.ts', import.meta.url), 'utf8');
  const adminSource = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const manualSource = await readFile(new URL('../Back/src/manualPayments.ts', import.meta.url), 'utf8');
  assert.match(migration, /create table if not exists public\.manual_payment_orders/);
  assert.match(migration, /provider in \('manual', 'bank_transfer', 'crypto', 'ccbill', 'paysafe'\)/);
  assert.match(migration, /purpose in \('client_activation', 'advertiser_subscription', 'agency_subscription', 'token_package'\)/);
  assert.match(migration, /applied_at timestamptz/);
  assert.match(paymentsSource, /paymentsRouter\.post\('\/manual-orders', verifyUser/);
  assert.match(paymentsSource, /paymentsRouter\.get\('\/my-orders', verifyUser/);
  assert.match(paymentsSource, /const email = String\(req\.user\?\.email/);
  assert.doesNotMatch(paymentsSource, /req\.body\.email|req\.body\.user_id|req\.body\.amount_cents|req\.body\.status/);
  assert.match(adminSource, /\/manual-payment-orders/);
  assert.match(adminSource, /payment_reference/);
  assert.match(adminSource, /if \(!order\.applied_at\) await applyManualPaymentOrder/);
  assert.match(manualSource, /manual_payment_order_id/);
});

test('manual payment products and reference instruction match CCBill review readiness', async () => {
  process.env.SUPABASE_URL ||= 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role';
  process.env.SUPABASE_ANON_KEY ||= 'anon-key';
  const { buildPaymentReference, manualPaymentProducts, paymentReferenceInstruction } = await import('../Back/src/manualPayments.ts');
  assert.deepEqual(manualPaymentProducts.map((item) => [item.id, item.amount_cents]), [
    ['client_activation', 99],
    ['advertiser_30d', 4999],
    ['agency_30d', 49900],
    ['bc_66', 999],
    ['bc_166', 2499],
    ['bc_666', 9999],
    ['bc_1200', 18000],
    ['bc_2560', 38400],
    ['bc_5200', 78000],
    ['bc_10200', 153000]
  ]);
  assert.equal(buildPaymentReference('order-1', 'user@example.com', 'ER-{orderId}-{userEmail}'), 'ER-order-1-user@example.com');
  assert.match(paymentReferenceInstruction('order-1'), /Please include your account email and order number in the payment reference/);
});

test('environment example includes legal and manual payment readiness variables', async () => {
  const source = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  for (const key of [
    'SUPPORT_EMAIL=',
    'LEGAL_OPERATOR_NAME=',
    'LEGAL_OPERATOR_ADDRESS=',
    'LEGAL_RESPONSIBLE_PERSON=',
    'LEGAL_VAT_ID=',
    'PAYMENT_DEFAULT_PROVIDER=manual',
    'CCBILL_ENABLED=false',
    'PAYSAFE_ENABLED=false',
    'MANUAL_BANK_TRANSFER_ENABLED=true',
    'MANUAL_BANK_TRANSFER_RECIPIENT=',
    'MANUAL_BANK_TRANSFER_IBAN=',
    'MANUAL_BANK_TRANSFER_BIC=',
    'MANUAL_BANK_TRANSFER_BANK_NAME=',
    'MANUAL_BANK_TRANSFER_REFERENCE_TEMPLATE="ER-{orderId}-{userEmail}"',
    'MANUAL_CRYPTO_ENABLED=true',
    'BCU_WALLET_ENABLED=false',
    'STRIPE_ESCORT_RADAR_ENABLED=false',
    'VITE_SUPPORT_EMAIL=',
    'VITE_LEGAL_OPERATOR_NAME=BABA AI',
    'VITE_MANUAL_BANK_TRANSFER_ENABLED=true',
    'VITE_MANUAL_BANK_TRANSFER_RECIPIENT=',
    'VITE_MANUAL_BANK_TRANSFER_IBAN=',
    'VITE_MANUAL_BANK_TRANSFER_BIC=',
    'VITE_MANUAL_BANK_TRANSFER_BANK_NAME=',
    'VITE_STRIPE_ESCORT_RADAR_ENABLED=false',
    'VITE_BCU_WALLET_ENABLED=false'
  ]) {
    assert.match(source, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('category normalization uses canonical mobile category keys', async () => {
  const { activePublicCategoryOptions, getCategoryAliases, isActivePublicCategory, normalizeCategoryKey, categoryOptions } = await import('../Back/src/categories.ts');
  const frontCategories = await import('../Front/src/lib/categories.ts');
  const { citySlug, normalizeCountry } = await import('../Back/src/locations.ts');
  assert.deepEqual(categoryOptions, ['ladies', 'men', 'gay', 'couples', 'trans', 'massage', 'home_hotel', 'live_cam', 'clubs_parties', 'bdsm', 'onlyfans', 'sex_phone', 'films', 'offers', 'other']);
  assert.deepEqual(activePublicCategoryOptions, ['ladies', 'gay', 'couples', 'trans', 'massage', 'live_cam', 'clubs_parties']);
  assert.equal(normalizeCategoryKey('Gay'), 'gay');
  assert.equal(normalizeCategoryKey('Panie'), 'ladies');
  assert.equal(normalizeCategoryKey('Ladies'), 'ladies');
  assert.equal(normalizeCategoryKey('female'), 'ladies');
  assert.equal(normalizeCategoryKey('women'), 'ladies');
  assert.equal(normalizeCategoryKey('woman'), 'ladies');
  assert.equal(normalizeCategoryKey('girls'), 'ladies');
  assert.equal(normalizeCategoryKey('girl'), 'ladies');
  assert.equal(isActivePublicCategory('Panie'), true);
  assert.equal(isActivePublicCategory('ladies'), true);
  assert.equal(frontCategories.isActivePublicCategory('Panie'), true);
  assert.equal(frontCategories.isActivePublicCategory('ladies'), true);
  assert.equal(normalizeCategoryKey('Panowie'), 'men');
  assert.equal(normalizeCategoryKey('Dom / Hotel'), 'home_hotel');
  assert.equal(normalizeCategoryKey('house_hotel'), 'home_hotel');
  assert.ok(getCategoryAliases('sex_phone').includes('phone_show'));
  assert.equal(normalizeCountry('Deutschland'), 'DE');
  assert.equal(citySlug('Frankfurt am Main'), 'frankfurt-am-main');
});

test('global location catalog is the single source for city marketplace routing', async () => {
  const backLocations = await import('../Back/src/locations.ts');
  const frontLocations = await import('../Front/src/lib/globalLocations.ts');
  const locationCatalogSource = await readFile(new URL('../Front/src/data/locationCatalog.ts', import.meta.url), 'utf8');
  const globalSearchSource = await readFile(new URL('../Front/src/components/GlobalLocationSearch.tsx', import.meta.url), 'utf8');
  const cityPageSource = await readFile(new URL('../Front/src/pages/CityPage.tsx', import.meta.url), 'utf8');
  const adminSource = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  const dashboardSource = await readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
  const profilesSource = await readFile(new URL('../Back/src/routes/profiles.ts', import.meta.url), 'utf8');

  assert.ok(frontLocations.getCitiesForCountry('DE').includes('Berlin'));
  assert.ok(frontLocations.getCitiesForCountry('DE').includes('Hamburg'));
  assert.ok(frontLocations.getCitiesForCountry('PL').includes('Warszawa'));
  assert.equal(frontLocations.normalizeCountry('Germany'), 'DE');
  assert.equal(frontLocations.normalizeCountry('DE'), 'DE');
  assert.equal(frontLocations.normalizeCountry('Niemcy'), 'DE');
  assert.equal(frontLocations.citySlug('Hamburg'), 'hamburg');
  assert.ok(frontLocations.globalCountries.some((country) => country.code === 'LU'));
  assert.ok(backLocations.globalCountries.some((country) => country.code === 'LU'));

  assert.match(locationCatalogSource, /globalCountries\.map/);
  assert.match(globalSearchSource, /navigateToCity\(item\)/);
  assert.match(cityPageSource, /params\.set\('city', urlCitySlug\)/);
  assert.match(cityPageSource, /params\.set\('country', countryCode\)/);
  assert.match(cityPageSource, /setProfiles\(\[\]\)/);
  assert.match(adminSource, /locationCatalog\.forEach/);
  assert.match(dashboardSource, /work_country: nextCountry\.code/);
  assert.match(profilesSource, /const normalizedValue = normalizeGlobalCity\(value\)/);
  assert.doesNotMatch(profilesSource, /String\(value \|\| ''\)\.toLowerCase\(\)\.includes\(wanted\)/);
});

test('admin profile studio separates account profile category and advanced promotion controls', async () => {
  const adminSource = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  const enLocale = await readFile(new URL('../Front/src/locales/en.json', import.meta.url), 'utf8');
  const plLocale = await readFile(new URL('../Front/src/locales/pl.json', import.meta.url), 'utf8');
  const deLocale = await readFile(new URL('../Front/src/locales/de.json', import.meta.url), 'utf8');

  assert.match(adminSource, /adminAccountTypeOptions = \['client', 'advertiser', 'business', 'admin'\]/);
  assert.match(adminSource, /adminProfileTypeOptions = \['independent', 'agency', 'massage_salon', 'club', 'live_cam', 'couple', 'trans', 'gay', 'male_escort', 'other'\]/);
  assert.match(adminSource, /adminAccountTypeToBackend/);
  assert.match(adminSource, /adminProfileTypeToBackend/);
  assert.match(adminSource, /publicProfileType/);
  assert.match(adminSource, /marketplaceCategory/);
  assert.match(adminSource, /publicProfileStatus/);
  assert.match(adminSource, /promotionModeration/);
  assert.match(adminSource, /exposurePackage/);
  assert.match(adminSource, /manualSortingPriority/);
  assert.match(adminSource, /activeSubscription/);
  assert.doesNotMatch(adminSource, /label="Profil sponsorowany"/);
  assert.doesNotMatch(adminSource, /SPONSOROWANY/);
  assert.match(enLocale, /"admin\.profileEditor\.exposurePackage": "Exposure package"/);
  assert.match(plLocale, /"admin\.profileEditor\.exposurePackage": "Pakiet ekspozycji"/);
  assert.match(deLocale, /"admin\.profileEditor\.exposurePackage": "Sichtbarkeitspaket"/);
  assert.match(enLocale, /"admin\.accountType\.advertiser": "Advertiser"/);
  assert.match(plLocale, /"admin\.profileEditor\.marketplaceCategory": "Glowna kategoria marketplace"/);
  assert.match(deLocale, /"admin\.profileEditor\.advancedModeration": "Moderation \/ Erweitert"/);
});

test('visibility audit explains Berlin Hamburg marketplace matrix and category all', async () => {
  const { explainProfileVisibility, profileMatchesSearch } = await import('../Back/src/profileVisibility.ts');
  const { activePublicCategoryOptions, disabledPublicCategoryOptions } = await import('../Front/src/lib/categories.ts');
  const adminSource = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const profilesSource = await readFile(new URL('../Back/src/routes/profiles.ts', import.meta.url), 'utf8');
  const cityPageSource = await readFile(new URL('../Front/src/pages/CityPage.tsx', import.meta.url), 'utf8');
  const globalSearchSource = await readFile(new URL('../Front/src/components/GlobalLocationSearch.tsx', import.meta.url), 'utf8');
  const layoutSource = await readFile(new URL('../Front/src/components/Layout.tsx', import.meta.url), 'utf8');
  const homeSource = await readFile(new URL('../Front/src/pages/HomePage.tsx', import.meta.url), 'utf8');
  const adminPageSource = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  const plLocale = JSON.parse(await readFile(new URL('../Front/src/locales/pl.json', import.meta.url), 'utf8'));
  const base = {
    status: 'active',
    is_published: true,
    moderation_status: 'approved',
    shadowbanned: false,
    subscription_status: 'active',
    work_country: 'DE',
    postal_code: '10115'
  };
  const berlinLadies = { ...base, id: 'berlin-ladies', display_name: 'Berlin Panie', city: 'berlin', work_city: 'Berlin', category: 'Panie' };
  const berlinLadiesCanonical = { ...base, id: 'berlin-ladies-canonical', display_name: 'Berlin Ladies', city: 'berlin', work_city: 'Berlin', category: 'ladies' };
  const berlinGay = { ...base, id: 'berlin-gay', display_name: 'Berlin Gay', city: 'berlin', work_city: 'Berlin', category: 'Gay' };
  const berlinHomeHotel = { ...base, id: 'berlin-home-hotel', display_name: 'Berlin Dom/Hotel', city: 'berlin', work_city: 'Berlin', category: 'Dom / Hotel' };
  const hamburgLadies = { ...base, id: 'hamburg-ladies', display_name: 'Hamburg Panie', city: 'hamburg', work_city: 'Hamburg', category: 'Panie' };
  const rows = [berlinLadies, berlinLadiesCanonical, berlinGay, berlinHomeHotel, hamburgLadies];

  assert.deepEqual(activePublicCategoryOptions, ['ladies', 'gay', 'couples', 'trans', 'massage', 'live_cam', 'clubs_parties']);
  assert.deepEqual(disabledPublicCategoryOptions, ['men', 'home_hotel', 'bdsm', 'onlyfans', 'sex_phone', 'films', 'offers', 'other']);
  assert.deepEqual(rows.filter((profile) => profileMatchesSearch(profile, { country: 'DE', city: 'berlin', category: 'all' })).map((profile) => profile.id), ['berlin-ladies', 'berlin-ladies-canonical', 'berlin-gay']);
  assert.deepEqual(rows.filter((profile) => profileMatchesSearch(profile, { country: 'DE', city: 'berlin', category: 'ladies' })).map((profile) => profile.id), ['berlin-ladies', 'berlin-ladies-canonical']);
  assert.deepEqual(rows.filter((profile) => profileMatchesSearch(profile, { country: 'DE', city: 'berlin', category: 'gay' })).map((profile) => profile.id), ['berlin-gay']);
  assert.deepEqual(rows.filter((profile) => profileMatchesSearch(profile, { country: 'DE', city: 'hamburg', category: 'all' })).map((profile) => profile.id), ['hamburg-ladies']);

  const panieInLadies = explainProfileVisibility(berlinLadies, { country: 'DE', city: 'berlin', category: 'ladies' });
  assert.equal(panieInLadies.isPublicVisible, true);
  assert.equal(panieInLadies.isVisibleInCurrentSearch, true);
  assert.equal(panieInLadies.checks.categoryActive, true);
  assert.equal(panieInLadies.reasons.includes('disabled_category'), false);

  const gayInLadies = explainProfileVisibility(berlinGay, { country: 'DE', city: 'berlin', category: 'ladies' });
  assert.equal(gayInLadies.isPublicVisible, true);
  assert.equal(gayInLadies.isVisibleInCurrentSearch, false);
  assert.ok(gayInLadies.reasons.includes('category_mismatch'));

  const homeHotelAll = explainProfileVisibility(berlinHomeHotel, { country: 'DE', city: 'berlin', category: 'all' });
  assert.equal(homeHotelAll.isPublicVisible, false);
  assert.equal(homeHotelAll.isVisibleInCurrentSearch, false);
  assert.equal(homeHotelAll.checks.categoryActive, false);
  assert.ok(homeHotelAll.reasons.includes('disabled_category'));
  assert.equal(plLocale['admin.visibility.reason.disabled_category'], 'Kategoria wyłączona');
  assert.equal(plLocale['admin.visibility.reason.category_mismatch'], 'Kategoria nie pasuje do aktualnego widoku');
  assert.match(adminSource, /profiles\/visibility-audit/);
  assert.match(adminSource, /visibility_audit: explainProfileVisibility/);
  assert.match(profilesSource, /isActivePublicCategory\(profile\.category\)/);
  assert.match(profilesSource, /const categoryFilter = normalizeProfileCategory\(req\.query\.category\)/);
  assert.match(cityPageSource, /search\.showingSummary/);
  assert.match(cityPageSource, /activePublicCategoryOptions\.map/);
  assert.match(globalSearchSource, /<option value="">\{t\('filters\.allCategories'\)\}<\/option>/);
  assert.doesNotMatch(layoutSource, /premium-main-nav/);
  assert.doesNotMatch(layoutSource, /nav\.forClients/);
  assert.match(homeSource, /activePublicCategoryOptions\.map/);
  assert.match(adminPageSource, /legacyDisabledCategory/);
  assert.match(adminPageSource, /activePublicCategoryOptions\.map/);
  assert.match(adminPageSource, /adminCategoryToFormValue\(profile\.category\)/);
  assert.match(adminPageSource, /category: normalizeCategoryKey\(studioForm\.category\) \|\| studioForm\.category/);
});

test('client activation token bonus is 7 and favorites are token-gated', async () => {
  const configSource = await readFile(new URL('../Back/src/config.ts', import.meta.url), 'utf8');
  const clientActivationSource = await readFile(new URL('../Back/src/services/clientActivation.ts', import.meta.url), 'utf8');
  const tokenWalletSource = await readFile(new URL('../Back/src/services/tokenWallet.ts', import.meta.url), 'utf8');
  const adminClientsSource = await readFile(new URL('../Back/src/adminClients.ts', import.meta.url), 'utf8');
  const adminRouteSource = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const tokensSource = await readFile(new URL('../Back/src/routes/tokens.ts', import.meta.url), 'utf8');
  const favoritesSource = await readFile(new URL('../Back/src/routes/favorites.ts', import.meta.url), 'utf8');
  const profilesSource = await readFile(new URL('../Back/src/routes/profiles.ts', import.meta.url), 'utf8');
  const stripePaymentsSource = await readFile(new URL('../Back/src/services/stripePayments.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/034_client_favorites_token_cost.sql', import.meta.url), 'utf8');
  const rpcMigration = await readFile(new URL('../supabase/migrations/037_fix_token_wallet_source_of_truth.sql', import.meta.url), 'utf8');
  const dedupeMigration = await readFile(new URL('../supabase/migrations/038_dedupe_wallets_unique_user.sql', import.meta.url), 'utf8');
  const adminPageSource = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  const tokenShopSource = await readFile(new URL('../Front/src/pages/TokenShopPage.tsx', import.meta.url), 'utf8');
  const apiSource = await readFile(new URL('../Front/src/lib/api.ts', import.meta.url), 'utf8');
  const plLocale = await readFile(new URL('../Front/src/locales/pl.json', import.meta.url), 'utf8');
  const enLocale = await readFile(new URL('../Front/src/locales/en.json', import.meta.url), 'utf8');
  const deLocale = await readFile(new URL('../Front/src/locales/de.json', import.meta.url), 'utf8');

  assert.match(configSource, /CLIENT_ACTIVATION_WELCOME_COINS/);
  assert.match(configSource, /CLIENT_ACTIVATION_TOKEN_BONUS/);
  assert.doesNotMatch(configSource, /CLIENT_ACTIVATION_WELCOME_COINS=100/);
  assert.match(clientActivationSource, /getOrCreateTokenWallet\(userId\)/);
  assert.match(clientActivationSource, /adjustTokenWalletBalance\(wallet\.id, userId, config\.clientActivationWelcomeCoins, 'client_activation_bonus'/);
  assert.match(clientActivationSource, /\.from\('wallets'\)/);
  assert.match(tokenWalletSource, /export async function getOrCreateWalletForUser/);
  assert.match(tokenWalletSource, /onConflict: 'user_id'/);
  assert.match(tokenWalletSource, /ignoreDuplicates: true/);
  assert.match(tokenWalletSource, /order\('escort_token_balance', \{ ascending: false \}\)/);
  assert.match(adminClientsSource, /token_balance: Number\(input\.wallet\?\.escort_token_balance \|\| 0\)/);
  assert.match(adminRouteSource, /supabaseAdmin\.from\('wallets'\)\.select\('\*'\)\.limit\(5000\)/);
  assert.doesNotMatch(adminRouteSource, /loadAdminClients[\s\S]*supabaseAdmin\.from\('coin_wallets'\)\.select\('\*'\)\.limit\(5000\)/);
  assert.match(tokensSource, /escort_token_balance/);
  assert.match(tokensSource, /getOrCreateWalletForUser\(userId\)/);
  assert.match(favoritesSource, /getOrCreateWalletForUser\(userId\)/);
  assert.match(profilesSource, /getOrCreateWalletForUser\(userId\)/);
  assert.match(stripePaymentsSource, /getOrCreateWalletForUser\(userId\)/);
  for (const source of [tokensSource, favoritesSource, profilesSource, stripePaymentsSource, clientActivationSource, adminRouteSource]) {
    assert.doesNotMatch(source, /\.from\('wallets'\)[\s\S]{0,240}\.insert\(\{\s*user_id/);
  }
  assert.match(tokenShopSource, /wallet\?\.escort_token_balance/);
  assert.match(adminPageSource, /'token_balance'/);
  assert.doesNotMatch(adminPageSource, /Coins: \{client\.coins/);
  assert.match(plLocale, /"admin\.table\.token_balance": "BC Coins"/);
  assert.match(enLocale, /"admin\.table\.token_balance": "BC Coins"/);
  assert.match(deLocale, /"admin\.table\.token_balance": "BC Coins"/);
  assert.match(favoritesSource, /FAVORITE_TOKEN_COST = 1/);
  assert.match(favoritesSource, /add_client_favorite_with_token/);
  assert.match(favoritesSource, /code: 'NOT_ENOUGH_TOKENS'/);
  assert.match(favoritesSource, /new_balance/);
  assert.match(apiSource, /new_balance\?: number/);
  assert.match(migration, /create table if not exists public\.client_favorites/);
  assert.match(migration, /'favorite_profile'/);
  assert.match(rpcMigration, /returns jsonb/);
  assert.match(rpcMigration, /'new_balance'/);
  assert.match(rpcMigration, /set escort_token_balance = v_balance - p_cost/);
  assert.match(dedupeMigration, /create unique index if not exists wallets_user_id_unique_idx/);
  assert.match(dedupeMigration, /partition by w\.user_id/);
  assert.match(dedupeMigration, /coalesce\(w\.escort_token_balance, 0\) desc/);
  assert.match(dedupeMigration, /update public\.token_transactions tx[\s\S]*set from_wallet_id = m\.canonical_wallet_id/);
  assert.match(dedupeMigration, /update public\.token_transactions tx[\s\S]*set to_wallet_id = m\.canonical_wallet_id/);
  assert.match(dedupeMigration, /delete from public\.wallets w/);
  assert.match(dedupeMigration, /on conflict \(user_id\) do update/);
});

test('production regression contracts for Berlin profiles dashboard and client preferences stay wired', async () => {
  const profilesSource = await readFile(new URL('../Back/src/routes/profiles.ts', import.meta.url), 'utf8');
  const cityPageSource = await readFile(new URL('../Front/src/pages/CityPage.tsx', import.meta.url), 'utf8');
  const dashboardSource = await readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
  const apiSource = await readFile(new URL('../Front/src/lib/api.ts', import.meta.url), 'utf8');
  const serverSource = await readFile(new URL('../Back/src/server.ts', import.meta.url), 'utf8');
  const preferenceRoute = await readFile(new URL('../Back/src/routes/clientPreferences.ts', import.meta.url), 'utf8');
  const preferenceMigration = await readFile(new URL('../supabase/migrations/035_client_search_location_preferences.sql', import.meta.url), 'utf8');

  assert.match(profilesSource, /profileMatchesCountry\(profile, country\) \|\| \(city && profileMatchesCity\(profile, city\)\)/);
  assert.match(cityPageSource, /const radarProfiles = useMemo/);
  assert.doesNotMatch(cityPageSource, /if \(!radarRange\.inRange\) return false/);
  assert.match(dashboardSource, /function resolveAccountMode/);
  assert.match(dashboardSource, /\[DashboardAuth\]/);
  assert.match(apiSource, /clientPreferences: \(token: string\)/);
  assert.match(apiSource, /updateClientPreferences/);
  assert.match(serverSource, /app\.use\('\/api\/client\/preferences', clientPreferencesRouter\)/);
  assert.match(preferenceRoute, /client_search_postal_code/);
  assert.match(preferenceMigration, /add column if not exists client_search_lat numeric/);
});

test('radar distance helpers reject invalid coordinates and never return negative distances', () => {
  const buckow = { lat: 52.424, lng: 13.462 };
  const friedrichshain = { lat: 52.5144, lng: 13.46 };
  const distance = safeDistanceKm(buckow, friedrichshain);

  assert.equal(isValidLatLng(0, 0), false);
  assert.equal(safeDistanceKm(buckow, { lat: 0, lng: 0 }), null);
  assert.equal(safeDistanceKm(buckow, { lat: 999, lng: 13.46 }), null);
  assert.ok(distance !== null && distance > 0);
  assert.ok(distance !== null && distance < 25);
});

test('radar location resolver falls back from bad coords to Berlin postal and area data', () => {
  const friedrichshain = resolveProfileRadarLocation({
    id: 'profile-10247',
    display_name: 'Friedrichshain',
    city: 'berlin',
    work_city: 'Berlin',
    postal_code: '10247',
    location_visibility: 'postal_area',
    location_mode: 'city_only',
    latitude: 0,
    longitude: 0
  } as any);
  const kreuzberg = resolveProfileRadarLocation({
    id: 'profile-10997',
    display_name: 'Kreuzberg',
    city: 'berlin',
    work_area: 'Kreuzberg',
    location_visibility: 'postal_area',
    latitude: 999,
    longitude: 'garbage'
  } as any);
  const hidden = resolveProfileRadarLocation({
    id: 'hidden-profile',
    display_name: 'Hidden',
    city: 'berlin',
    postal_code: '10997',
    location_visibility: 'hidden'
  } as any);

  assert.equal(friedrichshain?.precision, 'postal_area');
  assert.match(friedrichshain?.label || '', /10247 Berlin Friedrichshain/);
  assert.equal(kreuzberg?.precision, 'area');
  assert.match(kreuzberg?.label || '', /Kreuzberg/);
  assert.equal(hidden, null);
});

test('city page keeps listing profiles as radar input and does not pre-empty the radar', async () => {
  const cityPageSource = await readFile(new URL('../Front/src/pages/CityPage.tsx', import.meta.url), 'utf8');
  const radarPanelSource = await readFile(new URL('../Front/src/components/RadarPanel.tsx', import.meta.url), 'utf8');
  const geoSource = await readFile(new URL('../Front/src/lib/geo.ts', import.meta.url), 'utf8');

  assert.match(cityPageSource, /profiles=\{sortedProfiles\}/);
  assert.match(cityPageSource, /radarInputProfiles: sortedProfiles\.length/);
  assert.match(radarPanelSource, /source === 'manual_saved'/);
  assert.match(radarPanelSource, /\[RadarLocationResolve\]/);
  assert.match(geoSource, /safeDistanceKm/);
  assert.match(geoSource, /sort\(\(left, right\) => right\.length - left\.length\)/);
});

test('category and status normalization accept production admin payload aliases', async () => {
  const migration = await readFile(new URL('../supabase/migrations/036_fix_profiles_category_status_constraints.sql', import.meta.url), 'utf8');
  assert.equal(normalizeProfileCategory('Dom / Hotel'), 'home_hotel');
  assert.equal(normalizeProfileCategory('home_hotel'), 'home_hotel');
  assert.equal(normalizeProfileCategory('Gay'), 'gay');
  assert.equal(normalizeOperatorStatus('ONLINE_NOW'), 'ONLINE_NOW');
  assert.equal(normalizeOperatorStatus('online_now'), 'ONLINE_NOW');
  assert.equal(normalizeOperatorStatus('online'), 'ONLINE_NOW');
  assert.equal(normalizeOperatorStatus('OFFLINE'), 'OFFLINE');
  assert.match(migration, /drop constraint if exists profiles_category_check/);
  assert.match(migration, /'home_hotel'/);
  assert.match(migration, /'Dom \/ Hotel'/);
  assert.match(migration, /profiles_operator_status_check/);
});

test('profile validation stores canonical category and online status fields', () => {
  const result = validateProfileInput({
    display_name: 'Sexy Ewa',
    city: 'berlin',
    category: 'Dom / Hotel',
    operator_status: 'online_now',
    availability_status: 'available',
    travels: true
  });
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.data.category, 'home_hotel');
  assert.equal(result.data.operator_status, 'ONLINE_NOW');
  assert.equal(result.data.availability_status, 'available');
  assert.equal(result.data.travels, true);
});

test('public profile maps online aliases and visit mode labels are visible to clients', async () => {
  const cardSource = await readFile(new URL('../Front/src/components/ProfileCard.tsx', import.meta.url), 'utf8');
  const profilePageSource = await readFile(new URL('../Front/src/pages/ProfilePage.tsx', import.meta.url), 'utf8');
  const plLocale = await readFile(new URL('../Front/src/locales/pl.json', import.meta.url), 'utf8');
  const profile = mapApiProfileToPublicProfile({
    id: 'sexy-ewa',
    display_name: 'Sexy Ewa',
    city: 'berlin',
    status: 'active',
    category: 'Gay',
    operator_status: 'online_now',
    availability_status: 'available',
    travels: true
  });
  assert.equal(profile?.category, 'gay');
  assert.equal(profile?.operator_status, 'ONLINE_NOW');
  assert.equal(profile?.travels, true);
  assert.match(cardSource, /profileDetails\.outcallBadge/);
  assert.match(cardSource, /profileDetails\.incallBadge/);
  assert.match(profilePageSource, /getClientVisitMode/);
  assert.match(plLocale, /Wyjazdy: Tak/);
  assert.match(plLocale, /Tryb wizyty/);
});

test('mobile auth bar exposes login register panel and logout actions', async () => {
  const layoutSource = await readFile(new URL('../Front/src/components/Layout.tsx', import.meta.url), 'utf8');
  const loginSource = await readFile(new URL('../Front/src/pages/LoginPage.tsx', import.meta.url), 'utf8');
  const dashboardSource = await readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
  const profileCardSource = await readFile(new URL('../Front/src/components/ProfileCard.tsx', import.meta.url), 'utf8');
  const profilePageSource = await readFile(new URL('../Front/src/pages/ProfilePage.tsx', import.meta.url), 'utf8');
  const favoritesSource = await readFile(new URL('../Back/src/routes/favorites.ts', import.meta.url), 'utf8');
  const apiSource = await readFile(new URL('../Front/src/lib/api.ts', import.meta.url), 'utf8');
  const authRedirectSource = await readFile(new URL('../Front/src/lib/authRedirect.ts', import.meta.url), 'utf8');
  const supabaseSource = await readFile(new URL('../Front/src/lib/supabase.ts', import.meta.url), 'utf8');
  const stylesSource = await readFile(new URL('../Front/src/styles.css', import.meta.url), 'utf8');
  const serviceWorkerSource = await readFile(new URL('../Front/public/sw.js', import.meta.url), 'utf8');
  const plLocale = await readFile(new URL('../Front/src/locales/pl.json', import.meta.url), 'utf8');
  const enLocale = await readFile(new URL('../Front/src/locales/en.json', import.meta.url), 'utf8');
  const deLocale = await readFile(new URL('../Front/src/locales/de.json', import.meta.url), 'utf8');

  assert.match(layoutSource, /supabase\.auth\.getSession/);
  assert.match(layoutSource, /onAuthStateChange/);
  assert.match(layoutSource, /supabase\.auth\.signOut/);
  assert.match(layoutSource, /navigate\('\/', \{ replace: true \}\)/);
  assert.match(layoutSource, /authPath\(favoritesPath\)/);
  assert.match(layoutSource, /encodeURIComponent\(path\)/);
  assert.match(layoutSource, /const tokensPath = '\/tokens'/);
  assert.match(layoutSource, /authPath\(accountPath\)/);
  assert.match(layoutSource, /authPath\(tokensPath\)/);
  assert.match(layoutSource, /\[MobileLogin\]/);
  assert.match(layoutSource, /t\('favorites\.favorites'\)/);
  assert.match(layoutSource, /t\('nav\.messages'\)/);
  assert.match(layoutSource, /t\('nav\.bookings'\)/);
  assert.match(layoutSource, /mobile-account-role/);
  assert.match(layoutSource, /t\('auth\.dashboard'\)/);
  assert.match(layoutSource, /t\('auth\.logout'\)/);
  assert.match(loginSource, /useSearchParams/);
  assert.match(loginSource, /getSafeNextPath/);
  assert.match(loginSource, /function handleSubmit\(event: FormEvent\)/);
  assert.match(loginSource, /onSubmit=\{handleSubmit\}/);
  assert.match(loginSource, /type="submit"/);
  assert.match(loginSource, /withTimeout\(/);
  assert.match(loginSource, /supabase\.auth\.signInWithPassword/);
  assert.match(loginSource, /15000/);
  assert.match(loginSource, /loginRunId/);
  assert.match(loginSource, /didRedirectRef/);
  assert.match(loginSource, /16000/);
  assert.match(loginSource, /setShowSlowLoginHelp\(true\)/);
  assert.match(loginSource, /t\('auth\.loginTooLong'\)/);
  assert.match(loginSource, /mountedRef\.current && !didRedirect/);
  assert.match(loginSource, /setLoading\(false\)/);
  assert.match(loginSource, /showSlowLoginHelp &&/);
  assert.match(loginSource, /t\('auth\.tryAgain'\)/);
  assert.match(loginSource, /const session = result\.data\.session/);
  assert.match(loginSource, /if \(!session\?\.access_token \|\| !session\.refresh_token \|\| !session\.user\)/);
  assert.match(loginSource, /sessionStorage\.setItem\(loginJustCompletedStorageKey, String\(Date\.now\(\)\)\)/);
  assert.match(loginSource, /saveLoginSessionHandoff\(session\)/);
  assert.match(loginSource, /navigate\(nextPath, \{ replace: true \}\)/);
  assert.match(authRedirectSource, /export async function withTimeout/);
  assert.match(authRedirectSource, /Promise\.race/);
  assert.match(authRedirectSource, /window\.clearTimeout/);
  assert.match(authRedirectSource, /startsWith\('\/'\)/);
  assert.match(authRedirectSource, /startsWith\('\/\/'\)/);
  assert.match(authRedirectSource, /startsWith\('http:\/\/'\)/);
  assert.match(authRedirectSource, /startsWith\('https:\/\/'\)/);
  assert.match(authRedirectSource, /decodeURIComponent/);
  assert.match(loginSource, /email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(loginSource, /escortRadar\.rememberedEmail/);
  assert.match(loginSource, /localStorage\.setItem\(rememberedEmailStorageKey, normalizedEmail\)/);
  assert.match(loginSource, /localStorage\.removeItem\(rememberedEmailStorageKey\)/);
  assert.doesNotMatch(loginSource, /localStorage\.setItem\([^)]*password/i);
  assert.match(loginSource, /\[MobileLogin\] signIn success/);
  assert.match(loginSource, /\[MobileLogin\] final redirect/);
  assert.match(supabaseSource, /LOGIN_HANDOFF_KEY = 'escortRadar:loginSessionHandoff'/);
  assert.match(supabaseSource, /export function saveLoginSessionHandoff/);
  assert.match(supabaseSource, /export async function restoreLoginSessionHandoff/);
  assert.match(supabaseSource, /supabase\.auth\.setSession/);
  assert.match(supabaseSource, /persistSession: true/);
  assert.match(supabaseSource, /autoRefreshToken: true/);
  assert.match(supabaseSource, /detectSessionInUrl: true/);
  assert.match(favoritesSource, /already_exists/);
  assert.match(favoritesSource, /new_balance/);
  assert.match(apiSource, /already_exists\?: boolean/);
  assert.match(dashboardSource, /id="favorites"/);
  assert.match(dashboardSource, /const sessionAttempts = recentLogin \? 60 : 20/);
  assert.match(dashboardSource, /waitForSupabaseSession\(sessionAttempts, 250\)/);
  assert.match(dashboardSource, /restoreLoginSessionHandoff\(\)/);
  assert.match(dashboardSource, /handoff-session-restored/);
  assert.doesNotMatch(dashboardSource, /coinWallet\?\.balance \|\| 100/);
  assert.doesNotMatch(dashboardSource, /defaultCoins\s*=\s*100/);
  assert.doesNotMatch(dashboardSource, /receive welcome coins/);
  assert.match(dashboardSource, /api\.myFavorites\(accessToken\)/);
  assert.match(dashboardSource, /scrollIntoView/);
  assert.match(dashboardSource, /favorites\.favoritesDescription/);
  assert.match(dashboardSource, /favorites\.loginToSeeFavorites/);
  assert.match(dashboardSource, /clientOffice\.viewNearby/);
  assert.match(profileCardSource, /favorites\.alreadyFavorite/);
  assert.match(profileCardSource, /favorites\.buyTokens/);
  assert.match(profileCardSource, /onFavoriteChange\?\.\(profile\.id\)/);
  assert.match(profileCardSource, /result\.already_exists \|\| result\.already_favorited/);
  assert.match(profilePageSource, /favorites\.alreadyFavorite/);
  assert.match(profilePageSource, /encodeURIComponent\(`\/profile\/\$\{profile!\.id\}`\)/);
  assert.match(stylesSource, /Mobile auth and saved radar location hotfix/);
  assert.match(stylesSource, /\.mobile-account-links a,/);
  assert.match(stylesSource, /\.remember-email-control/);
  assert.match(stylesSource, /Fixed app chrome hotfix/);
  assert.match(stylesSource, /\.market-header \{\s*position: fixed !important/);
  assert.match(stylesSource, /\.app-shell > main \{\s*padding-top:/);
  assert.match(serviceWorkerSource, /escort-radar-v\d+/);
  assert.match(serviceWorkerSource, /cache: 'no-store'/);
  assert.match(plLocale, /"auth\.logout": "Wyloguj"/);
  assert.match(plLocale, /"auth\.rememberEmail": "Zapami/);
  assert.match(plLocale, /"auth\.loginTooLong": "Logowanie trwa/);
  assert.match(plLocale, /"auth\.tryAgain": "Spr/);
  assert.match(enLocale, /"auth\.rememberEmail": "Remember email"/);
  assert.match(enLocale, /"auth\.loginTooLong": "Login took too long/);
  assert.match(enLocale, /"auth\.tryAgain": "Try again"/);
  assert.match(deLocale, /"auth\.rememberEmail": "E-Mail merken"/);
  assert.match(deLocale, /"auth\.loginTooLong": "Die Anmeldung hat zu lange gedauert/);
  assert.match(deLocale, /"auth\.tryAgain": "Erneut versuchen"/);
  assert.match(plLocale, /"favorites\.favorites": "Ulubione"/);
  assert.match(plLocale, /"favorites\.loginToSeeFavorites": "Zaloguj si/);
  assert.match(enLocale, /"favorites\.favorites": "Favorites"/);
  assert.match(deLocale, /"favorites\.favorites": "Favoriten"/);
});

test('login safe next path accepts only local redirects and preserves hashes', () => {
  assert.equal(getSafeNextPath(new URLSearchParams('next=/dashboard%23favorites')), '/dashboard#favorites');
  assert.equal(getSafeNextPath(new URLSearchParams('next=/dashboard')), '/dashboard');
  assert.equal(getSafeNextPath(new URLSearchParams('next=https://evil.com')), '/dashboard');
  assert.equal(getSafeNextPath(new URLSearchParams('next=//evil.com')), '/dashboard');
  assert.equal(getSafeNextPath(new URLSearchParams('next=javascript:alert(1)')), '/dashboard');
  assert.equal(getSafeNextPath(new URLSearchParams('')), '/dashboard');
});

test('mobile logged-out nav uses encoded login next paths', async () => {
  const layoutSource = await readFile(new URL('../Front/src/components/Layout.tsx', import.meta.url), 'utf8');
  assert.match(layoutSource, /favoritesPath = '\/dashboard#favorites'/);
  assert.match(layoutSource, /messagesPath = '\/dashboard#messages'/);
  assert.match(layoutSource, /bookingsPath = '\/dashboard#bookings'/);
  assert.match(layoutSource, /accountPath = '\/dashboard'/);
  assert.match(layoutSource, /authPath\(favoritesPath\)/);
  assert.match(layoutSource, /authPath\(messagesPath\)/);
  assert.match(layoutSource, /authPath\(bookingsPath\)/);
  assert.match(layoutSource, /authPath\(accountPath\)/);
  assert.match(layoutSource, /`\/login\?next=\$\{encodeURIComponent\(path\)\}`/);
  assert.doesNotMatch(layoutSource, /\/login\?next=\/dashboard#favorites/);
});

test('city radar status supports favorites filter and login next flow', async () => {
  const cityPageSource = await readFile(new URL('../Front/src/pages/CityPage.tsx', import.meta.url), 'utf8');
  const radarPanelSource = await readFile(new URL('../Front/src/components/RadarPanel.tsx', import.meta.url), 'utf8');
  const plLocale = await readFile(new URL('../Front/src/locales/pl.json', import.meta.url), 'utf8');
  const enLocale = await readFile(new URL('../Front/src/locales/en.json', import.meta.url), 'utf8');
  const deLocale = await readFile(new URL('../Front/src/locales/de.json', import.meta.url), 'utf8');

  assert.match(radarPanelSource, /\['favorites', 'favorites', 'favorites\.favoritesFilter'\]/);
  assert.match(radarPanelSource, /if \(status === 'favorites'\) return true/);
  assert.match(cityPageSource, /setFavoriteProfileIds\(new Set\(favoritesData\.favorites\.map\(\(favorite\) => favorite\.profile_id\)\)\)/);
  assert.match(cityPageSource, /draftFilters\.availability_status === 'favorites'/);
  assert.match(cityPageSource, /profiles\.filter\(\(profile\) => favoriteProfileIds\.has\(profile\.id\)\)/);
  assert.match(cityPageSource, /favorites\.loginToSeeFavorites/);
  assert.match(cityPageSource, /encodeURIComponent\(`\$\{location\.pathname\}\$\{location\.search\}`\)/);
  assert.match(cityPageSource, /favorites\.noFavoritesYet/);
  assert.match(cityPageSource, /onFavoriteChange=\{handleFavoriteChange\}/);
  assert.match(cityPageSource, /if \(status === 'favorites'\) return true/);
  assert.match(plLocale, /"favorites\.favoritesFilter": "Ulubione"/);
  assert.match(enLocale, /"favorites\.favoritesFilter": "Favorites"/);
  assert.match(deLocale, /"favorites\.favoritesFilter": "Favoriten"/);
});

test('premium client office removes gift stats and uses real wallet fallback', async () => {
  const dashboardSource = await readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(dashboardSource, /clientOffice\.giftsSent/);
  assert.doesNotMatch(dashboardSource, /clientOffice\.giftsReceived/);
  assert.doesNotMatch(dashboardSource, /coinWallet\?\.balance \|\| 100/);
  assert.doesNotMatch(dashboardSource, /defaultCoins\s*=\s*100/);
  assert.match(dashboardSource, /walletSystem === 'bcu'[\s\S]*bcuWallet\?\.balance_bc \?\? '0'/);
  assert.doesNotMatch(dashboardSource, /Number\(bcuWallet\?\.balance_bc/);
});

test('premium client referral reward and live request contract stay client-only', async () => {
  const dashboardSource = await readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
  const plLocale = await readFile(new URL('../Front/src/locales/pl.json', import.meta.url), 'utf8');
  assert.match(dashboardSource, /CLIENT_REFERRAL_REWARD_COINS = 10/);
  assert.match(dashboardSource, /referralActivations \* CLIENT_REFERRAL_REWARD_COINS/);
  assert.match(dashboardSource, /earnedReferralCoins/);
  assert.match(dashboardSource, /onCreateIntent\(\{ \.\.\.intentDraft, status: 'LOOKING_NOW' \}\)/);
  assert.doesNotMatch(dashboardSource, /\['LOOKING_NOW', 'LOOKING_TODAY', 'TRAVELING', 'BROWSING', 'OFFLINE'\]/);
  assert.match(plLocale, /"clientOffice\.nextReward": "Następna nagroda: \{\{count\}\} BC Coins"/);
  assert.match(plLocale, /"clientOffice\.createRequest": "Wyślij request"/);
});

test('premium client favorites render photos and favorite-only actions', async () => {
  const dashboardSource = await readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
  assert.match(dashboardSource, /function ClientFavoriteCard/);
  assert.match(dashboardSource, /getProfileImageUrl\(profile\)/);
  assert.match(dashboardSource, /profile\.profile_images/);
  assert.match(dashboardSource, /profile\.images/);
  assert.match(dashboardSource, /alternate\.photos\?\.\[0\]/);
  assert.match(dashboardSource, /<Link className="button primary" to=\{`\/profile\/\$\{profile\.id\}`\}/);
  assert.match(dashboardSource, /favorites\.removeFromFavorites/);
  assert.doesNotMatch(dashboardSource, /<ProfileCard profile=\{favorite\.profile\}/);
});

test('client personal profile migration and API contracts are wired', async () => {
  const migration = await readFile(new URL('../supabase/migrations/039_client_personal_profiles.sql', import.meta.url), 'utf8');
  const routeSource = await readFile(new URL('../Back/src/routes/clientPersonalProfile.ts', import.meta.url), 'utf8');
  const serverSource = await readFile(new URL('../Back/src/server.ts', import.meta.url), 'utf8');
  const apiSource = await readFile(new URL('../Front/src/lib/api.ts', import.meta.url), 'utf8');

  assert.match(migration, /create table if not exists public\.client_personal_profiles/);
  assert.match(migration, /verification_status text not null default 'incomplete'/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /auth\.uid\(\) = user_id/);
  assert.match(routeSource, /clientPersonalProfileRouter\.get\('\/'/);
  assert.match(routeSource, /clientPersonalProfileRouter\.put\('\/'/);
  assert.match(routeSource, /profile_complete: profileComplete/);
  assert.match(routeSource, /verification_status: nextStatus/);
  assert.match(serverSource, /app\.use\('\/api\/client\/personal-profile', clientPersonalProfileRouter\)/);
  assert.match(apiSource, /clientPersonalProfile: \(token: string\)/);
  assert.match(apiSource, /updateClientPersonalProfile/);
});

test('client personal profile completion maps to pending verification', async () => {
  const routeSource = await readFile(new URL('../Back/src/routes/clientPersonalProfile.ts', import.meta.url), 'utf8');
  assert.match(routeSource, /requiredFields = \['first_name', 'last_name', 'phone', 'street', 'house_number', 'postal_code', 'city', 'country'\]/);
  assert.match(routeSource, /profile\.consent_personal_data/);
  assert.match(routeSource, /profile\.consent_home_service_contact/);
  assert.match(routeSource, /profile\.consent_verified_client_badge/);
  assert.match(routeSource, /existing\?\.verification_status === 'verified' \? 'verified' : 'pending'/);
});

test('admin receives client personal profile data and can verify it', async () => {
  const adminRouteSource = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const adminPageSource = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  const apiSource = await readFile(new URL('../Front/src/lib/api.ts', import.meta.url), 'utf8');
  assert.match(adminRouteSource, /adminRouter\.get\('\/client-profiles'/);
  assert.match(adminRouteSource, /adminRouter\.patch\('\/client-profiles\/:id\/verification'/);
  assert.match(adminRouteSource, /email: usersById\.get\(row\.user_id\)\?\.email/);
  assert.match(apiSource, /adminClientPersonalProfiles/);
  assert.match(apiSource, /setAdminClientPersonalVerification/);
  assert.match(adminPageSource, /view === 'client-profiles'/);
  assert.match(adminPageSource, /admin\.nav\.clientProfiles/);
  assert.match(adminPageSource, /admin\.clientProfiles\.markVerified/);
});

test('advertiser-visible client badge exposes status without private address', async () => {
  const intentSource = await readFile(new URL('../Back/src/routes/clientIntent.ts', import.meta.url), 'utf8');
  assert.match(intentSource, /client_verification_status/);
  assert.match(intentSource, /client_verified_badge/);
  assert.match(intentSource, /consent_verified_client_badge === true/);
  assert.doesNotMatch(intentSource, /select\('user_id, first_name, verification_status, consent_verified_client_badge, street/);
});

test('client search location can be updated cleared and edited from radar', async () => {
  const routeSource = await readFile(new URL('../Back/src/routes/clientPreferences.ts', import.meta.url), 'utf8');
  const apiSource = await readFile(new URL('../Front/src/lib/api.ts', import.meta.url), 'utf8');
  const cityPageSource = await readFile(new URL('../Front/src/pages/CityPage.tsx', import.meta.url), 'utf8');
  const radarPanelSource = await readFile(new URL('../Front/src/components/RadarPanel.tsx', import.meta.url), 'utf8');
  const geoSource = await readFile(new URL('../Front/src/lib/geo.ts', import.meta.url), 'utf8');
  const plLocale = await readFile(new URL('../Front/src/locales/pl.json', import.meta.url), 'utf8');

  assert.match(routeSource, /clientPreferencesRouter\.delete\('\/location'/);
  assert.match(routeSource, /if \(value === null \|\| value === undefined \|\| value === ''\) return null/);
  assert.match(apiSource, /clearClientSearchLocation/);
  assert.match(geoSource, /export const clientSearchLocationStorageKey/);
  assert.match(geoSource, /localStorage\.getItem\(clientSearchLocationStorageKey\)/);
  assert.match(geoSource, /localStorage\.setItem\(clientSearchLocationStorageKey/);
  assert.match(geoSource, /localStorage\.removeItem\(clientSearchLocationStorageKey\)/);
  assert.match(cityPageSource, /readSavedSearchLocation\(\)/);
  assert.match(cityPageSource, /saveSearchLocationToStorage\(location\)/);
  assert.match(cityPageSource, /clearSavedSearchLocation\(\)/);
  assert.match(cityPageSource, /onClearManualLocation=\{clearManualLocation\}/);
  assert.match(cityPageSource, /client_search_postal_code: null/);
  assert.match(radarPanelSource, /isEditingLocation/);
  assert.match(radarPanelSource, /radar\.savedLocation/);
  assert.match(radarPanelSource, /radar\.changeLocation/);
  assert.match(radarPanelSource, /radar\.clearLocation/);
  assert.match(plLocale, /Lokalizacja zapisana/);
  assert.match(plLocale, /Lokalizacja została wyczyszczona/);
});

test('Hermes profile import preview returns raw services, groups and image candidates', async () => {
  const adminRouteSource = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const adminPageSource = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  assert.match(adminRouteSource, /raw_services/);
  assert.match(adminRouteSource, /service_groups/);
  assert.match(adminRouteSource, /raw_visible_text/);
  assert.match(adminRouteSource, /linkRegex/);
  assert.match(adminRouteSource, /background-image/);
  assert.match(adminRouteSource, /slice\(0, 12\)/);
  assert.match(adminPageSource, /hermesPreview\.images\.slice\(0, 12\)/);
});

test('Hermes sponsored create accepts an optional password and keeps profile unpublished', async () => {
  const adminRouteSource = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const apiSource = await readFile(new URL('../Front/src/lib/api.ts', import.meta.url), 'utf8');
  assert.match(adminRouteSource, /if \(password && password\.length < 8\)/);
  assert.match(adminRouteSource, /if \(password && password !== confirmPassword\)/);
  assert.match(adminRouteSource, /nextSponsoredImportEmail/);
  assert.match(adminRouteSource, /bussines\+sponsoring/);
  assert.match(adminRouteSource, /is_published: false/);
  assert.match(adminRouteSource, /moderation_status: 'pending'/);
  assert.match(adminRouteSource, /is_sponsored: true/);
  assert.match(apiSource, /sponsored\?: boolean/);
});

test('Hermes sponsored create copies images with partial failure warnings and public URL validation', async () => {
  const adminRouteSource = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  assert.match(adminRouteSource, /function importProfileImagesToStorage/);
  assert.match(adminRouteSource, /validatePublicImportUrl\(imageUrl\)/);
  assert.match(adminRouteSource, /AbortSignal\.timeout\(15000\)/);
  assert.match(adminRouteSource, /12 \* 1024 \* 1024/);
  assert.match(adminRouteSource, /image\/jpeg', 'image\/png', 'image\/webp/);
  assert.match(adminRouteSource, /imported\/\$\{options\.profileId\}/);
  assert.match(adminRouteSource, /Image upload failed partial/);
  assert.match(adminRouteSource, /No images were copied to storage/);
});

test('Hermes normalizes international public phone without losing plus prefix', () => {
  assert.equal(normalizeImportedPhone('+49 301 484 237 98'), '+4930148423798');
  assert.equal(extractPublicPhone('<main><a href="tel:+49 301 484 237 98">Telefon</a></main>', ''), '+4930148423798');
  assert.equal(extractPublicPhone('<main><a href="tel:+49%20301%20484%20237%2098">Telefon</a></main>', ''), '+4930148423798');
  assert.equal(normalizeImportedPhone('0049 301 484 237 98'), '+4930148423798');
  assert.equal(normalizeImportedPhone('+49 12'), '');
  assert.equal(normalizeImportedPhone('+49 123 456 789 012 345 6'), '');
  assert.equal(extractPublicPhone('<main><script type="application/ld+json">{"telephone":"+49 301 484 237 98"}</script></main>', ''), '+4930148423798');
  assert.equal(extractPublicPhone('<main>Profil</main><footer>Support Telefon: +49 999 999 999</footer>', 'Profil'), '');
});

test('Hermes SSRF guard blocks unusual private IP forms redirects and oversized bodies', async () => {
  for(const url of ['http://localhost/x','http://127.1/x','http://2130706433/x','http://0x7f000001/x','http://[::1]/x','http://169.254.169.254/latest','http://10.0.0.1/x','http://172.16.0.1/x','http://192.168.1.1/x']) assert.ok(validatePublicImportUrl(url),url);
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});
  try { await assert.rejects(fetchPublicImportResource('https://93.184.216.34/profile',{signal:AbortSignal.timeout(1000)}),/Unsafe redirect blocked/); }
  finally { globalThis.fetch=originalFetch; }
  await assert.rejects(readImportResponseLimited(new Response('123456'),5),/larger than 5 bytes/);
});

test('Hermes importer links only importer-owned existing auth users', () => {
  assert.equal(canLinkExistingImportedUser({app_metadata:{created_by:'hermes_import'}},'hermes_import'),true);
  assert.equal(canLinkExistingImportedUser({app_metadata:{created_by:'manual_admin'}},'hermes_import'),false);
  assert.equal(canLinkExistingImportedUser({app_metadata:{}},'hermes_import'),false);
});

test('Hermes parses multilingual more-about-me key value structures', () => {
  const html=`<main><dl>
    <dt>Płeć:</dt><dd>Kobieta</dd><dt>Orientacja</dt><dd>Hetero</dd><dt>Wiek</dt><dd>23 l</dd>
    <dt>Wzrost</dt><dd>166 cm</dd><dt>Waga</dt><dd>54 kg</dd><dt>Biust</dt><dd>2, Naturalny</dd>
    <dt>Oczy</dt><dd>Niebieskie</dd><dt>Włosy</dt><dd>Brązowe</dd><dt>Wyjazdy</dt><dd>Tylko hotele</dd>
    <dt>Języki</dt><dd>Angielski, Niemiecki</dd><dt>Etniczność</dt><dd>Europejska (biała)</dd>
    <dt>Narodowość</dt><dd>Niemiecka</dd><dt>Znak zodiaku</dt><dd>Bliźnięta</dd><dt>Nietypowe pole</dt><dd>wartość</dd>
  </dl></main>`;
  const details=normalizeImportedDetails(extractImportPairs(html));
  assert.deepEqual({ gender:details.gender,orientation:details.orientation,age:details.age,height:details.height_cm,weight:details.weight_kg },{ gender:'female',orientation:'hetero',age:23,height:166,weight:54 });
  assert.equal(details.bust,'2, Naturalny'); assert.equal(details.eyes,'Niebieskie'); assert.equal(details.hair,'Brązowe');
  assert.equal(details.travel,'Tylko hotele'); assert.equal(details.travels,false); assert.deepEqual(details.visit_types,['hotel']);
  assert.deepEqual(details.languages,['en','de']); assert.equal(details.ethnicity,'european'); assert.equal(details.nationality,'Niemiecka'); assert.equal(details.zodiac_sign,'Bliźnięta');
  assert.equal(details.unknown_fields['Nietypowe pole'],'wartość');
});

test('Hermes deduplicates supported services and reports unmapped public tags', () => {
  const result=mapImportedServiceValues(['Massage','Massage','GFE','Nieznany fetysz','Nieznany fetysz']);
  assert.deepEqual(result.mapped,['masaz','klimat_gfe']);
  assert.deepEqual(result.unmapped,['Nieznany fetysz']);
});

test('Escort Club parser reads the real profile DOM sections without ads or SEO title leakage', () => {
  const html = `<!doctype html><html><head><title>Wolfie 23 lat, Berlin - anonse erotyczne - Escort.club</title>
    <script type="application/ld+json">{"location":{"address":{"addressLocality":"Berlin"}}}</script></head><body>
    <aside><img src="https://ads.example/banner.jpg"><a class="tag">Popularne miasta</a></aside>
    <h1>Wolfie</h1><div class="content-contact"><a data-phone-id="140605" data-show-phone>+49 301-...</a></div>
    <div class="content-hours"><div class="label">Więcej o mnie:</div><div class="stats-box">
      <div class="stat-elem"><div class="sub-label">Płeć:</div><div class="sub-desc">Kobieta</div></div>
      <div class="stat-elem"><div class="sub-label">Orientacja:</div><div class="sub-desc">Hetero</div></div>
      <div class="stat-elem"><div class="sub-label">Wiek:</div><div class="sub-desc">23 l</div></div>
      <div class="stat-elem"><div class="sub-label">Wzrost:</div><div class="sub-desc">166 cm</div></div>
      <div class="stat-elem"><div class="sub-label">Waga:</div><div class="sub-desc">54 kg</div></div>
      <div class="stat-elem"><div class="sub-label">Biust:</div><div class="sub-desc">2, Naturalny</div></div>
      <div class="stat-elem"><div class="sub-label">Oczy:</div><div class="sub-desc">Niebieskie</div></div>
      <div class="stat-elem"><div class="sub-label">Włosy:</div><div class="sub-desc">Brązowe</div></div>
      <div class="stat-elem"><div class="sub-label">Wyjazdy:</div><div class="sub-desc">Tylko hotele</div></div>
      <div class="stat-elem -lang"><div class="sub-label">Języki:</div><div class="sub-desc">Angielski, Niemiecki</div></div>
      <div class="stat-elem"><div class="sub-label">Etniczność:</div><div class="sub-desc">Europejska (biała)</div></div>
      <div class="stat-elem"><div class="sub-label">Narodowość:</div><div class="sub-desc">Niemiecka</div></div>
      <div class="stat-elem"><div class="sub-label">Znak zodiaku:</div><div class="sub-desc">Bliźnięta</div></div>
    </div></div><div class="contant-prices"><div class="stat-elem"><div class="sub-label">1 godz:</div><div class="sub-desc">250 EUR</div></div></div>
    <section class="anons-info-sec"><h2>Dodatkowe informacje</h2><div class="tags-box">
      <a class="tag">Masaż body to body</a><a class="tag">Face fucking</a><a class="tag">Nieznany tag</a>
    </div></section>
    <ul id="lightSlider"><li data-thumb="https://static.escort.club/galleries/wolfie/1.jpg"><a href="https://static.escort.club/galleries/wolfie/1.jpg"><img src="https://static.escort.club/galleries/wolfie/1.jpg"></a></li></ul>
    <section class="recommended"><img src="https://static.escort.club/galleries/other/advert.jpg"></section></body></html>`;
  const profile = parseEscortClubProfile(html, 'https://pl.escort.club/anons/140605.html');
  assert.ok(profile);
  assert.equal(profile.name, 'Wolfie'); assert.equal(profile.phone_id, '140605'); assert.equal(profile.city, 'Berlin');
  assert.deepEqual({ gender:profile.gender, orientation:profile.orientation, age:profile.age, height:profile.height_cm, weight:profile.weight_kg }, { gender:'female', orientation:'hetero', age:23, height:166, weight:54 });
  assert.equal(profile.bust, '2, Naturalny'); assert.equal(profile.eyes, 'Niebieskie'); assert.equal(profile.hair, 'Brązowe');
  assert.equal(profile.travel, 'Tylko hotele'); assert.equal(profile.travels, false); assert.deepEqual(profile.visit_types, ['hotel']);
  assert.deepEqual(profile.languages, ['en','de']); assert.equal(profile.ethnicity, 'european'); assert.equal(profile.nationality, 'Niemiecka'); assert.equal(profile.zodiac_sign, 'Bliźnięta');
  assert.equal(profile.price_1h, 250); assert.deepEqual(profile.services, ['masaz_body_to_body','face_fucking']); assert.deepEqual(profile.unmapped_tags, ['Nieznany tag']);
  assert.deepEqual(profile.images, ['https://static.escort.club/galleries/wolfie/1.jpg']);
});

test('Hermes sponsored draft supports generated technical owner without a public email or password', async () => {
  const adminRouteSource=await readFile(new URL('../Back/src/routes/admin.ts',import.meta.url),'utf8');
  const adminPageSource=await readFile(new URL('../Front/src/pages/AdminPage.tsx',import.meta.url),'utf8');
  const createRoute=adminRouteSource.slice(adminRouteSource.indexOf("post('/import-profile-create"),adminRouteSource.indexOf("get('/business-profiles"));
  assert.match(createRoute, /optionalEmail\(\(incomingProfile as any\)\.owner_email\) \|\| await nextSponsoredImportEmail\(\)/);
  assert.match(createRoute, /if \(password && password\.length < 8\)/);
  assert.match(createRoute, /if \(authUser\?\.id\) await logAccountAccess/);
  assert.match(createRoute, /images_imported: imageImport\.imported/); assert.match(createRoute, /images_failed: imageImport\.failed/);
  assert.match(adminPageSource, /ID: \$\{result\.profile_id\}/);
  assert.doesNotMatch(adminPageSource, /hermesPassword|hermesConfirmPassword|admin\.hermes\.password|admin\.hermes\.confirmPassword/);
  assert.doesNotMatch(adminPageSource, /password:\s*hermes|confirmPassword:\s*hermes/);
  assert.match(adminPageSource, /disabled=\{hermesBusy \|\| !hermesPreview \|\| !\(hermesPreview\.source_url \|\| hermesUrl\.trim\(\)\)\}/);
});

test('Hermes preview fields are forwarded to sponsored draft payload and image failures stay partial', async () => {
  const adminRouteSource=await readFile(new URL('../Back/src/routes/admin.ts',import.meta.url),'utf8');
  const adminPageSource=await readFile(new URL('../Front/src/pages/AdminPage.tsx',import.meta.url),'utf8');
  assert.match(adminRouteSource,/\.\.\.incomingProfile,[\s\S]*phone: normalizeImportedPhone\(\(incomingProfile as any\)\.phone\)/);
  for(const field of ['gender','orientation','height_cm','weight_kg','bust','eyes','hair','travel','languages','ethnicity','nationality','zodiac_sign']) assert.match(adminPageSource,new RegExp(`hermesPreview\\.${field}`));
  assert.match(adminRouteSource,/is_sponsored: true/); assert.match(adminRouteSource,/is_published: false/); assert.match(adminRouteSource,/moderation_status: 'pending'/);
  assert.match(adminRouteSource,/const imageImport = await importProfileImagesToStorage/); assert.match(adminRouteSource,/failed_images: imageImport\.failed/);
  assert.match(adminRouteSource,/deleteUser\(authUser\.id\)/); assert.match(adminRouteSource,/stage: 'create profile'/);
  assert.match(adminRouteSource,/if \(authUserCreated && authUser\?\.id\) await supabaseAdmin\.auth\.admin\.deleteUser/);
  assert.match(adminRouteSource,/subscription_status: 'incomplete'/); assert.doesNotMatch(adminRouteSource.slice(adminRouteSource.indexOf("post('/import-profile-create"),adminRouteSource.indexOf("get('/business-profiles")),/subscription_status: 'active'|subscription_status: 'trial'/);
  const publicRouteSource=await readFile(new URL('../Back/src/routes/profiles.ts',import.meta.url),'utf8');
  assert.match(publicRouteSource,/admin_note, subscription_note, source_url, import_source, imported_at/);
  assert.match(adminRouteSource,/Unmapped tags:/); assert.match(adminRouteSource,/Unknown fields:/); assert.match(adminRouteSource,/slice\(0, 4000\)/);
});
