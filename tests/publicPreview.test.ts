import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role';
process.env.SUPABASE_ANON_KEY ||= 'test-anon';
const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('commercial operations default to off when the flag is missing', async () => {
  const previous = process.env.COMMERCIAL_OPERATIONS_ENABLED;
  delete process.env.COMMERCIAL_OPERATIONS_ENABLED;
  const { config } = await import('../Back/src/config.ts');
  const { publicPlatformStatus } = await import('../Back/src/commercialOperations.ts');
  if (previous === undefined) {
    assert.equal(config.commercialOperationsEnabled, false);
    assert.deepEqual(publicPlatformStatus(), { mode: 'public_preview', commercial_operations_enabled: false, advertiser_registration_open: false, purchases_enabled: false });
  }
  const source = await read('../Back/src/config.ts');
  assert.match(source, /commercialOperationsEnabled: envBoolean\('COMMERCIAL_OPERATIONS_ENABLED', false\)/);
  if (previous !== undefined) process.env.COMMERCIAL_OPERATIONS_ENABLED = previous;
});

test('every purchase, callback and payment approval is gated on the server', async () => {
  const [payments, activation, tokens, webhook, admin, auth] = await Promise.all([
    read('../Back/src/routes/payments.ts'),
    read('../Back/src/routes/clientActivation.ts'),
    read('../Back/src/routes/tokens.ts'),
    read('../Back/src/routes/stripeWebhook.ts'),
    read('../Back/src/routes/admin.ts'),
    read('../Back/src/routes/auth.ts')
  ]);
  for (const route of ['/client-activation/checkout', '/escort-subscription/checkout', '/business-subscription/checkout', '/coins/checkout', '/manual-orders', '/create-order']) {
    assert.match(payments, new RegExp(`paymentsRouter\\.post\\('${route.replace(/\//g, '\\/')}', verifyUser, requireCommercialOperations,`), route);
  }
  assert.match(payments, /const products = commercial \? manualPaymentProducts\.filter/);
  assert.match(activation, /clientActivationRouter\.post\('\/checkout', requireCommercialOperations,/);
  assert.match(activation, /clientActivationRouter\.post\('\/confirm', requireCommercialOperations,/);
  assert.match(tokens, /tokensRouter\.post\('\/purchase-intent', verifyUser, requireCommercialOperations,/);
  assert.match(webhook, /if \(!isCommercialOperationsEnabled\(\)\) return res\.status\(410\)/);
  const approve = admin.slice(admin.indexOf("adminRouter.post('/manual-payment-orders/:id/approve'"));
  assert.match(approve.slice(0, 400), /if \(!isCommercialOperationsEnabled\(\)\) return sendCommercialOperationsDisabled\(res\);/);
  assert.match(admin, /if \(status === 'approved' && !isCommercialOperationsEnabled\(\)\) return sendCommercialOperationsDisabled\(res\);/);
  assert.match(auth, /authAccountType === 'escort' && !isCommercialOperationsEnabled\(\)[\s\S]{0,200}ADVERTISER_REGISTRATION_CLOSED/);
});

test('profile creation cannot take test-account status from the request or the e-mail address', async () => {
  const profiles = await read('../Back/src/routes/profiles.ts');
  assert.doesNotMatch(profiles, /req\.body\.is_test_account/);
  assert.doesNotMatch(profiles, /isSafeTestEmail/);
  assert.match(profiles, /const isTestAccount = false;/);
});

test('collector accepts only known, well-formed events', async () => {
  const { validateTrafficEvent } = await import('../Back/src/trafficAnalytics.ts');
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
  const ok = validateTrafficEvent({ type: 'profile_view', path: '/profile/:id', profile_ref: 'abc-123' }, ua);
  assert.ok(ok.accepted && ok.row.profile_ref === 'abc-123' && ok.row.device === 'desktop');
  for (const bad of [
    { type: 'purchase' },
    { type: 'page_view', wd: true },
    { type: 'page_view', path: '/profile/x?email=a@b.c' },
    { type: 'page_view', path: '/admin/traffic' },
    { type: 'profile_view', path: '/profile/:id' },
    { type: 'city_search' },
    { type: 'profile_view', profile_ref: 'a b' }
  ]) assert.equal(validateTrafficEvent(bad, ua).accepted, false, JSON.stringify(bad));
  const city = validateTrafficEvent({ type: 'city_search', city: 'Berlin' }, ua);
  assert.ok(city.accepted && city.row.city === 'berlin');
  const source = validateTrafficEvent({ type: 'page_view', path: '/', source: 'https://evil.example/?q=1' }, ua);
  assert.ok(source.accepted && source.row.source === null, 'unexpected source text is dropped, not stored');
});

test('bots, devices, countries and hashing', async () => {
  const { isAutomatedUserAgent, deviceFromUserAgent, countryFromHeaders, clientAddressFromHeaders, visitorHash, TrafficRateLimiter } = await import('../Back/src/trafficAnalytics.ts');
  for (const bot of ['', 'curl/8.0', 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'Mozilla/5.0 (X11) HeadlessChrome/130.0 Safari', 'python-requests/2.31', 'Mozilla/5.0 Playwright/1.48 Chrome']) assert.equal(isAutomatedUserAgent(bot), true, bot);
  assert.equal(isAutomatedUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'), false);
  assert.equal(deviceFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile Safari'), 'mobile');
  assert.equal(deviceFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0) Safari'), 'tablet');
  assert.equal(deviceFromUserAgent('Mozilla/5.0 (Linux; Android 14; SM-X200) Safari'), 'tablet');
  assert.equal(deviceFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome'), 'desktop');
  assert.equal(countryFromHeaders({ 'cf-ipcountry': 'de' }), 'DE');
  assert.equal(countryFromHeaders({ 'cf-ipcountry': 'XX' }), null);
  assert.equal(countryFromHeaders({}), null);
  assert.equal(clientAddressFromHeaders({ 'x-forwarded-for': '203.0.113.1, 10.0.0.1' }, '10.0.0.2'), '203.0.113.1');
  const a = visitorHash('salt-one', '203.0.113.1', 'UA');
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.equal(visitorHash('salt-one', '203.0.113.1', 'UA'), a);
  assert.notEqual(visitorHash('salt-two', '203.0.113.1', 'UA'), a, 'a new daily salt makes the visitor unlinkable');
  assert.ok(!a.includes('203'));
  const limiter = new TrafficRateLimiter(3, 1000);
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.allow('k', 0)), [true, true, true, false]);
  assert.equal(limiter.allow('k', 1000), true);
});

test('frontend tracking sends route templates only, never query strings or identifiers', async () => {
  const { describeRoute } = await import('../Front/src/lib/analytics.ts');
  assert.deepEqual(describeRoute('/', ''), { path: '/', radar: true });
  assert.deepEqual(describeRoute('/city/Berlin', '?country=DE&category=ladies'), { path: '/city/:city', city: 'berlin', radar: true });
  assert.deepEqual(describeRoute('/profile/abc-1', '?x=1'), { path: '/profile/:id', profileRef: 'abc-1' });
  assert.deepEqual(describeRoute('/pricing', '?product=client_activation'), { path: '/pricing', premiumIntent: true, advertiserIntent: false });
  assert.deepEqual(describeRoute('/register', '?type=escort'), { path: '/register', premiumIntent: false, advertiserIntent: true });
  assert.deepEqual(describeRoute('/r/ABC123', ''), { path: '/r/:code' });
  assert.deepEqual(describeRoute('/something/unknown', ''), { path: '/other' });
  const source = await read('../Front/src/lib/analytics.ts');
  assert.match(source, /PRODUCTION_HOSTS = \['escort-radar\.fun', 'www\.escort-radar\.fun'\]/);
  assert.match(source, /nav\.webdriver/);
  assert.match(source, /doNotTrack === '1' \|\| nav\.globalPrivacyControl === true/);
  assert.match(source, /credentials: 'omit'/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
});

test('analytics storage is pseudonymous, retained 90 days and closed to clients', async () => {
  const migration = await read('../supabase/migrations/062_traffic_analytics.sql');
  const tableColumns = migration.slice(migration.indexOf('create table if not exists public.traffic_events'), migration.indexOf('create index'));
  assert.doesNotMatch(tableColumns, /\bip\b|user_agent|email|user_id/i);
  assert.match(migration, /revoke all on public\.traffic_events from anon, authenticated;/);
  assert.match(migration, /revoke all on public\.traffic_salts from anon, authenticated;/);
  assert.match(migration, /revoke all on function public\.traffic_summary\(integer\) from public, anon, authenticated;/);
  assert.match(migration, /grant execute on function public\.traffic_summary\(integer\) to service_role;/);
  assert.match(migration, /p_retention_days integer default 90/);
  assert.match(migration, /delete from public\.traffic_salts/);
});

test('registration and pricing show the preview messages in DE/PL/EN', async () => {
  const [de, pl, en, register, pricing] = await Promise.all([
    read('../Front/src/locales/de.json').then(JSON.parse),
    read('../Front/src/locales/pl.json').then(JSON.parse),
    read('../Front/src/locales/en.json').then(JSON.parse),
    read('../Front/src/pages/RegisterPage.tsx'),
    read('../Front/src/pages/PricingPage.tsx')
  ]);
  assert.equal(de['register.advertiserClosed'], 'Registrierung für Inserenten startet in Kürze.');
  assert.equal(pl['register.advertiserClosed'], 'Rejestracja ogłoszeniodawców już wkrótce.');
  assert.equal(en['register.advertiserClosed'], 'Advertiser registration opens soon.');
  for (const locale of [de, pl, en]) assert.ok(locale['preview.purchasesUnavailable']);
  assert.match(register, /data-account-type="escort"/);
  assert.match(pricing, /!platform\.commercial_operations_enabled \? \(\s*<p className="subscription-notice" role="status">\{t\('preview\.purchasesUnavailable'\)\}/);
});
