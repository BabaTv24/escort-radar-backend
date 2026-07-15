import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CityImportDiscoveryError,
  discoverCityProfiles,
  extractEscortClubProfileUrls,
  isEscortClubProfileUrl,
  isSourceUrlDuplicateError,
  normalizeCityImportLimit,
  normalizeCityListingUrl,
  normalizeProfileSourceUrl
} from '../Back/src/cityImportDiscovery.ts';

const listingUrl = 'https://pl.escort.club/anonse/towarzyskie/bydgoszcz/';

test('city listing URL normalization removes tracking and fragments and keeps one trailing slash', () => {
  assert.equal(
    normalizeCityListingUrl('https://pl.escort.club//anonse/towarzyskie/bydgoszcz?utm_source=test&sort=new#profiles'),
    'https://pl.escort.club/anonse/towarzyskie/bydgoszcz/?sort=new'
  );
});

test('profile source URL normalization matches query hash host and trailing slash variants', () => {
  assert.equal(
    normalizeProfileSourceUrl('HTTPS://PL.ESCORT.CLUB:443/anons/140605.html/?utm_source=city&sort=new#contact'),
    'https://pl.escort.club/anons/140605.html?sort=new'
  );
  assert.equal(normalizeProfileSourceUrl('http://example.com:80/profile/'), 'http://example.com/profile');
});

test('duplicate database errors are recognized only for normalized source URL uniqueness', () => {
  assert.equal(isSourceUrlDuplicateError({ code: '23505', message: 'profiles_source_url_normalized_unique_idx' }), true);
  assert.equal(isSourceUrlDuplicateError({ code: '23505', message: 'profiles_slug_key' }), false);
  assert.equal(isSourceUrlDuplicateError({ code: '23503', message: 'source_url_normalized' }), false);
});

test('city discovery rejects credentials, unsupported hosts and private SSRF targets', () => {
  for (const value of [
    'http://localhost/anonse/towarzyskie/test/',
    'http://127.0.0.1/anonse/towarzyskie/test/',
    'http://169.254.169.254/anonse/towarzyskie/test/'
  ]) {
    assert.throws(() => normalizeCityListingUrl(value), (error: unknown) => error instanceof CityImportDiscoveryError && error.code === 'blocked_address');
  }
  assert.throws(
    () => normalizeCityListingUrl('https://user:secret@pl.escort.club/anonse/towarzyskie/test/'),
    (error: unknown) => error instanceof CityImportDiscoveryError && error.code === 'invalid_url'
  );
  assert.throws(
    () => normalizeCityListingUrl('https://example.com/anonse/towarzyskie/test/'),
    (error: unknown) => error instanceof CityImportDiscoveryError && error.code === 'unsupported_host'
  );
});

test('city profile extraction resolves relative links, normalizes and deduplicates a saved HTML sample', () => {
  const html = `<!doctype html><html><body>
    <a href="/anonse/towarzyskie/bydgoszcz/">Miasto</a>
    <a href="/anons/140605.html?utm_source=city#kontakt">Anna</a>
    <a href="https://pl.escort.club/anons/140605.html">Anna duplicate</a>
    <a href="https://de.escort.club/anons/247251.html?fbclid=tracking">Wolfie</a>
    <a href="/anons/add">Add profile</a>
    <a href="/anons/abc.html">Invalid profile id</a>
    <a href="/anons/247251">Missing extension</a>
    <a href="?page=2">Następna strona</a>
    <a href="/login">Logowanie</a>
    <a href="https://example.com/anons/999.html">External</a>
  </body></html>`;
  assert.deepEqual(extractEscortClubProfileUrls(html, listingUrl), [
    'https://pl.escort.club/anons/140605.html',
    'https://de.escort.club/anons/247251.html'
  ]);
});

test('escort.club profile URL requires a numeric id and html pathname', () => {
  assert.equal(isEscortClubProfileUrl('https://pl.escort.club/anons/247251.html'), true);
  assert.equal(isEscortClubProfileUrl('https://pl.escort.club/anons/add'), false);
  assert.equal(isEscortClubProfileUrl('https://pl.escort.club/anons/abc.html'), false);
  assert.equal(isEscortClubProfileUrl('https://pl.escort.club/anons/247251'), false);
  assert.equal(isEscortClubProfileUrl('https://pl.escort.club/anonse/247251.html'), false);
});

