import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  adminLocationFormFromProfile,
  adminLocationSavePayload,
  isCurrentAdminProfileRequest
} from '../Front/src/lib/adminLocationForm.ts';
import { resolveProfileCountry } from '../Front/src/lib/globalLocations.ts';

const profile = (id: string, values: Record<string, unknown>) => ({
  id,
  display_name: id,
  available_now: false,
  mobile_service: false,
  private_studio: false,
  verified: true,
  ...values
}) as any;

test('Berlin and Szczecin forms resolve their own country city and map point', () => {
  const berlin = adminLocationFormFromProfile(profile('berlin', {
    work_country: 'Germany', work_city: 'Berlin', latitude: null, longitude: null
  }));
  const szczecin = adminLocationFormFromProfile(profile('szczecin', {
    work_country: 'DE', work_city: 'Szczecin', work_area: 'Mitte', area: 'Mitte', postal_code: '12043',
    exact_address: 'Musterstrasse 1, Berlin', work_place_label: 'Berlin Mitte', latitude: 52.52, longitude: 13.405
  }));

  assert.deepEqual({ country: berlin.work_country, city: berlin.work_city, lat: berlin.latitude, lng: berlin.longitude }, {
    country: 'DE', city: 'Berlin', lat: '52.52', lng: '13.405'
  });
  assert.deepEqual({ country: szczecin.work_country, city: szczecin.work_city, lat: szczecin.latitude, lng: szczecin.longitude }, {
    country: 'PL', city: 'Szczecin', lat: '53.4285', lng: '14.5528'
  });
  assert.deepEqual({ area: szczecin.work_area, postal: szczecin.postal_code, address: szczecin.exact_address, label: szczecin.work_place_label }, {
    area: '', postal: '', address: '', label: ''
  });
});

test('switching Berlin to Szczecin replaces location state and save/reopen preserves Szczecin', () => {
  const berlin = adminLocationFormFromProfile(profile('berlin', {
    work_country: 'DE', work_city: 'Berlin', work_area: 'Mitte', postal_code: '12043', latitude: 52.52, longitude: 13.405
  }));
  const szczecin = adminLocationFormFromProfile(profile('szczecin', {
    work_country: 'Polska', work_city: 'Szczecin', postal_code: '70-001', latitude: 53.43, longitude: 14.56
  }));
  assert.notEqual(szczecin.work_city, berlin.work_city);
  assert.notEqual(szczecin.latitude, berlin.latitude);
  assert.equal(szczecin.work_area, '');

  const saved = adminLocationSavePayload(szczecin);
  const reopened = adminLocationFormFromProfile(profile('szczecin', saved));
  assert.deepEqual({ country: reopened.work_country, city: reopened.work_city, lat: reopened.latitude, lng: reopened.longitude }, {
    country: 'PL', city: 'Szczecin', lat: '53.43', lng: '14.56'
  });
});

test('country aliases and stale DE fallback resolve consistently while explicit valid country wins', () => {
  for (const country of ['PL', 'Poland', 'Polska']) assert.equal(resolveProfileCountry(country, 'Szczecin'), 'PL');
  for (const country of ['DE', 'Germany', 'Deutschland', 'Niemcy']) assert.equal(resolveProfileCountry(country, 'Berlin'), 'DE');
  assert.equal(resolveProfileCountry('DE', 'Suwalki'), 'PL');
  assert.equal(resolveProfileCountry('PL', 'Berlin'), 'PL');
});

test('late profile response cannot replace the current selection', () => {
  assert.equal(isCurrentAdminProfileRequest(1, 2, 'berlin', 'berlin'), false);
  assert.equal(isCurrentAdminProfileRequest(2, 2, 'berlin', 'szczecin'), false);
  assert.equal(isCurrentAdminProfileRequest(2, 2, 'szczecin', 'szczecin'), true);
});

test('Admin location UI and WorkPointMap keep profile-dependent location contracts', async () => {
  const [page, map, route] = await Promise.all([
    readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/components/WorkPointMap.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8')
  ]);
  assert.match(page, /country\.code === 'DE'.*=== 'berlin'/);
  assert.match(page, /\{isBerlin \? <AdminField label=\{t\('profileDetails\.berlinDistrict'\)\}/);
  assert.match(page, /isCurrentAdminProfileRequest\(requestId, selectedProfileRequestRef\.current/);
  assert.match(map, /pointRef\.current = toPoint\(latitude, longitude\)/);
  assert.match(map, /markerRef\.current\.setLngLat\(\[next\.lng, next\.lat\]\)/);
  assert.match(map, /mapRef\.current\.setCenter\(\[next\.lng, next\.lat\]\)/);
  assert.doesNotMatch(map, /\|\| \{ lat: 52\.52, lng: 13\.405 \}/);
  assert.match(route, /normalizeAdminProfilePayload\(req\.body, true, true\)[\s\S]*canonicalizeProfileLocation\(normalizedProfileData\.data\)/);
  assert.match(route, /const canonicalProfile = canonicalizeProfileLocation\(profile\)/);
});
