import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Profile } from '../Front/src/types.js';
import type { GeoPoint } from '../Front/src/lib/geo.js';
import { deriveHomeRadarView, getHomeRadarHref, HOME_RADAR_RADIUS_METERS, loadHomeRadarCandidatePool, selectHomeRadarProfiles } from '../Front/src/lib/homeRadar.js';
import { cityNamesMatch, normalizeCityName, selectSponsoredProfilesForLocation } from '../Front/src/lib/sponsoredProfiles.js';
import { isPublicProfile } from '../Back/src/publicProfiles.js';

const berlin: GeoPoint = { lat: 52.52, lng: 13.405, source: 'manual', label: 'Berlin', city: 'Berlin' };
const bydgoszcz: GeoPoint = { lat: 53.1235, lng: 18.0084, source: 'manual', label: 'Bydgoszcz', city: 'Bydgoszcz' };

test('changing Berlin to Bydgoszcz immediately recomputes sponsored and nearby sections from one pool', () => {
  const profiles = [
    profile('berlin', { work_city: 'Berlin', is_sponsored: true, latitude: berlin.lat, longitude: berlin.lng }),
    profile('bydgoszcz', { work_city: 'Bydgoszcz', is_sponsored: true, latitude: bydgoszcz.lat, longitude: bydgoszcz.lng })
  ];

  assert.deepEqual(deriveHomeRadarView(profiles, berlin).sponsoredProfiles.map(({ id }) => id), ['berlin']);
  const changed = deriveHomeRadarView(profiles, bydgoszcz);
  assert.deepEqual(changed.sponsoredProfiles.map(({ id }) => id), ['bydgoszcz']);
  assert.deepEqual(changed.nearbyProfiles.map(({ profile }) => profile.id), ['bydgoszcz']);
});

test('Bydgoszcz sponsored profiles never contain Berlin', () => {
  const profiles = [
    profile('berlin', { work_city: 'Berlin', is_sponsored: true }),
    profile('bydgoszcz', { work_city: 'Bydgoszcz', is_sponsored: true })
  ];
  assert.deepEqual(selectSponsoredProfilesForLocation(profiles, bydgoszcz).map(({ id }) => id), ['bydgoszcz']);
});

test('Hamburg works without a city-specific branch', () => {
  const hamburg = { lat: 53.5511, lng: 9.9937, source: 'manual' as const, label: 'Hamburg, Deutschland', city: 'Hamburg' };
  assert.deepEqual(selectSponsoredProfilesForLocation([
    profile('hamburg', { work_city: 'Hamburg', is_sponsored: true }),
    profile('berlin', { work_city: 'Berlin', is_sponsored: true })
  ], hamburg).map(({ id }) => id), ['hamburg']);
});

test('future city names and spelling variants use the shared generic normalizer', () => {
  const future = { lat: 51, lng: 17, source: 'manual' as const, label: 'Żółta Łąka, Polska', city: 'Żółta Łąka' };
  assert.equal(normalizeCityName('Żółta Łąka'), 'zolta laka');
  assert.equal(cityNamesMatch('München', 'Muenchen'), true);
  assert.deepEqual(selectSponsoredProfilesForLocation([
    profile('future', { work_city: 'Zolta Laka', is_sponsored: true })
  ], future).map(({ id }) => id), ['future']);
});

test('missing sponsored profiles produces an empty result without a Berlin fallback', () => {
  assert.deepEqual(selectSponsoredProfilesForLocation([
    profile('berlin', { work_city: 'Berlin', is_sponsored: true })
  ], bydgoszcz), []);
  assert.equal(getHomeRadarHref(null), '#live-radar');
});

test('home radar includes 149.9 km and rejects 150.1 km using Haversine', () => {
  const origin: GeoPoint = { lat: 1, lng: 1, source: 'manual', city: 'Origin' };
  const profiles = [
    profileAtDistance('inside', origin, 149.9),
    profileAtDistance('outside', origin, 150.1)
  ];
  assert.equal(HOME_RADAR_RADIUS_METERS, 150_000);
  assert.deepEqual(selectHomeRadarProfiles(profiles, origin).map(({ profile }) => profile.id), ['inside']);
});

test('a cross-border public profile is included when it is within 150 km', () => {
  const origin: GeoPoint = { lat: 53.4285, lng: 14.5528, source: 'manual', city: 'Szczecin' };
  const german = profileAtDistance('germany', origin, 25, { work_country: 'DE', work_city: 'Pasewalk' });
  assert.deepEqual(selectHomeRadarProfiles([german], origin).map(({ profile }) => profile.id), ['germany']);
});

