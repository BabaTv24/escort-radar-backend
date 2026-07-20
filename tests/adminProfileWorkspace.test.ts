import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { Profile } from '../Front/src/types.ts';
import {
  filterAdminProfileCountryGroups,
  filterAdminProfileCityGroups,
  groupAdminProfilesByCountry,
  groupAdminProfilesByCity,
  normalizeAdminProfileCitySearch,
  normalizeAdminProfileCountry,
  profileIdsInCityGroups,
  profileIdsInCountryGroups,
  unknownAdminProfileCityKey,
  updateAdminProfileSelection
} from '../Front/src/lib/adminProfileCity.ts';
import { defaultAdminProfileFilters, profileMatchesAdminFilters } from '../Front/src/lib/adminProfiles.ts';
import {
  constrainAdminWindowBounds,
  parseAdminWindowBounds,
  profileControlWindowStorageKey,
  profileReviewWindowStorageKey,
  readAdminWindowBounds,
  writeAdminWindowBounds
} from '../Front/src/lib/adminWindowLayout.ts';

const profile = (id: string, values: Record<string, unknown> = {}) => ({
  id,
  display_name: id,
  city: '',
  category: 'ladies',
  status: 'active',
  moderation_status: 'approved',
  is_published: true,
  verified: true,
  ...values
}) as unknown as Profile;

test('admin city grouping merges case variants, prefers work_city and keeps unknown last', () => {
  const groups = groupAdminProfilesByCity([
    profile('one', { city: 'berlin' }),
    profile('two', { city: 'Berlin' }),
    profile('three', { city: 'Warsaw', work_city: 'Hamburg' }),
    profile('unknown')
  ], 'Unknown city');
  assert.deepEqual(groups.map((group) => [group.key, group.name, group.profiles.length]), [
    ['berlin', 'Berlin', 2],
    ['hamburg', 'Hamburg', 1],
    [unknownAdminProfileCityKey, 'Unknown city', 1]
  ]);
  assert.equal(profileIdsInCityGroups(groups).length, 4);
});

test('city search is case and diacritic insensitive without fuzzy city merging', () => {
  const groups = groupAdminProfilesByCity([
    profile('one', { work_city: 'Köln' }),
    profile('two', { work_city: 'Kolding' })
  ], 'Unknown city');
  assert.deepEqual(filterAdminProfileCityGroups(groups, 'KOLN').map((group) => group.name), ['Köln']);
  assert.equal(groups.length, 2);
  assert.equal(normalizeAdminProfileCitySearch('München'), normalizeAdminProfileCitySearch('Munchen'));
  assert.equal(normalizeAdminProfileCitySearch('Muenchen'), normalizeAdminProfileCitySearch('Munchen'));
});

test('presentation country fallback assigns Bonn and Prague variants without overriding an explicit country', () => {
  assert.equal(normalizeAdminProfileCountry('', ' Bonn '), 'DE');
  for (const city of ['Prag', 'Praga', 'Praha', 'Prague']) assert.equal(normalizeAdminProfileCountry('unknown', city), 'CZ');
  assert.equal(normalizeAdminProfileCountry('PL', 'Bonn'), 'PL');
});

test('country hierarchy normalizes aliases, scopes duplicate city names and preserves every profile once', () => {
  const rows = [
    profile('de-one', { work_country: 'Deutschland', work_city: 'Berlin', moderation_status: 'approved' }),
    profile('de-two', { work_country: 'DE', work_city: 'Berlin', moderation_status: 'pending' }),
    profile('pl-one', { work_country: 'Polska', work_city: 'Berlin', moderation_status: 'approved' }),
    profile('nl-one', { work_country: 'Netherlands', work_city: 'Amsterdam', moderation_status: 'pending' }),
    profile('unknown', { work_country: 'Moon', work_city: '' })
  ];
  const countries = groupAdminProfilesByCountry(rows, 'pl', 'Nieznany kraj', 'Nieznane miasto');
  assert.deepEqual(countries.map((country) => [country.key, country.profiles.length, country.approvedCount]), [
    ['NL', 1, 0],
    ['DE', 2, 1],
    ['PL', 1, 1],
    ['__unknown_country__', 1, 1]
  ]);
  assert.equal(profileIdsInCountryGroups(countries).length, rows.length);
  assert.equal(new Set(profileIdsInCountryGroups(countries)).size, rows.length);
  countries.forEach((country) => assert.equal(country.cities.reduce((sum, city) => sum + city.profiles.length, 0), country.profiles.length));
  const germanBerlin = filterAdminProfileCountryGroups(countries, 'berlin', 'DE');
  const polishBerlin = filterAdminProfileCountryGroups(countries, 'berlin', 'PL');
  assert.deepEqual(profileIdsInCountryGroups(germanBerlin), ['de-one', 'de-two']);
  assert.deepEqual(profileIdsInCountryGroups(polishBerlin), ['pl-one']);
});