test('city discovery applies safe default 30 and hard maximum 50', () => {
  assert.equal(normalizeCityImportLimit(undefined), 30);
  assert.equal(normalizeCityImportLimit(0), 30);
  assert.equal(normalizeCityImportLimit(500), 50);
  const html = Array.from({ length: 60 }, (_, index) => `<a href="/anons/${index + 1}.html">P${index + 1}</a>`).join('');
  assert.equal(extractEscortClubProfileUrls(html, listingUrl).length, 30);
  assert.equal(extractEscortClubProfileUrls(html, listingUrl, 50).length, 50);
  assert.equal(extractEscortClubProfileUrls(html, listingUrl, 500).length, 50);
});

test('city discovery returns no_profiles_found without making a real request', async () => {
  const fetchResource = async () => new Response('<html><body><a href="/login">Login</a></body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
  await assert.rejects(
    discoverCityProfiles({ listing_url: listingUrl }, { fetchResource }),
    (error: unknown) => error instanceof CityImportDiscoveryError && error.code === 'no_profiles_found'
  );
});

test('city discovery route is behind the existing admin middleware', async () => {
  const source = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const authSource = await readFile(new URL('../Back/src/middleware/auth.ts', import.meta.url), 'utf8');
  const guardIndex = source.indexOf('adminRouter.use(verifyAdminJwt, requireAdmin)');
  const routeIndex = source.indexOf("adminRouter.post('/import-city/discover'");
  assert.ok(guardIndex >= 0 && routeIndex > guardIndex);
  assert.match(authSource, /export function requireAdmin[\s\S]*role === 'admin'[\s\S]*status\(403\)[\s\S]*Admin access required/);
});

test('migration 050 blocks duplicate backfill and atomically protects concurrent normalized URLs', async () => {
  const migration = await readFile(new URL('../supabase/migrations/050_profile_source_url_normalized_unique.sql', import.meta.url), 'utf8');
  const precheck = await readFile(new URL('../scripts/sql/050_profile_source_url_duplicates_precheck.sql', import.meta.url), 'utf8');
  assert.match(migration, /add column if not exists source_url_normalized text/);
  assert.match(migration, /having count\(\*\) > 1[\s\S]*manual cleanup is required/);
  assert.match(migration, /create unique index if not exists profiles_source_url_normalized_unique_idx[\s\S]*where source_url_normalized is not null/);
  assert.match(migration, /before insert or update of source_url[\s\S]*sync_profile_source_url_normalized/);
  assert.doesNotMatch(`${migration}\n${precheck}`, /pg_catalog\.coalesce/i);
  assert.match(migration, /coalesce\(v_query_normalized, ''\)/);
  assert.match(precheck, /coalesce\(q\.normalized_query, ''\)/);
});

test('existing manual create request stays compatible and duplicate conflicts never return 500', async () => {
  const source = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const createRoute = source.slice(source.indexOf("adminRouter.post('/import-profile-create'"), source.indexOf("adminRouter.get('/business-profiles'"));
  assert.match(createRoute, /req\.body\.source_url/);
  assert.match(createRoute, /req\.body\.profile/);
  assert.match(createRoute, /req\.body\.imageUrls/);
  assert.match(createRoute, /res\.status\(201\)\.json/);
  assert.match(createRoute, /isSourceUrlDuplicateError\(error\)[\s\S]*res\.status\(409\)\.json\(\{ error: 'duplicate_source_url', status: 'skipped_duplicate'/);
  assert.doesNotMatch(createRoute, /isSourceUrlDuplicateError\(error\)[\s\S]{0,200}status\(500\)/);
});

test('manual profile import keeps a localized readable duplicate conflict', async () => {
  const source = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  const createDraft = source.slice(source.indexOf('async function createHermesDraft'), source.indexOf('function updateHermesPreview'));
  assert.match(createDraft, /isDuplicateSourceUrlApiError\(error\)/);
  assert.match(createDraft, /admin\.cityImport\.status\.skipped_duplicate/);
});
