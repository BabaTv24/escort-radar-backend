import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CityImportDiscoveryError,
  discoverCityProfiles,
  extractEscortClubListing,
  extractEscortClubProfileUrls,
  isEscortClubProfileUrl,
  isSourceUrlDuplicateError,
  normalizeCityImportLimit,
  normalizeCityListingUrl,
  normalizeProfileSourceUrl
} from '../Back/src/cityImportDiscovery.ts';

const listingUrl = 'https://pl.escort.club/anonse/towarzyskie/bydgoszcz/';
const poznanProductionUrl = 'https://pol.escort.club/anonse/towarzyskie/poznan/?province=30&district=&filter_price_type=&filter_price_eur=0%3B5000&filter_age=18%3B1';

test('city listing URL normalization removes tracking and fragments and keeps one trailing slash', () => {
  const normalizedPoznan = new URL(normalizeCityListingUrl(poznanProductionUrl));
  assert.equal(normalizedPoznan.origin, 'https://pol.escort.club');
  assert.equal(normalizedPoznan.pathname, '/anonse/towarzyskie/poznan/');
  assert.deepEqual(Object.fromEntries(normalizedPoznan.searchParams), {
    district: '', filter_age: '18;1', filter_price_eur: '0;5000', filter_price_type: '', province: '30'
  });
  assert.equal(
    normalizeCityListingUrl('https://pl.escort.club//anonse/towarzyskie/bydgoszcz?utm_source=test&sort=new#profiles'),
    'https://pl.escort.club/anonse/towarzyskie/bydgoszcz/?sort=new'
  );
  assert.equal(
    normalizeCityListingUrl('https://de.escort.club/erotikanzeigen/munchen'),
    'https://de.escort.club/erotikanzeigen/munchen/'
  );
  assert.equal(
    normalizeCityListingUrl('https://de.escort.club/erotikanzeigen/munchen/'),
    'https://de.escort.club/erotikanzeigen/munchen/'
  );
});

test('profile source URL normalization matches query hash host and trailing slash variants', () => {
  assert.equal(
    normalizeProfileSourceUrl('HTTPS://PL.ESCORT.CLUB:443/anons/140605.html/?utm_source=city&sort=new#contact'),
    'https://pl.escort.club/anons/140605.html?sort=new'
  );
  assert.equal(normalizeProfileSourceUrl('http://example.com:80/profile/'), 'http://example.com/profile');
  assert.equal(
    normalizeProfileSourceUrl('HTTPS://DE.ESCORT.CLUB:443/erotikanzeigen/220435.html/?utm_source=city#kontakt'),
    'https://de.escort.club/erotikanzeigen/220435.html'
  );
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
  for (const value of [
    'https://pol.escort.club.example.com/anonse/towarzyskie/poznan/',
    'https://escort.club.evil.com/anonse/towarzyskie/poznan/',
    'https://user:secret@pol.escort.club/anonse/towarzyskie/poznan/'
  ]) {
    assert.throws(() => normalizeCityListingUrl(value), (error: unknown) => error instanceof CityImportDiscoveryError && ['unsupported_host', 'invalid_url'].includes(error.code));
  }
  assert.throws(
    () => normalizeCityListingUrl('https://fr.escort.club/anonse/test/'),
    (error: unknown) => error instanceof CityImportDiscoveryError && error.code === 'unsupported_host'
  );
  assert.throws(
    () => normalizeCityListingUrl('http://de.escort.club/erotikanzeigen/munchen/'),
    (error: unknown) => error instanceof CityImportDiscoveryError && error.code === 'invalid_url'
  );
  assert.throws(
    () => normalizeCityListingUrl('https://de.escort.club/erotikanzeigen/220435.html'),
    (error: unknown) => error instanceof CityImportDiscoveryError && error.code === 'unsupported_listing'
  );
});

test('city profile extraction resolves relative links, normalizes and deduplicates a saved HTML sample', () => {
  const html = `<!doctype html><html><body><section class="content-sec -index"><h1>Anonse erotyczne Bydgoszcz</h1><div class="row">
    <div class="item-col"><span class="item-info"></span>
    <a href="/anonse/towarzyskie/bydgoszcz/">Miasto</a>
    <a href="/anons/140605.html?utm_source=city#kontakt">Anna</a>
    </div>
    <div class="item-col"><span class="item-info"></span><a href="https://pl.escort.club/anons/140605.html">Anna duplicate</a></div>
    <div class="item-col"><span class="item-info"></span>
    <a href="https://de.escort.club/erotikanzeigen/247251.html?fbclid=tracking">Wolfie</a>
    </div>
    <a href="/anons/add">Add profile</a>
    <a href="/anons/abc.html">Invalid profile id</a>
    <a href="/anons/247251">Missing extension</a>
    <a href="?page=2">Następna strona</a>
    <a href="/login">Logowanie</a>
    <a href="https://example.com/anons/999.html">External</a>
  </div></section></body></html>`;
  assert.deepEqual(extractEscortClubProfileUrls(html, listingUrl), [
    'https://pl.escort.club/anons/140605.html',
    'https://de.escort.club/erotikanzeigen/247251.html'
  ]);
});

