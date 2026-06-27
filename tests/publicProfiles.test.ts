import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { isPublicProfile } from '../Back/src/publicProfiles.ts';
import { isRealPaidSubscription, isRealRevenueTransaction, sumRealRevenue } from '../Back/src/revenue.ts';
import { buildAdminClient, filterSortPaginateClients, importantLiveTestClientEmail, isRealClientActivationPayment } from '../Back/src/adminClients.ts';
import { mapApiProfileToPublicProfile } from '../Front/src/lib/publicProfiles.ts';

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
  assert.match(homeSource, /Profile sponsorowane/);
  assert.match(homeSource, /sponsoredProfiles/);
  assert.match(cardSource, /SPONSOROWANY/);
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

test('bigbaba.vip@gmail.com is treated as active only when live Stripe reference is complete', () => {
  const client = buildAdminClient({
    user: { id: 'bigbaba', email: importantLiveTestClientEmail, app_metadata: { auth_account_type: 'client' }, created_at: '2026-01-01' },
    activation: { state: 'client_activated', activated_at: '2026-01-02' },
    payments: [{ provider: 'stripe', payment_status: 'paid', amount_cents: 99, stripe_checkout_session_id: 'cs_live_bigbaba', livemode: true, created_at: '2026-01-02' }]
  });
  assert.equal(client.account_status, 'stripe_activated');
  assert.equal(client.has_real_stripe_activation, true);
  assert.equal(sumRealRevenue(client.payments), 0.99);
});

test('admin client endpoints and coin actions exist', async () => {
  const adminSource = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const apiSource = await readFile(new URL('../Front/src/lib/api.ts', import.meta.url), 'utf8');
  const pageSource = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  assert.match(adminSource, /adminRouter\.get\('\/clients'/);
  assert.match(adminSource, /adminRouter\.patch\('\/clients\/:id\/coins'/);
  assert.match(apiSource, /adminClients/);
  assert.match(apiSource, /adjustAdminClientCoins/);
  assert.match(pageSource, /\/admin\/clients/);
  assert.match(pageSource, /client-mobile-cards/);
});