test('base publication and moderation suspension filters run before city grouping and counters', () => {
  const rows = [
    profile('visible', { work_city: 'Berlin' }),
    profile('unpublished', { work_city: 'Berlin', is_published: false }),
    profile('suspended', { work_city: 'Berlin', moderation_status: 'suspended' }),
    profile('hamburg', { work_city: 'Hamburg' })
  ];
  const filters = { ...defaultAdminProfileFilters, published: 'yes', suspended: 'no' };
  const filtered = rows.filter((row) => profileMatchesAdminFilters(row, '', filters));
  const groups = groupAdminProfilesByCity(filtered, 'Unknown city');
  assert.deepEqual(groups.map((group) => [group.name, group.profiles.length]), [['Berlin', 1], ['Hamburg', 1]]);
  assert.deepEqual(filterAdminProfileCityGroups(groups, '', 'berlin')[0].profiles.map((row) => row.id), ['visible']);
});

test('selecting one city is additive and collapsing cannot remove existing selections', () => {
  const selected = updateAdminProfileSelection(['outside'], ['berlin-1', 'berlin-2'], true);
  assert.deepEqual(selected, ['outside', 'berlin-1', 'berlin-2']);
  assert.deepEqual(updateAdminProfileSelection(selected, [], false), selected);
  assert.deepEqual(updateAdminProfileSelection(selected, ['berlin-1', 'berlin-2'], false), ['outside']);
});

test('window bounds storage is versioned and corrupted values are ignored', () => {
  assert.equal(parseAdminWindowBounds('{broken'), null);
  assert.equal(parseAdminWindowBounds(JSON.stringify({ version: 9, x: 1, y: 2, width: 3, height: 4 })), null);
  assert.equal(parseAdminWindowBounds(JSON.stringify({ version: 1 })), null);
  assert.equal(parseAdminWindowBounds(JSON.stringify({ version: 1, x: '1', y: 2, width: 800, height: 600 })), null);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) };
  writeAdminWindowBounds(storage, profileControlWindowStorageKey, { x: 250, y: 90, width: 800, height: 600 });
  assert.deepEqual(readAdminWindowBounds(storage, profileControlWindowStorageKey), { x: 250, y: 90, width: 800, height: 600 });
  assert.equal(profileReviewWindowStorageKey, 'er.admin.window.profileReview.v1');
});

test('window bounds enforce viewport and minimum and maximum sizes', () => {
  const viewport = { left: 224, top: 80, width: 1000, height: 700 };
  assert.deepEqual(constrainAdminWindowBounds({ x: -500, y: -500, width: 50, height: 2000 }, viewport, 420, 280), {
    x: 224, y: 80, width: 420, height: 700
  });
  assert.deepEqual(constrainAdminWindowBounds({ x: 5000, y: 5000, width: 600, height: 400 }, viewport, 420, 280), {
    x: 624, y: 380, width: 600, height: 400
  });
});

test('profile accordion and window behavior retain accessibility mobile and safety contracts', async () => {
  const adminPage = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  const adminWindow = await readFile(new URL('../Front/src/components/AdminWindow.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../Front/src/styles.css', import.meta.url), 'utf8');
  assert.match(adminPage, /aria-expanded=\{countryExpanded\}[\s\S]*aria-controls=\{countryPanelId\}/);
  assert.match(adminPage, /aria-expanded=\{cityExpanded\}[\s\S]*aria-controls=\{cityPanelId\}/);
  assert.match(adminPage, /function toggleProfileCityExpanded[\s\S]*setExpandedProfileCityKeys/);
  assert.doesNotMatch(adminPage.slice(adminPage.indexOf('function toggleProfileCityExpanded'), adminPage.indexOf('async function runBulkAction')), /setSelectedProfileIds/);
  assert.match(adminPage, /studioDirty && !window\.confirm\(t\('admin\.window\.unsavedConfirm'\)\)/);
  assert.match(adminPage, /runBulkAction\('publish'\)/);
  assert.match(adminPage, /runBulkAction\('delete'\)/);
  assert.match(adminWindow, /maximized \? null : id/);
  assert.match(adminWindow, /height: minimized \? undefined : bounds\.height/);
  assert.match(adminWindow, /min-width: 1024px[\s\S]*pointer: fine/);
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*\.admin-window\.is-floating[\s\S]*position: static !important/);
  assert.match(css, /\.admin-profile-control-window \.admin-table-wrap[\s\S]*overflow-x: auto !important/);
});

test('profile city and window controls have PL EN and DE translations', async () => {
  const keys = [
    'admin.profiles.searchCity', 'admin.profiles.allCities', 'admin.profiles.unknownCity',
    'admin.profiles.profilesInCity', 'admin.profiles.selectVisibleInCity', 'admin.profiles.expand',
    'admin.profiles.countries', 'admin.profiles.allCountries', 'admin.profiles.unknownCountry',
    'admin.profiles.selectVisibleInCountry', 'admin.profiles.countryCount', 'admin.profiles.cityCount',
    'admin.dashboard.adminApproved', 'admin.dashboard.pendingApproval', 'admin.dashboard.published',
    'admin.dashboard.awaitingOwner', 'admin.table.available_now',
    'admin.profiles.collapse', 'admin.window.drag', 'admin.window.resize', 'admin.window.resetLayout',
    'admin.window.layoutReset'
  ];
  for (const language of ['pl', 'en', 'de']) {
    const dictionary = JSON.parse(await readFile(new URL(`../Front/src/locales/${language}.json`, import.meta.url), 'utf8')) as Record<string, string>;
    keys.forEach((key) => assert.ok(dictionary[key], `${language} is missing ${key}`));
  }
});
