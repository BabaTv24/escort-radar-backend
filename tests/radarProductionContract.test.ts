import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isRadarRequest } from '../Back/src/radarPool.js';
import { buildCityOnlyLayoutIndexes, CITY_ONLY_LAYOUT_SPACING_METERS, disperseCityOnlyLocation, resolveEffectivePublicLocation } from '../Back/src/publicLocation.js';
import { clearPublicProfilesRequestCache, getPublicProfiles } from '../Front/src/lib/publicProfiles.js';
import {
  MAX_RADAR_RADIUS_METERS,
  MIN_RADAR_RADIUS_METERS,
  RADAR_RADIUS_STEPS_METERS,
  formatRadiusMeters,
  getRadarWheelDirection,
  radarRadiusStorageKey,
  radarRadiusToSliderPosition,
  readSavedRadarRadius,
  resolveManualSearcherLocation,
  saveRadarRadius,
  sliderPositionToRadarRadius,
  stepRadarRadius
} from '../Front/src/lib/geo.js';
import { clusterRadarPoints, getRadarPoint } from '../Front/src/lib/radarLayout.js';
import { buildRadarCenterFeatureCollection, buildRadarProfileFeatureCollection, buildRadarRadiusFeatureCollection, getRadarRadiusBounds } from '../Front/src/lib/radarMapData.js';
import { selectRadarProfiles } from '../Front/src/lib/homeRadar.js';

test('frontend radar=1 reaches the exact backend radar branch and never accepts a 60-row non-radar response', async () => {
  assert.equal(isRadarRequest('1'), true);
  assert.equal(isRadarRequest('true'), false);
  assert.equal(isRadarRequest(true), false);

  const routeSource = await readFile(new URL('../Back/src/routes/profiles.ts', import.meta.url), 'utf8');
  assert.match(routeSource, /const radarMode = isRadarRequest\(req\.query\.radar\)/);

  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  const records = Array.from({ length: 61 }, (_, index) => ({ id: `profile-${index}`, display_name: `Profile ${index}` }));
  try {
    globalThis.fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        profiles: records,
        radar_meta: {
          fetched_candidates: 61,
          eligible_candidates: 61,
          located_candidates: 61,
          unlocated_candidates: 0,
          pages_fetched: 1,
          truncated: false,
          candidates_before_filters: 61,
          candidates_public: 61,
          missing_location: 0,
          rejected_by_reason: {},
          duration_ms: 1,
          response_bytes: 1
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    clearPublicProfilesRequestCache();
    const profiles = await getPublicProfiles(new URLSearchParams({ radar: '1' }));
    const requested = new URL(requestedUrl);
    assert.equal(`${requested.pathname}${requested.search}`, '/api/profiles?radar=1');
    assert.equal(profiles.length, 61);

    globalThis.fetch = async () => new Response(JSON.stringify({ profiles: records.slice(0, 60) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    clearPublicProfilesRequestCache();
    await assert.rejects(
      getPublicProfiles(new URLSearchParams({ radar: '1' })),
      /backend did not execute global radar mode/
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearPublicProfilesRequestCache();
  }
});

test('the 150 km radius persists across HomePage and CityPage mounts', async () => {
  const originalWindow = globalThis.window;
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key)
      }
    }
  });
  try {
    saveRadarRadius(MAX_RADAR_RADIUS_METERS);
    assert.equal(values.get(radarRadiusStorageKey), '150000');
    assert.equal(readSavedRadarRadius(), MAX_RADAR_RADIUS_METERS);

    const homeSource = await readFile(new URL('../Front/src/pages/HomePage.tsx', import.meta.url), 'utf8');
    const citySource = await readFile(new URL('../Front/src/pages/CityPage.tsx', import.meta.url), 'utf8');
    assert.match(homeSource, /useState\(readSavedRadarRadius\)/);
    assert.match(citySource, /radius: readSavedRadarRadius\(\)/);
    assert.match(homeSource, /saveRadarRadius\(value\)/);
    assert.match(citySource, /saveRadarRadius\(Number\(value\)\)/);
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  }
});

