import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role';
process.env.SUPABASE_ANON_KEY ||= 'test-anon';
const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');
const load = () => import('../Back/src/publicContactRedaction.ts');

// Synthetic contact values only (reserved/test numbers and handles).
test('masks phone numbers, e-mail, links and messenger handles', async () => {
  const { redactPublicContactText, CONTACT_MASK } = await load();
  const cases: Array<[string, number]> = [
    ['Call me: +49 151 23456789 anytime', 1],
    ['Ruf an +49 (0) 30 1234567', 1],
    ['WhatsApp: +4 9 1 5 1 2 3 4 5 6 7', 1],
    ['Handy 0151 23456789', 1],
    ['Tel. 030/1234567-0', 1],
    ['0048 512 345 678', 1],
    ['numer: 512 345 678', 1],
    ['WhatsApp 512-345-678 bitte', 1],
    ['Mail: test.user@example.com', 1],
    ['Telegram: @example_handle', 1],
    ['My telegram @Example_99', 1],
    ['Snapchat: example.user', 1],
    ['Instagram = example_user', 1],
    ['https://t.me/example_user or wa.me/4915123456789', 2]
  ];
  for (const [input, expected] of cases) {
    const result = redactPublicContactText(input);
    assert.equal(result.redactions, expected, `${input} -> ${result.text}`);
    assert.ok(result.text.includes(CONTACT_MASK));
    assert.doesNotMatch(result.text, /\d{6,}|@\w|example_|example\.|t\.me|wa\.me/, `${input} -> ${result.text}`);
  }
});

test('keeps legitimate description content (no false positives)', async () => {
  const { redactPublicContactText } = await load();
  for (const text of [
    'Preise: 30 min 150 €, 1h 200 €, 2h 350 €, Nacht 900 €',
    '200 300 500 800 EUR',
    'Größe 170 cm, 55 kg, Maße 90-60-90, 24 Jahre',
    'Termine 10:00-22:00, 24/7 nach Absprache, am 01.12.2026 ab 20 Uhr',
    'Berlin 10115 Mitte, Anfahrt bis 25 km',
    'Contact me on WhatsApp or call me. Kontakt nur per WhatsApp.',
    'Ich spreche Deutsch, English, Polski. Treffen im Hotel oder bei mir.',
    'Napisz do mnie na Telegramie, odpowiem szybko ❤️',
    'Year 2025, 3 hours 450, 6 hours 800'
  ]) {
    const result = redactPublicContactText(text);
    assert.equal(result.redactions, 0, `${text} -> ${result.text}`);
    assert.equal(result.text, text);
  }
});

test('profile payload: free-text fields masked, other fields untouched', async () => {
  const { redactPublicProfileText } = await load();
  const input = { id: 'p1', display_name: 'Anna', city: 'berlin', price_1h: 200, description: 'Hi! Telegram: @example_handle, Preis 200 €', availability_note: 'SMS 0151 23456789', service_menu: [{ name: 'Dinner', note: 'mail me test@example.com', extra_price: 50 }] };
  const output = redactPublicProfileText(input);
  assert.equal(output.description, 'Hi! Telegram: […], Preis 200 €');
  assert.equal(output.availability_note, 'SMS […]');
  assert.equal(output.service_menu[0].note, 'mail me […]');
  assert.equal(output.service_menu[0].extra_price, 50);
  assert.equal(output.price_1h, 200);
  assert.equal(input.description, 'Hi! Telegram: @example_handle, Preis 200 €', 'the source object is not mutated');
});

test('every public profile output passes through the safeguard', async () => {
  const [profiles, favorites] = await Promise.all([read('../Back/src/routes/profiles.ts'), read('../Back/src/routes/favorites.ts')]);
  assert.match(profiles, /const publicProfile: any = redactPublicProfileText\(omitInternalProfileFields\(withInternalFields\)\);/);
  // List, Radar and single profile all use sanitizePublicProfile.
  assert.equal((profiles.match(/sanitizePublicProfile\(withImageUrls\(/g) || []).length >= 3, true);
  assert.match(favorites, /profile: row\.profiles \? publicProfilePayload\(row\.profiles\) : null/);
  assert.doesNotMatch(favorites, /profile: row\.profiles\s*\n/);
});

test('analytics: collection off by default, spoof-resistant address, pseudonym cap, unlinked profile views', async () => {
  const previous = process.env.ANALYTICS_COLLECTION_ENABLED;
  delete process.env.ANALYTICS_COLLECTION_ENABLED;
  const { config } = await import('../Back/src/config.ts');
  if (previous === undefined) {
    assert.equal(config.analyticsCollectionEnabled, false);
    assert.equal(config.analyticsTrustedProxyHops, 1);
    assert.equal(config.analyticsClientIpHeader, '');
  }
  const { clientAddressFromHeaders, DistinctVisitorCap, TRAFFIC_RETENTION_DAYS } = await import('../Back/src/trafficAnalytics.ts');
  // A client-supplied X-Forwarded-For prefix cannot change the address appended by the trusted proxy.
  for (const forged of ['1.1.1.1', '2.2.2.2, 3.3.3.3', '']) {
    const header = forged ? `${forged}, 198.51.100.7` : '198.51.100.7';
    assert.equal(clientAddressFromHeaders({ 'x-forwarded-for': header }, '10.0.0.1'), '198.51.100.7');
  }
  assert.equal(clientAddressFromHeaders({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '198.51.100.7' }, '10.0.0.1'), '198.51.100.7', 'edge headers are ignored unless configured');
  assert.equal(clientAddressFromHeaders({ 'cf-connecting-ip': '203.0.113.5' }, '10.0.0.1', { clientIpHeader: 'cf-connecting-ip' }), '203.0.113.5');
  assert.equal(clientAddressFromHeaders({ 'x-forwarded-for': 'a, b, c' }, 'x', { trustedProxyHops: 2 }), 'b');
  assert.equal(clientAddressFromHeaders({}, '10.0.0.9'), '10.0.0.9');
  const cap = new DistinctVisitorCap(5);
  const allowed = Array.from({ length: 8 }, (_, i) => cap.allow('2026-11-12', 'addr', `ua-${i}`));
  assert.deepEqual(allowed, [true, true, true, true, true, false, false, false]);
  assert.equal(cap.allow('2026-11-12', 'addr', 'ua-0'), true, 'a known visitor keeps counting');
  assert.equal(cap.allow('2026-11-13', 'addr', 'ua-7'), true, 'the cap resets daily');
  assert.equal(TRAFFIC_RETENTION_DAYS, 60);
  const [route, server, migration] = await Promise.all([read('../Back/src/routes/analytics.ts'), read('../Back/src/server.ts'), read('../supabase/migrations/062_traffic_analytics.sql')]);
  assert.match(route, /if \(!config\.analyticsCollectionEnabled\) return res\.status\(204\)\.end\(\);/);
  assert.match(route, /visitor_hash: profileView \? null : hash/);
  assert.match(route, /if \(profileView\) now\.setUTCMinutes\(0, 0, 0\);/);
  assert.match(server, /startTrafficRetention\(\);/);
  assert.match(migration, /\(event_type = 'profile_view' and visitor_hash is null\)/);
  assert.doesNotMatch(migration, /count\(distinct s\.visitor_hash\) as visitors,\s*p\.id/);
  if (previous !== undefined) process.env.ANALYTICS_COLLECTION_ENABLED = previous;
});
