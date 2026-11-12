import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { clientOfficeSections, resolveClientOfficeSection } from '../Front/src/components/client-dashboard/ClientOfficeShell';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('client office sections follow the global mobile navigation hashes', () => {
  assert.deepEqual(clientOfficeSections, ['overview', 'favorites', 'bookings', 'messages', 'wallet', 'referrals', 'settings']);
  assert.equal(resolveClientOfficeSection('', null), 'overview');
  assert.equal(resolveClientOfficeSection('#favorites', null), 'favorites');
  assert.equal(resolveClientOfficeSection('#messages', 'wallet'), 'messages');
  assert.equal(resolveClientOfficeSection('', 'referrals'), 'referrals');
  assert.equal(resolveClientOfficeSection('#unknown', 'nope'), 'overview');
});

test('client office Premium state is the backend client activation, not the entitlement row', async () => {
  const dashboard = await read('Front/src/pages/DashboardPage.tsx');
  const client = dashboard.slice(dashboard.indexOf('function ClientDashboard('), dashboard.indexOf('function ClientProfileTile('));
  assert.match(client, /const activated = activation\?\.state === 'client_activated'/);
  assert.doesNotMatch(client, /entitlement_type === 'client_premium'/);
  // FREE: no referral link, so no QR is generated.
  assert.match(client, /const referralLink = activated \?/);
  // No invented counters.
  assert.doesNotMatch(client, /\|\| Math\.min\(marketProfiles\.length/);
  assert.doesNotMatch(dashboard, /setMessage\(t\('dashboard\.client\.ready'\)\)/);
});

test('legacy gift route is retired and can no longer charge a caller-chosen price', async () => {
  const route = await read('Back/src/routes/clientActivation.ts');
  const handler = route.slice(route.indexOf("clientActivationRouter.post('/gifts'"), route.indexOf("clientActivationRouter.post('/vip-gallery-unlocks'"));
  assert.match(handler, /status\(410\)/);
  assert.match(handler, /charged: false/);
  assert.doesNotMatch(handler, /grantCoins|coin_cost|from\('gifts'\)/);
  const [api, profilePage] = await Promise.all([read('Front/src/lib/api.ts'), read('Front/src/pages/ProfilePage.tsx')]);
  assert.doesNotMatch(api, /\/api\/client-activation\/gifts/);
  assert.doesNotMatch(profilePage, /api\.sendGift\(/);
});

test('public profile and cards show no invented rating, Live Cam promise or owner-only visibility reason', async () => {
  const [profilePage, card] = await Promise.all([read('Front/src/pages/ProfilePage.tsx'), read('Front/src/components/ProfileCard.tsx')]);
  assert.doesNotMatch(profilePage, /4\.9/);
  assert.doesNotMatch(profilePage, /profile\.liveCam/);
  assert.doesNotMatch(card, /reviewCount|4\.6/);
  assert.match(card, /showVisibilityReason && profile\.visibility_reason/);
  // Video chat and gifts are presented as unavailable, never as an operational paid action.
  assert.match(profilePage, /profilePremium\.giftsSoon/);
  assert.match(profilePage, /profile\.videoChatUnavailable/);
});

test('registration copy keeps a free account separate from the paid Premium activation', async () => {
  for (const language of ['pl', 'de', 'en']) {
    const messages = JSON.parse(await read(`Front/src/locales/${language}.json`)) as Record<string, string>;
    for (const key of ['auth.createFreeAccess', 'auth.createFreeClientAccount', 'auth.clientBenefitFree']) {
      assert.doesNotMatch(messages[key], /premium/i, `${language}:${key}`);
    }
  }
});

test('Business Center adds earnings and subscription sections without BC renewal', async () => {
  const dashboard = await read('Front/src/pages/DashboardPage.tsx');
  const subscription = dashboard.slice(dashboard.indexOf('function AdvertiserSubscriptionSection('), dashboard.indexOf('function AdvertiserSubscriptionProgress('));
  assert.match(subscription, /businessCenter\.subscription\.renewalBc/);
  assert.match(subscription, /clientDash\.features\.unavailable/);
  assert.doesNotMatch(subscription, /activateBcuProduct|api\.activate/);
  assert.match(dashboard, /activeSection === 'earnings'[\s\S]*DigitalRevenuePanel/);
});

test('cold-start session timeout does not log out a session the auth listener already activated', async () => {
  const dashboard = await read('Front/src/pages/DashboardPage.tsx');
  const errorPath = dashboard.slice(dashboard.indexOf("'[DashboardAuth] initial-session-error'"), dashboard.indexOf("supabase.auth.onAuthStateChange"));
  assert.match(errorPath, /if \(sessionActivatedRef\.current\) return;/);
  assert.match(errorPath, /withTimeout\(supabase\.auth\.getSession\(\), 10000/);
  assert.ok(errorPath.indexOf('withTimeout(supabase.auth.getSession(), 10000') < errorPath.indexOf("navigate(`/login?next="));
});

test('customer booking history is paged and working features are not labelled as coming soon', async () => {
  const [bookings, commPlus] = await Promise.all([read('Front/src/components/bookings/ClientBookingsCard.tsx'), read('Front/src/components/CommunicationPlusCard.tsx')]);
  assert.match(bookings, /visible\.slice\(0, pageSize\)/);
  assert.match(bookings, /bookings\.showMore/);
  assert.doesNotMatch(commPlus, /communicationPlus\.liveChat'\)\} <small>\{t\('communicationPlus\.comingSoon'\)/);
  assert.doesNotMatch(commPlus, /communicationPlus\.booking'\)\} <small>\{t\('communicationPlus\.comingSoon'\)/);
});

test('FanPage keeps real data only and no unverified business price in the advertiser plan label', async () => {
  const [home, dashboard] = await Promise.all([read('Front/src/pages/HomePage.tsx'), read('Front/src/pages/DashboardPage.tsx')]);
  assert.match(home, /PremiumProfileTile key=\{profile\.id\} profile=\{profile\}/);
  assert.doesNotMatch(home, /static-tabs/);
  assert.doesNotMatch(dashboard, /Premium Business 49,99/);
  for (const language of ['pl', 'de', 'en']) {
    const messages = JSON.parse(await read(`Front/src/locales/${language}.json`)) as Record<string, string>;
    const landing = Object.entries(messages).filter(([key]) => key.startsWith('landing.')).map(([, value]) => value).join(' ');
    assert.doesNotMatch(landing, /\b\d{2,}\s*(\+|%|k\b)|Live Cam|wideoczat dostępny/i, language);
  }
});

test('registration offers Premium customer and individual advertiser; ESCORT Office Center is disabled everywhere', async () => {
  const [register, auth, pricing] = await Promise.all([read('Front/src/pages/RegisterPage.tsx'), read('Back/src/routes/auth.ts'), read('Front/src/pages/PricingPage.tsx')]);
  assert.match(register, /const selectableAccountTypes = \['client', 'escort'\] as const;/);
  assert.match(register, /data-account-type="business"/);
  assert.match(register, /aria-disabled="true"/);
  assert.match(register, /requestedType === 'business'[\s\S]*setAuthAccountType\('client'\)/);
  assert.match(auth, /authAccountType === 'business'[\s\S]*status\(403\)[\s\S]*ESCORT_OFFICE_CENTER_NOT_AVAILABLE/);
  assert.match(pricing, /item\.id !== 'agency_30d' \|\| requestedProduct === 'agency_30d'/);
  const labels = await Promise.all(['pl', 'de', 'en'].map(async (language) => JSON.parse(await read(`Front/src/locales/${language}.json`))['register.path.comingSoon']));
  assert.deepEqual(labels, ['W przygotowaniu', 'In Entwicklung', 'Coming Soon']);
  const de = JSON.parse(await read('Front/src/locales/de.json')) as Record<string, string>;
  assert.equal(de['register.client.title'], 'Premium-Zugang einmalig 0,99 €');
  for (const key of Object.keys(de).filter((item) => item.startsWith('register.client.'))) assert.doesNotMatch(de[key], /49[,.]99|499/, key);
});

test('Google sign-in is only started when the provider is enabled, and the customer goes to checkout once', async () => {
  const [register, login, dashboard, providers] = await Promise.all([
    read('Front/src/pages/RegisterPage.tsx'), read('Front/src/pages/LoginPage.tsx'), read('Front/src/pages/DashboardPage.tsx'), read('Front/src/lib/authProviders.ts')
  ]);
  assert.match(providers, /\/auth\/v1\/settings/);
  assert.match(providers, /external\[provider\] === true \? 'enabled' : 'disabled'/);
  for (const source of [register, login]) {
    assert.match(source, /if \(googleState !== 'enabled'\) return setMessage\(t\('register\.google\.unavailable'\)\)/);
    assert.match(source, /disabled=\{loading \|\| googleState !== 'enabled'\}/);
  }
  assert.match(dashboard, /localStorage\.removeItem\(PREMIUM_CHECKOUT_INTENT_KEY\);\s*if \(clientData\.activation\?\.state !== 'client_activated'\) \{\s*navigate\('\/pricing\?product=client_activation'\)/);
});
