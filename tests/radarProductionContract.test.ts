import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isRadarRequest } from '../Back/src/radarPool.js';
import { clearPublicProfilesRequestCache, getPublicProfiles } from '../Front/src/lib/publicProfiles.js';
import { MAX_RADAR_RADIUS_METERS, radarRadiusStorageKey, readSavedRadarRadius, saveRadarRadius } from '../Front/src/lib/geo.js';
import { clusterRadarPoints, getRadarPoint } from '../Front/src/lib/radarLayout.js';

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
