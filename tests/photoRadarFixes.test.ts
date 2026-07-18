import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runBulkPhotoModeration, validateBulkPhotoModerationInput } from '../Back/src/bulkPhotoModeration.js';
import { MAX_RADAR_RADIUS_METERS, MIN_RADAR_RADIUS_METERS, getCityCenter, isProfileInRadarRange, resolveManualSearcherLocation, resolveProfileRadarLocation, safeDistanceKm } from '../Front/src/lib/geo.js';
import { isPublicProfile } from '../Back/src/publicProfiles.js';
import { resolveEffectivePublicLocation } from '../Back/src/publicLocation.js';
import { selectSponsoredProfilesForLocation } from '../Front/src/lib/sponsoredProfiles.js';
import { matchesRadarStatus } from '../Front/src/lib/homeRadar.js';

const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
];

test('bulk photo moderation validates UUIDs, operation and the 100 item limit', () => {
  assert.deepEqual(validateBulkPhotoModerationInput({ image_ids: ids, operation: 'approve' }), { operation: 'approve', imageIds: ids });
  assert.match(validateBulkPhotoModerationInput({ image_ids: ['bad'], operation: 'approve' }).error || '', /UUID/);
  assert.match(validateBulkPhotoModerationInput({ image_ids: Array.from({ length: 101 }, () => ids[0]), operation: 'reject' }).error || '', /100/);
});

test('bulk approve continues after one failure and reports every selected photo', async () => {
  const calls: string[] = [];
  const result = await runBulkPhotoModeration(ids, 'approve', async (id) => {
    calls.push(id);
    if (id === ids[1]) throw new Error('temporary failure');
    return id === ids[2] ? 'skipped' : 'updated';
  });
  assert.deepEqual(calls, ids);
  assert.deepEqual({ approved: result.approved, skipped: result.skipped, failed: result.failed }, { approved: 1, skipped: 1, failed: 1 });
  assert.equal(result.items[1].status, 'failed');
});

test('bulk route is admin protected and changes neither cover nor sort order', async () => {
  const source = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  assert.ok(source.indexOf('adminRouter.use(verifyAdminJwt, requireAdmin)') < source.indexOf("adminRouter.post('/profile-images/bulk-moderate'"));
  const branch = source.slice(source.indexOf("adminRouter.post('/profile-images/bulk-moderate'"), source.indexOf("adminRouter.get('/uploads'"));
  assert.match(branch, /update\(\{ moderation_status: moderationStatus \}\)/);
  assert.doesNotMatch(branch, /is_primary|is_cover|sort_order|storage\.remove/);
});

test('photo moderation UI selects pending only, supports deselection and keeps failed IDs selected', async () => {
  const source = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /pendingPhotoIds = filteredPhotos\.filter/);
  assert.match(source, /moderation_status \|\| 'pending'\) === 'pending'/);
  assert.match(source, /disabled=\{String\(photo\.moderation_status \|\| 'pending'\) !== 'pending'/);
  assert.match(source, /togglePhotoSelection/);
  assert.match(source, /current\.filter\(\(id\) => id !== imageId\)/);
  assert.match(source, /failedIds\.has\(id\)/);
  assert.match(source, /bulkModerateProfileImages/);
});