test('escort.club profile URL requires a numeric id and html pathname', () => {
  assert.equal(isEscortClubProfileUrl('https://pol.escort.club/anons/247251.html'), true);
  assert.equal(isEscortClubProfileUrl('https://pl.escort.club/anons/247251.html'), true);
  assert.equal(isEscortClubProfileUrl('https://pl.escort.club/anons/add'), false);
  assert.equal(isEscortClubProfileUrl('https://pl.escort.club/anons/abc.html'), false);
  assert.equal(isEscortClubProfileUrl('https://pl.escort.club/anons/247251'), false);
  assert.equal(isEscortClubProfileUrl('https://pl.escort.club/anonse/247251.html'), false);
  assert.equal(isEscortClubProfileUrl('https://de.escort.club/erotikanzeigen/220435.html'), true);
  assert.equal(isEscortClubProfileUrl('https://de.escort.club/erotikanzeigen/munchen/'), false);
  assert.equal(isEscortClubProfileUrl('https://de.escort.club/anons/220435.html'), false);
  assert.equal(isEscortClubProfileUrl('https://fr.escort.club/anons/220435.html'), false);
  assert.equal(isEscortClubProfileUrl('http://de.escort.club/erotikanzeigen/220435.html'), false);
});

test('München discovery reads only the German main result container', async () => {
  const html = await readFile(new URL('./fixtures/escort-club-muenchen-listing.html', import.meta.url), 'utf8');
  const munichUrl = 'https://de.escort.club/erotikanzeigen/munchen/';
  const extraction = extractEscortClubListing(html, munichUrl, 30);
  assert.equal(extraction.found_count, 2);
  assert.deepEqual(extraction.profile_urls, [
    'https://de.escort.club/erotikanzeigen/220435.html',
    'https://de.escort.club/erotikanzeigen/220436.html'
  ]);
  assert.equal(extraction.profile_urls.some((url) => /330001|440001|999999/.test(url)), false);

  const result = await discoverCityProfiles({ listing_url: 'https://de.escort.club/erotikanzeigen/munchen', max_profiles: 30 }, {
    fetchResource: async (url) => {
      assert.equal(url, munichUrl);
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
  });
  assert.equal(result.listing_url, munichUrl);
  assert.equal(result.found_count, 2);
});

test('city discovery applies safe default 30 and hard maximum 50', () => {
  assert.equal(normalizeCityImportLimit(undefined), 30);
  assert.equal(normalizeCityImportLimit(0), 30);
  assert.equal(normalizeCityImportLimit(500), 50);
  const html = `<section class="content-sec -index"><h1>Anonse erotyczne Bydgoszcz</h1><div class="row">${Array.from({ length: 60 }, (_, index) => `<div class="item-col"><span class="item-info"></span><a href="/anons/${index + 1}.html">P${index + 1}</a></div>`).join('')}</div></section>`;
  assert.equal(extractEscortClubProfileUrls(html, listingUrl).length, 30);
  assert.equal(extractEscortClubProfileUrls(html, listingUrl, 50).length, 50);
  assert.equal(extractEscortClubProfileUrls(html, listingUrl, 500).length, 50);
});

test('Hamburg discovery uses only the declared city result container', async () => {
  const html = await readFile(new URL('./fixtures/escort-club-hamburg-listing.html', import.meta.url), 'utf8');
  const hamburgUrl = 'https://pl.escort.club/anonse/towarzyskie/hamburg/';
  const extraction = extractEscortClubListing(html, hamburgUrl, 30);
  assert.equal(extraction.declared_count, 18);
  assert.equal(extraction.found_count, 18);
  assert.equal(extraction.profile_urls.length, 18);
  assert.deepEqual(extraction.warnings, []);
  assert.ok(extraction.profile_urls.every((url) => /\/anons\/1000\d{2}[.]html$/.test(url)));
  assert.equal(extraction.profile_urls.some((url) => /2000\d{2}|999999|300001/.test(url)), false);

  const result = await discoverCityProfiles({ listing_url: hamburgUrl, max_profiles: 30 }, {
    fetchResource: async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  });
  assert.equal(result.declared_count, 18);
  assert.equal(result.found_count, 18);
  assert.equal(result.warnings.includes('profile_limit_reached'), false);
});

test('discovery reports declared count mismatches without using the counter as a slice', () => {
  const html = `<section class="search-sec">Lista wyników: 2 sex ogłoszenia</section>
    <section class="content-sec -index"><h1>Anonse erotyczne Bydgoszcz</h1><div class="row">
      ${[1, 2, 3].map((id) => `<div class="item-col"><span class="item-info"></span><a href="/anons/${id}.html">P${id}</a></div>`).join('')}
    </div></section>`;
  const result = extractEscortClubListing(html, listingUrl, 30);
  assert.equal(result.found_count, 3);
  assert.ok(result.warnings.includes('found_more_than_declared'));
});

test('paginated discovery scans only result containers and deduplicates profiles globally', async () => {
  const page = (ids: number[], pageNumber: number) => `<section>Lista wyników: 4 sex ogłoszenia</section>
    <section class="content-sec -index"><h1>Anonse erotyczne Bydgoszcz</h1><div class="row">
      ${ids.map((id) => `<div class="item-col"><span class="item-info"></span><a href="/anons/${id}.html">P${id}</a></div>`).join('')}
    </div></section>
    <section class="dates-sec"><h2>Polecane ogłoszenia</h2><a href="/anons/999.html">Recommended</a></section>
    <nav class="pagination"><a href="?page=${pageNumber === 1 ? 2 : 1}">Other page</a></nav>`;
  const requested: string[] = [];
  const result = await discoverCityProfiles({ listing_url: listingUrl, max_profiles: 30 }, {
    fetchResource: async (url) => {
      requested.push(url);
      const pageNumber = new URL(url).searchParams.get('page');
      return new Response(pageNumber === '2' ? page([2, 3, 4], 2) : page([1, 2], 1), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }
  });
  assert.equal(requested.length, 2);
  assert.equal(result.declared_count, 4);
  assert.equal(result.found_count, 4);
  assert.deepEqual(result.profile_urls.map((url) => profileExternalIdForTest(url)), ['1', '2', '3', '4']);
  assert.deepEqual(result.warnings, []);
});

test('city discovery reports a changed structure without making a real request', async () => {
  const fetchResource = async () => new Response('<html><body><a href="/login">Login</a></body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
  await assert.rejects(
    discoverCityProfiles({ listing_url: listingUrl }, { fetchResource }),
    (error: unknown) => error instanceof CityImportDiscoveryError && error.code === 'listing_structure_changed'
  );
});

test('city discovery distinguishes source HTTP errors from anti-bot responses', async () => {
  await assert.rejects(
    discoverCityProfiles({ listing_url: listingUrl }, { fetchResource: async () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/html' } }) }),
    (error: unknown) => error instanceof CityImportDiscoveryError && error.code === 'source_http_error'
  );
  await assert.rejects(
    discoverCityProfiles({ listing_url: listingUrl }, { fetchResource: async () => new Response('Blocked', { status: 403, headers: { 'content-type': 'text/html' } }) }),
    (error: unknown) => error instanceof CityImportDiscoveryError && error.code === 'captcha_or_protection_detected'
  );
});

test('city discovery distinguishes an empty listing from a changed HTML structure', async () => {
  const response = (html: string) => async () => new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
  await assert.rejects(
    discoverCityProfiles({ listing_url: listingUrl }, { fetchResource: response('<section>Lista wyników: 0</section><section class="content-sec -index"><h1>Anonse erotyczne Bydgoszcz</h1><p>Brak ogłoszeń</p></section>') }),
    (error: unknown) => error instanceof CityImportDiscoveryError && error.code === 'empty_listing'
  );
  await assert.rejects(
    discoverCityProfiles({ listing_url: listingUrl }, { fetchResource: response('<main><h1>Anonse erotyczne Bydgoszcz</h1><a href="/new-profile-layout/1">Changed</a></main>') }),
    (error: unknown) => error instanceof CityImportDiscoveryError && error.code === 'listing_structure_changed'
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

function profileExternalIdForTest(url: string) {
  return url.match(/\/anons\/(\d+)[.]html$/)?.[1];
}