test('radar points preserve Haversine distance and bearing while overlapping profiles form a cluster', () => {
  const atOneKm = getRadarPoint(1_000, 0.3, 90);
  const atWideRadius = getRadarPoint(15_700, 0.3, 90);
  assert.ok(atOneKm.left > atWideRadius.left, 'the same profile must move toward the center when radius grows');
  assert.equal(atOneKm.top, 50);
  assert.ok(Math.abs(atOneKm.left - (50 + .3 * 39)) < 1e-10);
  assert.ok(Math.abs(atWideRadius.left - (50 + .3 / 15.7 * 39)) < 1e-10);

  const north = getRadarPoint(1_000, 0.5, 0);
  assert.equal(north.left, 50);
  assert.ok(north.top < 50);

  const points = Array.from({ length: 35 }, () => ({ point: getRadarPoint(150_000, 0.3, 0) }));
  const clusters = clusterRadarPoints(points, 9);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].items.length, 35);
  assert.deepEqual(clusters[0].point, points[0].point);

  const chained = clusterRadarPoints([
    { point: { left: 40, top: 50 } },
    { point: { left: 50, top: 50 } },
    { point: { left: 45, top: 50 } }
  ], 6);
  assert.equal(chained.length, 1, 'a marker bridging two collision groups must merge both clusters');
});

test('MapLibre GeoJSON preserves longitude/latitude order and radius changes update the polygon', () => {
  const item = {
    profile: { id: 'safe-profile', display_name: 'Safe profile' },
    distanceKm: 1,
    operatorStatus: 'ONLINE_NOW',
    statusClass: 'online-now',
    favorite: false,
    radarLocation: {
      lat: 52.52,
      lng: 13.405,
      label: 'Berlin',
      precision: 'exact' as const,
      approximate: false
    }
  } as any;
  const collection = buildRadarProfileFeatureCollection([item]);
  assert.deepEqual(collection.features[0].geometry.coordinates, [13.405, 52.52]);

  const center = { lat: 52.52, lng: 13.405, source: 'city' as const };
  const small = buildRadarRadiusFeatureCollection(center, 1_000);
  const large = buildRadarRadiusFeatureCollection(center, 10_000);
  assert.notDeepEqual(small, large);
  assert.equal(small.features[0].properties.radiusMeters, 1_000);
  assert.equal(large.features[0].properties.radiusMeters, 10_000);
});

test('MapLibre circle and camera bounds preserve the exact selected geographic radius', async () => {
  const center = { lat: 52.52, lng: 13.405, source: 'city' as const };
  for (const radiusMeters of [10, 100, 1_000, 10_000, 150_000]) {
    const circle = buildRadarRadiusFeatureCollection(center, radiusMeters);
    const [longitude, latitude] = circle.features[0].geometry.coordinates[0][0];
    const measured = haversineMeters(
      { latitude: center.lat, longitude: center.lng },
      { latitude, longitude }
    );
    assert.ok(Math.abs(measured - radiusMeters) < .02, `${radiusMeters} m circle measured ${measured} m`);

    const bounds = getRadarRadiusBounds(center, radiusMeters);
    assert.ok(bounds[0][0] < center.lng && bounds[1][0] > center.lng);
    assert.ok(bounds[0][1] < center.lat && bounds[1][1] > center.lat);
  }

  const mapSource = await readFile(new URL('../Front/src/components/RadarMapLibre.tsx', import.meta.url), 'utf8');
  assert.match(mapSource, /maxZoom: 22/);
  assert.doesNotMatch(mapSource, /maxZoom: 15/);
});