test('mobile radar uses one 10 m to 150 km slider ordered directly after the visual', async () => {
  const component = await readFile(new URL('../Front/src/components/RadarPanel.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../Front/src/components/RadarPanel.css', import.meta.url), 'utf8');
  assert.equal((component.match(/type="range"/g) || []).length, 1);
  assert.equal(MIN_RADAR_RADIUS_METERS, 10);
  assert.equal(MAX_RADAR_RADIUS_METERS, 150_000);
  assert.match(css, /\.radar-panel \.radar-visual \{ order: 3/);
  assert.match(css, /\.radar-radius-control \{ order: 4/);
  assert.match(css, /\.radar-status-control \{ order: 5/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /max-width: 100%/);
  assert.match(css, /@media \(max-width: 720px\)/);
});

test('12353 resolves correctly and Haversine includes exactly 150 km but excludes 150.1 km', () => {
  const center = resolveManualSearcherLocation('12353 Berlin Buckow/Rudow');
  assert.deepEqual(center, { lat: 52.424, lng: 13.462, label: '12353 Berlin Buckow / Rudow', source: 'manual', city: 'Berlin' });
  assert.ok(center);
  const pointAt = { latitude: center!.lat + 150 / 111.195, longitude: center!.lng };
  const pointOutside = { latitude: center!.lat + 150.1 / 111.195, longitude: center!.lng };
  const atDistance = safeDistanceKm(center!, { lat: pointAt.latitude, lng: pointAt.longitude });
  assert.ok(atDistance !== null && Math.abs(atDistance - 150) < .05);
  assert.equal(isProfileInRadarRange({ id: 'pl', display_name: 'PL', city: 'Poland', location_visibility: 'postal_area', ...pointAt } as any, center!, 150_000).inRange, true);
  assert.equal(isProfileInRadarRange({ id: 'pl', display_name: 'PL', city: 'Poland', location_visibility: 'postal_area', ...pointAt } as any, center!, 30_000).inRange, false);
  assert.equal(isProfileInRadarRange({ id: 'pl2', display_name: 'PL2', city: 'Poland', location_visibility: 'postal_area', ...pointOutside } as any, center!, 150_000).inRange, false);
});

test('global radar candidates are paged and bypass city/country filters before distance', async () => {
  const route = await readFile(new URL('../Back/src/routes/profiles.ts', import.meta.url), 'utf8');
  const city = await readFile(new URL('../Front/src/pages/CityPage.tsx', import.meta.url), 'utf8');
  const panel = await readFile(new URL('../Front/src/components/RadarPanel.tsx', import.meta.url), 'utf8');
  assert.match(route, /if \(city && !radarMode\)/);
  assert.match(route, /for \(let offset = 0; pagesFetched < maxPages; offset \+= pageSize\)/);
  assert.match(route, /query\.range\(offset, offset \+ pageSize - 1\)/);
  assert.match(route, /radarMode \|\| !country/);
  assert.match(route, /tagIds\.length && !radarMode/);
  assert.match(route, /isActivePublicCategory\(profile\.category\)/);
  assert.match(route, /radarMode \|\| !categoryFilter/);
  assert.match(route, /prepareRadarCandidatePool\(data, pagesFetched, truncated\)/);
  assert.match(route, /fetched_candidates|eligible_candidates|located_candidates|unlocated_candidates|pages_fetched|truncated/);
  assert.match(city, /new URLSearchParams\(\{ radar: '1' \}\)/);
  assert.match(city, /selectRadarProfiles\(profiles, searcherLocation/);
  assert.match(city, /profilesWithoutLocationCount=/);
  const radarPipeline = panel.slice(panel.indexOf('const radarProfiles ='), panel.indexOf('if (import.meta.env.DEV)'));
  assert.doesNotMatch(radarPipeline, /\.slice\(/);
  assert.match(radarPipeline, /selectRadarProfiles/);
  assert.equal(matchesRadarStatus({ operator_status: 'OFFLINE' } as any, 'all'), true);
  assert.match(route, /radarSelect/);
  assert.match(route, /response_bytes/);
});

test('admin profiles use a scoped request and photo moderation never requests the public radar', async () => {
  const admin = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(admin, /radar=1|params\.set\('radar'/);

  const loadStart = admin.indexOf('async function load(');
  const loadEnd = admin.indexOf('\n  useEffect(', loadStart);
  assert.ok(loadStart >= 0 && loadEnd > loadStart, 'scoped admin loader should exist');
  const loadSource = admin.slice(loadStart, loadEnd);
  const profileBranchStart = loadSource.indexOf("if (view === 'profiles' || view === 'profile-studio')");
  const photoBranchStart = loadSource.indexOf("if (view === 'photos')", profileBranchStart);
  const fullLoadStart = loadSource.indexOf('const [', photoBranchStart);
  assert.ok(profileBranchStart >= 0 && photoBranchStart > profileBranchStart && fullLoadStart > photoBranchStart);

  const profileBranch = loadSource.slice(profileBranchStart, photoBranchStart);
  const photoBranch = loadSource.slice(photoBranchStart, fullLoadStart);
  assert.deepEqual(profileBranch.match(/api\.[A-Za-z]+/g), ['api.adminProfiles']);
  assert.deepEqual(photoBranch.match(/api\.[A-Za-z]+/g), ['api.adminPhotos']);
  assert.match(profileBranch, /return;/);
  assert.match(photoBranch, /return;/);

  const actionSource = admin.slice(admin.indexOf('async function action('), admin.indexOf('function togglePhotoSelection'));
  assert.match(actionSource, /await fn\(\);[\s\S]*await load\(\);/);
  const bulkSource = admin.slice(admin.indexOf('async function confirmBulkProfilePhotoApproval('), admin.indexOf('async function refreshDeletionPinStatus'));
  assert.doesNotMatch(bulkSource, /\bload\(/);
  assert.match(bulkSource, /setProfiles\(\(current\)/);
  assert.match(bulkSource, /setPhotos\(\(current\)/);
  assert.match(admin, /columns=\{\['cover',[\s\S]*'public_visibility', 'availability', 'moderation',[\s\S]*'photos'/);
  assert.match(admin, /function ProfilePhotoCounts/);
  assert.match(admin, /photosApproved/);
  assert.match(admin, /photosPending/);
  assert.match(admin, /photosRejected/);
});

test('radius and status changes do not refetch an unchanged radar candidate pool', async () => {
  const city = await readFile(new URL('../Front/src/pages/CityPage.tsx', import.meta.url), 'utf8');
  const publicProfiles = await readFile(new URL('../Front/src/lib/publicProfiles.ts', import.meta.url), 'utf8');
  const requestEffect = city.slice(city.indexOf('getPublicProfiles(query'), city.indexOf('const filteredProfiles'));
  assert.match(requestEffect, /\[query, retryKey\]/);
  assert.doesNotMatch(requestEffect, /\[query, appliedFilters, searcherLocation/);
  assert.match(requestEffect, /controller\.abort\(\)/);
  assert.match(publicProfiles, /publicProfilesInFlight/);
  assert.match(publicProfiles, /publicProfilesCache/);
  assert.match(publicProfiles, /AbortController/);
});

test('Szczecin and Bydgoszcz city-only profiles with null coordinates get safe city radar points while hidden stays absent', () => {
  for (const [city, latitude, longitude] of [
    ['Szczecin', 53.4285, 14.5528],
    ['Bydgoszcz', 53.1235, 18.0084]
  ] as const) {
    assert.deepEqual(resolveEffectivePublicLocation({ work_city: city, location_mode: 'city_only', location_visibility: 'city_only', latitude: null, longitude: null }), {
      latitude,
      longitude,
      location_approximate: true,
      location_precision: 'city'
    });
  }
  assert.equal(resolveEffectivePublicLocation({ work_city: 'Bydgoszcz', location_mode: 'exact_hidden', location_visibility: 'hidden' }), null);
});

test('sponsored profiles follow the selected city and never fall back to Berlin', () => {
  const profiles = [
    { id: 'berlin', display_name: 'Berlin', city: 'Berlin', is_sponsored: true, location_visibility: 'city_only' },
    { id: 'szczecin', display_name: 'Szczecin', city: 'Szczecin', is_sponsored: true, location_visibility: 'city_only' },
    { id: 'bydgoszcz', display_name: 'Bydgoszcz', city: 'Bydgoszcz', is_sponsored: true, location_visibility: 'city_only' }
  ] as any;
  const at = (city: string) => ({ ...getCityCenter(city), source: 'city' as const });
  assert.deepEqual(selectSponsoredProfilesForLocation(profiles, at('szczecin'), 25_000).map((profile) => profile.id), ['szczecin']);
  assert.deepEqual(selectSponsoredProfilesForLocation(profiles, at('bydgoszcz'), 25_000).map((profile) => profile.id), ['bydgoszcz']);
  assert.deepEqual(selectSponsoredProfilesForLocation([profiles[0]], at('szczecin'), 25_000), []);
});

test('public eligibility and location privacy stay independent from radar status', () => {
  assert.equal(isPublicProfile({ status: 'active', moderation_status: 'approved', is_published: true, shadowbanned: false }), true);
  for (const hidden of [
    { status: 'pending', moderation_status: 'approved', is_published: true, shadowbanned: false },
    { status: 'active', moderation_status: 'pending', is_published: true, shadowbanned: false },
    { status: 'active', moderation_status: 'approved', is_published: true, shadowbanned: true }
  ]) assert.equal(isPublicProfile(hidden), false);

  assert.equal(resolveProfileRadarLocation({ id: 'none', display_name: 'None', city: 'Unknown', location_visibility: 'postal_area' } as any), null);
  const cityOnly = resolveProfileRadarLocation({ id: 'city', display_name: 'City', city: 'Swiebodzin', location_visibility: 'city_only' } as any);
  assert.equal(cityOnly?.precision, 'city_fallback');
});
