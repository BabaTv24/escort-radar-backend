import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isRadarRequest } from '../Back/src/radarPool.js';
import { clearPublicProfilesRequestCache, getPublicProfiles } from '../Front/src/lib/publicProfiles.js';
import { MAX_RADAR_RADIUS_METERS, radarRadiusStorageKey, readSavedRadarRadius, saveRadarRadius } from '../Front/src/lib/geo.js';
import { getRadarPoint } from '../Front/src/lib/radarLayout.js';

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

test('35 compressed city-only markers receive stable readable visual positions at 150 km', () => {
  const first = Array.from({ length: 35 }, (_, index) => getRadarPoint(150_000, 0.3, 0, `szczecin-${index}`, true, index, 35));
  const second = Array.from({ length: 35 }, (_, index) => getRadarPoint(150_000, 0.3, 0, `szczecin-${index}`, true, index, 35));
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map(({ left, top }) => `${left.toFixed(6)}:${top.toFixed(6)}`)).size, 35);

  let nearestSeparation = Number.POSITIVE_INFINITY;
  for (let left = 0; left < first.length; left += 1) {
    for (let right = left + 1; right < first.length; right += 1) {
      nearestSeparation = Math.min(nearestSeparation, Math.hypot(first[left].left - first[right].left, first[left].top - first[right].top));
    }
  }
  assert.ok(nearestSeparation > 7, `nearest marker separation was only ${nearestSeparation}%`);
});
