import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  InvalidProfileLocationError,
  effectiveProfileLocationPrivacy,
  mergeProfileReverseGeocode,
  profileLocationPrivacyPatch,
  profileLocationSavePayload,
  profileMapPoint
} from '../Front/src/lib/adminLocationForm.ts';

test('advertiser coordinates accept zero and reject missing, NaN, Infinity and out-of-range values', () => {
  assert.deepEqual(profileMapPoint(0, 0), { latitude: 0, longitude: 0 });
  assert.equal(profileMapPoint('', 0), null);
  assert.equal(profileMapPoint(Number.NaN, 0), null);
  assert.equal(profileMapPoint(Number.POSITIVE_INFINITY, 0), null);
  assert.equal(profileMapPoint(91, 0), null);
  assert.equal(profileMapPoint(0, -181), null);
  assert.throws(() => profileLocationSavePayload({ latitude: 'invalid', longitude: 10 }), InvalidProfileLocationError);
  assert.throws(() => profileLocationSavePayload({ latitude: 10, longitude: '' }), InvalidProfileLocationError);
});

test('map and reverse geocoding update the one profile payload without replacing the selected point', () => {
  const current = { display_name: 'Alex', latitude: 1, longitude: 2, work_country: 'DE', work_city: 'Berlin' };
  const merged = mergeProfileReverseGeocode(current, { latitude: 0, longitude: 0 }, {
    latitude: 52.5,
    longitude: 13.4,
    work_country: 'PL',
    work_city: 'Szczecin',
    work_area: 'Centrum',
    postal_code: '70-001',
    exact_address: 'Testowa 1',
    work_place_label: 'Testowa 1, Szczecin',
    location_precision: 'exact',
    precision: 'exact',
    geocoded: true
  }, (city) => city.toLowerCase());

  assert.equal(merged.display_name, 'Alex');
  assert.equal(merged.latitude, 0);
  assert.equal(merged.longitude, 0);
  assert.equal(merged.work_city, 'Szczecin');
  assert.equal(merged.city, 'szczecin');
  assert.deepEqual(profileLocationSavePayload(merged), {
    latitude: 0,
    longitude: 0,
    work_country: 'PL',
    work_city: 'Szczecin',
    work_area: 'Centrum',
    area: 'Centrum',
    postal_code: '70-001',
    exact_address: 'Testowa 1',
    work_place_label: 'Testowa 1, Szczecin',
    location_mode: 'approximate',
    location_visibility: 'exact',
    location_precision: 'exact',
    location_input_source: 'manual'
  });
});

test('all public privacy values keep their existing backend names and mode mapping', () => {
  assert.equal(effectiveProfileLocationPrivacy({ location_mode: 'exact_hidden' } as any), 'hidden');
  assert.equal(effectiveProfileLocationPrivacy({ location_mode: 'city_only' } as any), 'city_only');
  assert.equal(effectiveProfileLocationPrivacy({ location_visibility: 'postal_area' } as any), 'postal_area');
  assert.deepEqual(profileLocationPrivacyPatch('exact'), { location_visibility: 'exact', location_mode: 'approximate', location_precision: 'exact' });
  assert.deepEqual(profileLocationPrivacyPatch('postal_area'), { location_visibility: 'postal_area', location_mode: 'approximate', location_precision: 'postal_area' });
  assert.deepEqual(profileLocationPrivacyPatch('city_only'), { location_visibility: 'city_only', location_mode: 'city_only', location_precision: 'city' });
  assert.deepEqual(profileLocationPrivacyPatch('hidden'), { location_visibility: 'hidden', location_mode: 'exact_hidden' });
});

test('location section uses shared map, parent profile state, explicit geolocation and guarded explicit save', async () => {
  const [section, dashboard, map, route] = await Promise.all([
    readFile(new URL('../Front/src/components/advertiser-dashboard/AdvertiserLocationSection.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/components/WorkPointMap.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Back/src/routes/profiles.ts', import.meta.url), 'utf8')
  ]);

  assert.match(dashboard, /activeSection === 'location'[\s\S]*<AdvertiserLocationSection/);
  assert.match(dashboard, /persistProfile\(draftProfile, successMessage, false, true\)/);
  assert.doesNotMatch(dashboard, /\['overview', 'profile', 'settings'\]\.includes\(activeSection\)/);
  assert.match(section, /<WorkPointMap/);
  assert.match(section, /onProfileChange\(\{ \.\.\.currentProfile\.current, \.\.\.patch \}\)/);
  assert.doesNotMatch(section, /useState<Partial<Profile>>/);
  assert.match(section, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(section, /if \(saving \|\| dashboardStatus === 'saving'\) return/);
  assert.match(section, /advertiserDashboard\.location\.reverseFailed/);
  assert.doesNotMatch(section, /error\.message|saveError\.message|searchError\.message/);
  assert.doesNotMatch(section, /google|maps\.googleapis/i);
  assert.match(map, /map\.on\('click'/);
  assert.match(map, /marker\.on\('dragend'/);
  assert.match(route, /post\('\/location\/geocode'.*verifyUser.*requireAdvertiserOnboardingAccess/s);
  assert.match(route, /manualExactPoint[\s\S]*resolveManualAdminLocationForSave/);
});
