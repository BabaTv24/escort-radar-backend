import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  aggregateAdminProfileCities,
  aggregateAdminProfileCountries,
  normalizeAdminCatalogText,
  resolveAdminProfileCountry,
  selectAdminProfilePage
} from '../Back/src/adminProfileCatalog.ts';

test('Bonn and Prague variants fall back to DE and CZ while an explicit valid country wins', () => {
  assert.equal(resolveAdminProfileCountry({ work_country: null, work_city: '  BONN ' }), 'DE');
  for (const city of ['Prag', 'Praga', 'Praha', 'Prague']) {
    assert.equal(resolveAdminProfileCountry({ work_country: '', work_city: city }), 'CZ');
  }
  assert.equal(resolveAdminProfileCountry({ work_country: 'PL', work_city: 'Bonn' }), 'PL');
  assert.equal(resolveAdminProfileCountry({ work_country: 'Moon', work_city: 'Elsewhere' }), '__unknown_country__');
});

test('controlled Polish cities override an incorrectly stored DE country', () => {
  for (const city of ['Bydgoszcz', 'Kołobrzeg', 'Kolobrzeg', 'Koszalin', 'Stargard', 'Stargard Szczeciński', 'Stargard Szczecinski', 'Szczecin', 'Poznań', 'Poznan']) {
    assert.equal(resolveAdminProfileCountry({ work_country: 'DE', work_city: city }), 'PL', city);
  }
  assert.equal(resolveAdminProfileCountry({ work_country: 'DE', work_city: 'Bonn' }), 'DE');
  assert.equal(resolveAdminProfileCountry({ work_country: '', work_city: 'Prag' }), 'CZ');
  assert.equal(resolveAdminProfileCountry({ work_country: '', work_city: 'Praha' }), 'CZ');
});

test('country and city aggregates preserve approved pending and unknown totals', () => {
  const rows = [
    { id: '1', work_country: '', work_city: 'Bonn', moderation_status: 'approved' },
    { id: '2', work_country: '', work_city: 'Bonn', moderation_status: 'pending' },
    { id: '3', work_country: '', work_city: 'Prag', moderation_status: 'pending' },
    { id: '4', work_country: '', work_city: 'Unknown', moderation_status: 'approved' }
  ];
  assert.deepEqual(aggregateAdminProfileCountries(rows), [
    { key: 'CZ', total: 1, approved: 0, pending: 1 },
    { key: 'DE', total: 2, approved: 1, pending: 1 },
    { key: '__unknown_country__', total: 1, approved: 1, pending: 0 }
  ]);
  assert.deepEqual(aggregateAdminProfileCities(rows, 'DE'), [{ key: 'bonn', name: 'Bonn', total: 2, approved: 1, pending: 1 }]);
});

test('catalog pagination beyond 5000 is stable and does not lose or duplicate profiles', () => {
  const rows = Array.from({ length: 5101 }, (_, index) => ({ id: `id-${String(index).padStart(5, '0')}`, work_country: 'PL', work_city: 'Warszawa' }));
  const ids: string[] = [];
  for (let page = 1; page <= 103; page += 1) {
    const result = selectAdminProfilePage(rows, 'PL', normalizeAdminCatalogText('Warszawa'), page, 50);
    ids.push(...result.ids);
    if (page < 103) assert.equal(result.hasMore, true);
  }
  assert.equal(ids.length, 5101);
  assert.equal(new Set(ids).size, 5101);
  assert.deepEqual(ids, rows.map((row) => row.id));
});

test('Admin Profile entry uses layered server filters and never calls the full profile list', async () => {
  const route = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const page = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  assert.match(route, /\/profiles\/catalog\/countries/);
  assert.match(route, /\/profiles\/catalog\/cities/);
  assert.match(route, /\/profiles\/catalog\/items/);
  assert.match(route, /applyAdminCatalogFilters/);
  assert.match(route, /limit = Math\.min\(100, Math\.max\(10, Number\(req\.query\.limit\) \|\| 50\)\)/);
  const loadFunction = page.slice(page.indexOf('async function load('), page.indexOf('async function action('));
  const profileLoadBranch = loadFunction.slice(loadFunction.indexOf("if (view === 'profiles' || view === 'profile-studio')"), loadFunction.indexOf("if (view === 'photos')"));
  assert.doesNotMatch(profileLoadBranch, /api\.adminProfiles/);
  assert.match(profileLoadBranch, /api\.adminProfileStats/);
  assert.match(profileLoadBranch, /loadProfileCatalogCountries/);
});
