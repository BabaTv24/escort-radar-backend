import test from 'node:test';
import assert from 'node:assert/strict';
import type { Profile } from '../Front/src/types.js';
import type { GeoPoint } from '../Front/src/lib/geo.js';
import { safeDistanceKm } from '../Front/src/lib/geo.js';
import { selectRadarProfiles } from '../Front/src/lib/homeRadar.js';
import { prepareRadarCandidatePool } from '../Back/src/radarPool.js';
import { globalCountries, resolveCityLocation } from '../Back/src/locations.js';
import { resolveEffectivePublicLocation } from '../Back/src/publicLocation.js';
import { readFile } from 'node:fs/promises';

const szczecinCenter: GeoPoint = { lat: 53.4285, lng: 14.5528, source: 'manual', city: 'Szczecin' };

test('complete radar pool is deterministic, deduplicated, cross-border and never limited to 30', () => {
  const fixture = buildRadarFixture();
  const first = prepareRadarCandidatePool(fixture, 2, false);
  const second = prepareRadarCandidatePool(fixture, 2, false);
  const profiles = hydratePublicLocations(first.candidates);
  const repeatedProfiles = hydratePublicLocations(second.candidates);

  assert.deepEqual(first.meta, {
    fetched_candidates: 76,
    eligible_candidates: 74,
    located_candidates: 72,
    unlocated_candidates: 2,
    pages_fetched: 2,
    truncated: false
  });

  const firstSzczecinPoints = cityPoints(first.candidates, 'Szczecin');
  const secondSzczecinPoints = cityPoints(second.candidates, 'Szczecin');
  assert.equal(firstSzczecinPoints.length, 35);
  assert.deepEqual(firstSzczecinPoints, secondSzczecinPoints);
  assert.equal(new Set(firstSzczecinPoints.map((point) => `${point.latitude.toFixed(7)}:${point.longitude.toFixed(7)}`)).size, 35);

  const nearestNeighborMeters = firstSzczecinPoints.map((point, index) => Math.min(...firstSzczecinPoints
    .filter((_, candidateIndex) => candidateIndex !== index)
    .map((candidate) => (safeDistanceKm(
      { lat: point.latitude, lng: point.longitude },
      { lat: candidate.latitude, lng: candidate.longitude }
    ) || 0) * 1000)));
  assert.ok(nearestNeighborMeters.every((distance) => distance >= 95 && distance <= 110));

  const homeResult = selectRadarProfiles(profiles, szczecinCenter, 150_000, 'all');
  const cityResult = selectRadarProfiles(profiles, szczecinCenter, 150_000, 'all');
  const reenteredResult = selectRadarProfiles(repeatedProfiles, szczecinCenter, 150_000, 'all');
  const ids = homeResult.map(({ profile }) => profile.id);

  assert.equal(ids.length, 71);
  assert.ok(ids.length > 30);
  assert.deepEqual(cityResult.map(({ profile }) => profile.id), ids);
  assert.deepEqual(reenteredResult.map(({ profile }) => profile.id), ids);
  assert.ok(ids.some((id) => id.startsWith('berlin-')), 'cross-border Berlin profiles must be present');
  assert.ok(ids.some((id) => id.startsWith('stargard-')));
  assert.ok(ids.some((id) => id.startsWith('koszalin-')));
  assert.ok(ids.includes('exact-near-szczecin'));
  assert.ok(!ids.includes('outside-150km'));
  assert.ok(!ids.includes('hidden-location'));
  assert.ok(!ids.includes('unpublished'));
  assert.ok(!ids.includes('unknown-location'));
  assert.equal(ids.filter((id) => id === 'szczecin-00').length, 1);
  assert.equal(first.meta.truncated, false);
});

test('HomePage and CityPage do not truncate the shared radar result before rendering', async () => {
  const [homeSource, citySource] = await Promise.all([
    readFile(new URL('../Front/src/pages/HomePage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/pages/CityPage.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(homeSource, /const visibleProfiles = profiles;/);
  assert.match(citySource, /const marketplaceCarouselProfiles = sortedProfiles;/);
  assert.doesNotMatch(citySource, /sortedProfiles\.slice\(0, ?(?:10|30|60|300)\)/);
});

test('every city in the backend location catalog has a privacy-safe center', () => {
  for (const country of globalCountries) {
    for (const city of country.cities) {
      const location = resolveCityLocation(city);
      assert.ok(location, `${city} must have a safe city center`);
      assert.equal(location.country_code, country.code);
    }
  }
});

test('postal-area records without coordinates use their recognized city safely and never Berlin', () => {
  const location = resolveEffectivePublicLocation({
    location_mode: 'postal_area',
    postal_code: '70-001',
    work_city: 'Szczecin',
    work_country: 'DE',
    latitude: null,
    longitude: null
  });

  assert.deepEqual(location, {
    latitude: 53.4285,
    longitude: 14.5528,
    location_approximate: true,
    location_precision: 'postal_area'
  });
});

function buildRadarFixture() {
  const records = [
    ...cityOnlyRecords('Szczecin', 'DE', 35),
    ...cityOnlyRecords('Stargard', 'PL', 15),
    ...cityOnlyRecords('Berlin', 'DE', 10),
    ...cityOnlyRecords('Koszalin', 'PL', 10),
    publicRecord('outside-150km', { work_city: 'Warszawa', work_country: 'PL', location_mode: 'city_only', location_visibility: 'city_only' }),
    publicRecord('hidden-location', { work_city: 'Szczecin', location_mode: 'hidden', location_visibility: 'hidden' }),
    publicRecord('unpublished', { work_city: 'Szczecin', location_mode: 'city_only', location_visibility: 'city_only', is_published: false }),
    publicRecord('szczecin-00', { work_city: 'Szczecin', location_mode: 'city_only', location_visibility: 'city_only' }),
    publicRecord('exact-near-szczecin', { work_city: 'Pasewalk', work_country: 'DE', latitude: 53.5, longitude: 14.2, location_mode: 'exact', location_visibility: 'exact' }),
    publicRecord('unknown-location', { work_city: 'Future Unknown City', location_mode: 'city_only', location_visibility: 'city_only' })
  ];
  assert.equal(records.length, 76);
  return records;
}

function cityOnlyRecords(city: string, country: string, count: number) {
  return Array.from({ length: count }, (_, index) => publicRecord(`${city.toLowerCase()}-${String(index).padStart(2, '0')}`, {
    work_city: city,
    work_country: country,
    location_mode: 'city_only',
    location_visibility: 'city_only',
    latitude: null,
    longitude: null
  }));
}

function publicRecord(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    display_name: id,
    slug: id,
    city: String(overrides.work_city || 'Szczecin'),
    category: 'ladies',
    status: 'active',
    is_published: true,
    moderation_status: 'approved',
    shadowbanned: false,
    operator_status: 'OFFLINE',
    profile_images: [],
    ...overrides
  };
}

function hydratePublicLocations(candidates: ReturnType<typeof prepareRadarCandidatePool>['candidates']) {
  return candidates.map(({ profile, location }) => ({
    ...profile,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    location_approximate: location?.location_approximate ?? false,
    location_precision: location?.location_precision ?? null
  })) as Profile[];
}

function cityPoints(candidates: ReturnType<typeof prepareRadarCandidatePool>['candidates'], city: string) {
  return candidates
    .filter(({ profile, location }) => profile.work_city === city && Boolean(location))
    .map(({ profile, location }) => ({ id: profile.id, latitude: location!.latitude, longitude: location!.longitude }))
    .sort((left, right) => left.id.localeCompare(right.id));
}