test('wheel and slider share one bounded, controlled radius scale', async () => {
  assert.equal(getRadarWheelDirection(-120), 'decrease');
  assert.equal(getRadarWheelDirection(-.25), 'decrease');
  assert.equal(getRadarWheelDirection(120), 'increase');
  assert.equal(getRadarWheelDirection(.25), 'increase');
  assert.equal(getRadarWheelDirection(0), null);

  assert.equal(stepRadarRadius(100, 'decrease'), 50);
  assert.equal(stepRadarRadius(100, 'increase'), 200);
  assert.equal(stepRadarRadius(MIN_RADAR_RADIUS_METERS, 'decrease'), MIN_RADAR_RADIUS_METERS);
  assert.equal(stepRadarRadius(MAX_RADAR_RADIUS_METERS, 'increase'), MAX_RADAR_RADIUS_METERS);

  let radius = MIN_RADAR_RADIUS_METERS;
  for (let index = 0; index < 1_000; index += 1) radius = stepRadarRadius(radius, 'increase');
  assert.equal(radius, MAX_RADAR_RADIUS_METERS);
  for (let index = 0; index < 1_000; index += 1) radius = stepRadarRadius(radius, 'decrease');
  assert.equal(radius, MIN_RADAR_RADIUS_METERS);

  RADAR_RADIUS_STEPS_METERS.forEach((stepRadius, position) => {
    assert.equal(sliderPositionToRadarRadius(position), stepRadius);
    assert.equal(radarRadiusToSliderPosition(stepRadius), position);
  });
  assert.equal(sliderPositionToRadarRadius(-999), MIN_RADAR_RADIUS_METERS);
  assert.equal(sliderPositionToRadarRadius(999), MAX_RADAR_RADIUS_METERS);
  assert.equal(formatRadiusMeters(10), '10 m');
  assert.equal(formatRadiusMeters(500), '500 m');
  assert.equal(formatRadiusMeters(1_000), '1 km');
  assert.equal(formatRadiusMeters(150_000), '150 km');

  const searchCenter = { lat: 52.42, lng: 13.497, source: 'manual_saved' as const };
  const nearbyProfile = {
    id: 'near-rudow',
    display_name: 'Near Rudow',
    city: 'Berlin',
    status: 'active',
    is_published: true,
    moderation_status: 'approved',
    shadowbanned: false,
    latitude: 52.4205,
    longitude: 13.497,
    location_mode: 'exact',
    location_visibility: 'exact',
    operator_status: 'OFFLINE',
    profile_images: []
  } as any;
  assert.equal(selectRadarProfiles([nearbyProfile], searchCenter, 50, 'all').length, 0);
  assert.equal(selectRadarProfiles([nearbyProfile], searchCenter, 100, 'all').length, 1);

  const panelSource = await readFile(new URL('../Front/src/components/RadarPanel.tsx', import.meta.url), 'utf8');
  assert.match(panelSource, /stepRadarRadius\(radiusRef\.current, direction\)/);
  assert.match(panelSource, /onRadiusChangeRef\.current\(nextRadius\)/);
  assert.match(panelSource, /sliderPositionToRadarRadius\(Number\(event\.target\.value\)\)/);
  assert.doesNotMatch(panelSource, /useState\(radius\)/);
});