test('All status includes Online, Busy and Offline and keeps nearest-first order', () => {
  const origin: GeoPoint = { lat: 1, lng: 1, source: 'manual', city: 'Origin' };
  const profiles = [
    profileAtDistance('offline', origin, 30, { operator_status: 'OFFLINE' }),
    profileAtDistance('online', origin, 10, { operator_status: 'ONLINE_NOW' }),
    profileAtDistance('busy', origin, 20, { operator_status: 'BUSY' })
  ];
  assert.deepEqual(selectHomeRadarProfiles(profiles, origin, 'all').map(({ profile }) => profile.id), ['online', 'busy', 'offline']);
});

test('hidden and unresolved profile locations are excluded', () => {
  const origin: GeoPoint = { lat: 1, lng: 1, source: 'manual', city: 'Origin' };
  const hidden = profileAtDistance('hidden', origin, 10, { location_visibility: 'hidden' });
  const unresolved = profile('unresolved', { work_city: 'Unknown Future Place', latitude: null, longitude: null });
  assert.deepEqual(selectHomeRadarProfiles([hidden, unresolved], origin), []);
});

test('public eligibility remains owned by the backend predicate', () => {
  assert.equal(isPublicProfile({ status: 'active', is_published: true, moderation_status: 'approved', shadowbanned: false }), true);
  assert.equal(isPublicProfile({ status: 'active', is_published: true, moderation_status: 'approved', shadowbanned: true }), false);
});

test('HomePage dynamic radar path and source contain no Berlin fallback', async () => {
  assert.equal(getHomeRadarHref(bydgoszcz), '/city/bydgoszcz');
  assert.equal(getHomeRadarHref({ ...bydgoszcz, city: 'Żółta Łąka' }), '/city/zolta-laka');
  const source = await readFile(new URL('../Front/src/pages/HomePage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /berlinProfiles|featuredProfiles|city[=:]["']berlin|Podgląd Berlina|Wszystkie profile w Berlinie|Otwórz radar Berlin/i);
});

test('Live Radar buttons and 150 km link have the required PL, EN and DE translations', async () => {
  const [pl, en, de] = await Promise.all(['pl', 'en', 'de'].map(async (locale) => JSON.parse(await readFile(new URL(`../Front/src/locales/${locale}.json`, import.meta.url), 'utf8'))));
  assert.deepEqual([pl['home.openRadar'], en['home.openRadar'], de['home.openRadar']], ['Otwórz Live Radar', 'Open Live Radar', 'Live-Radar öffnen']);
  assert.deepEqual([pl['home.viewAllWithin150'], en['home.viewAllWithin150'], de['home.viewAllWithin150']], ['Wszystkie profile w promieniu 150 km', 'All profiles within 150 km', 'Alle Profile im Umkreis von 150 km']);
});

test('location, status and radius-derived views do not issue a second radar=1 request', async () => {
  let requests = 0;
  const pool = [profile('bydgoszcz', { work_city: 'Bydgoszcz', is_sponsored: true, latitude: bydgoszcz.lat, longitude: bydgoszcz.lng })];
  const loaded = await loadHomeRadarCandidatePool(async (params) => {
    requests += 1;
    assert.equal(params.toString(), 'radar=1');
    return pool;
  });
  deriveHomeRadarView(loaded, berlin, 'online');
  deriveHomeRadarView(loaded, bydgoszcz, 'all');
  selectHomeRadarProfiles(loaded, bydgoszcz, 'OFFLINE');
  assert.equal(requests, 1);
});

function profile(id: string, overrides: Partial<Profile> = {}): Profile {
  return {
    id,
    display_name: id,
    slug: id,
    city: 'Test City',
    status: 'active',
    is_published: true,
    moderation_status: 'approved',
    shadowbanned: false,
    location_mode: 'exact',
    location_visibility: 'exact',
    operator_status: 'OFFLINE',
    profile_images: [],
    ...overrides
  } as Profile;
}

function profileAtDistance(id: string, origin: GeoPoint, distanceKm: number, overrides: Partial<Profile> = {}) {
  const latitude = origin.lat + distanceKm / 6371 * 180 / Math.PI;
  return profile(id, { latitude, longitude: origin.lng, ...overrides });
}
