import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { canReadExactProfileLocation, exactProfileLocationPayload } from '../Back/src/profileLocationAccess.js';
import { resolveEffectivePublicLocation } from '../Back/src/publicLocation.js';

const exactProfile = {
  id: 'lady-margot',
  user_id: 'owner-1',
  city: 'berlin',
  work_city: 'Berlin',
  work_area: 'Neukölln',
  exact_address: 'Buckower Damm 1, 12349 Berlin, Deutschland',
  work_place_label: 'Buckower Damm, Britz, Neukölln, Berlin, 12349, Deutschland',
  postal_code: '12349',
  latitude: 52.425123,
  longitude: 13.435987,
  location_mode: 'exact',
  location_visibility: 'exact'
};

test('public exact mode preserves the stored Admin coordinates without approximation', () => {
  const location = resolveEffectivePublicLocation(exactProfile);
  assert.ok(location);
  assert.equal(location.location_precision, 'exact');
  assert.equal(location.location_approximate, false);
  assert.equal(location.latitude, exactProfile.latitude);
  assert.equal(location.longitude, exactProfile.longitude);
});

test('exact location authorization covers anonymous, regular, Premium, Admin, owner and ID manipulation', () => {
  const denied = { isAdmin: false, isOwner: false, isClient: true, hasActivePremium: false, visibility: 'exact' as const };
  assert.equal(canReadExactProfileLocation(denied), false);
  assert.equal(canReadExactProfileLocation({ ...denied, isClient: false }), false);
  assert.equal(canReadExactProfileLocation({ ...denied, hasActivePremium: true }), true);
  assert.equal(canReadExactProfileLocation({ ...denied, isAdmin: true }), true);
  assert.equal(canReadExactProfileLocation({ ...denied, isOwner: true }), true);
  assert.equal(canReadExactProfileLocation({ ...denied, isOwner: false }), false, 'changing profile ID must remove owner access');
  assert.equal(canReadExactProfileLocation({ ...denied, hasActivePremium: true, visibility: 'hidden' }), false);
  assert.equal(canReadExactProfileLocation({ ...denied, hasActivePremium: true, visibility: 'postal_area' }), false);
  assert.equal(canReadExactProfileLocation({ ...denied, hasActivePremium: true, visibility: 'city_only' }), false);
});

test('protected payload contains coordinates and precision only', () => {
  const payload = exactProfileLocationPayload(exactProfile);
  assert.deepEqual(payload, {
    latitude: exactProfile.latitude,
    longitude: exactProfile.longitude,
    precision: 'exact'
  });
  assert.doesNotMatch(JSON.stringify(payload), /Buckower|12349|address|street/i);
});

test('public route strips address fields and exact GPS at the backend source', async () => {
  const source = await readFile(new URL('../Back/src/routes/profiles.ts', import.meta.url), 'utf8');
  for (const field of [
    'exact_address', 'address', 'street', 'street_address', 'work_address',
    'work_place_label', 'postal_code', 'postal_code_label', 'location_input_source'
  ]) {
    assert.match(source, new RegExp(`${field.replace('_', '[_]')}: _`, 'i'));
  }
  assert.match(source, /Cache-Control', 'private, no-store, max-age=0'/);
  assert.match(source, /Vary', 'Authorization'/);
  assert.match(source, /hasActiveEntitlement\(req\.user!\.id, 'client_premium'\)/);
});

test('public cards and metadata helpers cannot select an exact address', async () => {
  const [labels, mapper, card, profilePage, seo] = await Promise.all([
    readFile(new URL('../Front/src/lib/locationLabels.ts', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/lib/publicProfiles.ts', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/components/ProfileCard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/pages/ProfilePage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/components/Seo.tsx', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(labels, /profile\.(?:exact_address|work_place_label|postal_code)/);
  assert.match(mapper, /stripPrivateLocationFields/);
  assert.match(card, /getPublicLocationLabel/);
  assert.match(profilePage, /getPublicLocationLabel/);
  assert.doesNotMatch(seo, /exact_address|work_place_label|postal_code|street_address/);
});

test('Admin map uses MapLibre/OpenFreeMap, manual input and resize recovery without Google', async () => {
  const [map, admin, dashboard] = await Promise.all([
    readFile(new URL('../Front/src/components/WorkPointMap.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(map, /tiles\.openfreemap\.org\/styles\/dark/);
  assert.match(map, /setWorkerUrl\(mapLibreWorkerUrl\)/);
  assert.match(map, /new ResizeObserver\(resize\)/);
  assert.match(map, /window\.addEventListener\('resize', resize\)/);
  assert.match(map, /Marker\(\{ draggable: !readOnly \}\)/);
  assert.match(map, /map\.on\('click'/);
  assert.doesNotMatch(map, /google/i);
  assert.match(admin, /location_input_source: 'manual'/);
  assert.match(dashboard, /location_input_source: 'manual'/);
});