test('MapLibre wheel zoom is disabled and the explicit search center survives radius and camera changes', async () => {
  const rudow = resolveManualSearcherLocation('12355 Berlin Rudow');
  assert.ok(rudow);
  const searchCenter = [rudow.lng, rudow.lat];
  assert.deepEqual(searchCenter, [13.497, 52.42]);

  for (const radius of [10, 100, 1_000, 50_000, 150_000]) {
    const centerFeature = buildRadarCenterFeatureCollection(rudow);
    const radiusFeature = buildRadarRadiusFeatureCollection(rudow, radius);
    assert.deepEqual(centerFeature.features[0].geometry.coordinates, searchCenter);
    assert.equal(radiusFeature.features[0].properties.radiusMeters, radius);
  }

  const mapSource = await readFile(new URL('../Front/src/components/RadarMapLibre.tsx', import.meta.url), 'utf8');
  assert.match(mapSource, /scrollZoom: false/);
  assert.match(mapSource, /searchCenter: readonly \[longitude: number, latitude: number\]/);
  assert.doesNotMatch(mapSource, /map\.on\(['"]move/);
  assert.doesNotMatch(mapSource, /map\.on\(['"]dragend/);

  const citySource = await readFile(new URL('../Front/src/pages/CityPage.tsx', import.meta.url), 'utf8');
  assert.match(citySource, /searchCenterRevisionRef/);
  assert.match(citySource, /selectRadarProfiles\(profiles, searcherLocation, draftFilters\.radius/);
  const homeSource = await readFile(new URL('../Front/src/pages/HomePage.tsx', import.meta.url), 'utf8');
  assert.match(homeSource, /searcherLocation=\{searcherLocation\}/);
  assert.match(homeSource, /onRadiusChange=\{\(value\) =>/);
});

test('city_only layout is stable, country-aware and uses nominal 350 metre spacing', () => {
  assert.equal(CITY_ONLY_LAYOUT_SPACING_METERS, 350);
  const profiles = [
    { id: 'b', work_country: 'DE', work_city: 'Berlin', location_visibility: 'city_only' },
    { id: 'a', work_country: 'DE', work_city: 'Berlin', location_visibility: 'city_only' },
    { id: 'pl', work_country: 'PL', work_city: 'Berlin', location_visibility: 'city_only' }
  ];
  const forward = buildCityOnlyLayoutIndexes(profiles);
  const reversed = buildCityOnlyLayoutIndexes([...profiles].reverse());
  assert.equal(forward.get('a'), 0);
  assert.equal(forward.get('b'), 1);
  assert.equal(forward.get('pl'), 0, 'the same city label in another country must start a separate group');
  assert.deepEqual([...forward].sort(), [...reversed].sort());

  const berlin = { latitude: 52.52, longitude: 13.405 };
  const first = disperseCityOnlyLocation(berlin.latitude, berlin.longitude, 0);
  const second = disperseCityOnlyLocation(berlin.latitude, berlin.longitude, 1);
  const distance = haversineMeters(first, second);
  assert.ok(distance >= 300 && distance <= 400, `expected 300-400 m, received ${distance}`);

  const positions = Array.from({ length: 18 }, (_, index) => disperseCityOnlyLocation(berlin.latitude, berlin.longitude, index));
  assert.ok(new Set(positions.map((point) => `${point.latitude.toFixed(7)},${point.longitude.toFixed(7)}`)).size > 1);
});

test('public radar contract hides city_only raw coordinates, contacts and galleries', async () => {
  const safe = resolveEffectivePublicLocation({
    id: 'city-only',
    work_country: 'DE',
    work_city: 'Berlin',
    location_mode: 'city_only',
    location_visibility: 'city_only',
    latitude: 48.123456,
    longitude: 11.123456
  }, 0);
  assert.ok(safe);
  assert.notEqual(safe!.latitude, 48.123456);
  assert.notEqual(safe!.longitude, 11.123456);
  assert.equal(safe!.location_precision, 'city');
  assert.equal(safe!.location_approximate, true);

  const routeSource = await readFile(new URL('../Back/src/routes/profiles.ts', import.meta.url), 'utf8');
  const radarSelect = routeSource.slice(routeSource.indexOf('const radarSelect'), routeSource.indexOf("].join(', ')"));
  assert.doesNotMatch(radarSelect, /primary_phone|additional_phones|whatsapp|telegram|description/);
  assert.match(routeSource, /sanitizePublicProfile\(withImageUrls\(profile\), location, 1\)/);
  assert.match(routeSource, /const \{ phone, primary_phone, additional_phones, whatsapp, telegram/);
});

test('Radar uses MapLibre/OpenFreeMap without Google, Mapbox or an API key', async () => {
  const mapSource = await readFile(new URL('../Front/src/components/RadarMapLibre.tsx', import.meta.url), 'utf8');
  const panelSource = await readFile(new URL('../Front/src/components/RadarPanel.tsx', import.meta.url), 'utf8');
  assert.match(mapSource, /maplibre-gl/);
  assert.match(mapSource, /https:\/\/tiles\.openfreemap\.org\/styles\/liberty/);
  assert.match(mapSource, /OpenStreetMap/);
  assert.doesNotMatch(`${mapSource}\n${panelSource}`, /google\.maps|maps\.googleapis|mapbox|apiKey/i);
});

function haversineMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number }
) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const startLatitude = toRadians(left.latitude);
  const endLatitude = toRadians(right.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
