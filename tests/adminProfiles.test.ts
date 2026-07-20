import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildAdminProfilesResponse } from '../Back/src/adminProfiles.ts';
import { ApiError, api } from '../Front/src/lib/api.ts';
import { defaultAdminProfileFilters, profileMatchesAdminFilters, resolveAdminProfilesResult } from '../Front/src/lib/adminProfiles.ts';
import type { Profile } from '../Front/src/types.ts';

function profile(index: number, patch: Partial<Profile> = {}): Profile {
  return {
    id: `profile-${index}`,
    user_id: `user-${index}`,
    display_name: `Profile ${index}`,
    languages: [],
    available_now: false,
    mobile_service: false,
    private_studio: false,
    verified: false,
    status: index % 2 ? 'pending' : 'active',
    subscription_status: 'none',
    ...patch
  };
}

test('admin profiles response preserves nullable opening_hours and source_url_normalized', () => {
  const payload = buildAdminProfilesResponse([
    profile(1, { opening_hours: null, source_url_normalized: null })
  ]);
  assert.equal(payload.profiles.length, 1);
  assert.equal(payload.profiles[0].opening_hours, null);
  assert.equal(payload.profiles[0].source_url_normalized, null);
});

test('all default admin filters retain all 70 existing profiles', () => {
  const profiles = Array.from({ length: 70 }, (_, index) => profile(index, {
    is_published: index < 12,
    opening_hours: index % 2 ? null : {},
    source_url_normalized: null
  }));
  const response = buildAdminProfilesResponse(profiles);
  const filtered = response.profiles.filter((row) => profileMatchesAdminFilters(row, '', defaultAdminProfileFilters));
  assert.equal(response.stats.total_profiles, 70);
  assert.equal(response.profiles.filter((row) => row.is_published).length, 12);
  assert.equal(response.profiles.filter((row) => !row.is_published).length, 58);
  assert.equal(filtered.length, 70);
});

test('global admin profile statistics are independent from the loaded list page', () => {
  const page = Array.from({ length: 200 }, (_, index) => profile(index));
  const globalStats = {
    total_profiles: 361,
    active_profiles: 116,
    pending_profiles: 25,
    suspended_profiles: 3,
    test_accounts: 2,
    sponsored_total: 48,
    approved_total: 140,
    pending_approval_total: 190,
    published_total: 121,
    awaiting_owner_total: 17,
    sponsored_approved: 20,
    sponsored_pending: 25,
    sponsored_other_moderation: 3,
    sponsored_published: 18,
    sponsored_awaiting_owner: 17
  };
  const response = buildAdminProfilesResponse(page, globalStats, {
    page_size: 200, pages_loaded: 1, loaded_profiles: 200, safety_limit: 5000, truncated: false
  });
  assert.equal(response.profiles.length, 200);
  assert.equal(response.stats.total_profiles, 361);
  assert.equal(response.stats.sponsored_total, response.stats.sponsored_approved + response.stats.sponsored_pending + response.stats.sponsored_other_moderation);
  assert.equal(response.stats.approved_total, 140);
  assert.equal(response.stats.published_total, 121);
  assert.equal(response.stats.sponsored_awaiting_owner, 17);
});

test('existing admin profile filters still filter selected values', () => {
  const profiles = [profile(1, { city: 'berlin', is_published: true }), profile(2, { city: 'hamburg', is_published: false })];
  assert.deepEqual(
    profiles.filter((row) => profileMatchesAdminFilters(row, '', { ...defaultAdminProfileFilters, published: 'yes' })).map((row) => row.id),
    ['profile-1']
  );
});

test('admin profiles API error is not converted to an empty list', () => {
  const result = resolveAdminProfilesResult({ status: 'rejected', reason: new ApiError('Supabase unavailable', 503) });
  assert.deepEqual(result, { ok: false, error: 'HTTP 503: Supabase unavailable' });
  assert.equal('data' in result, false);
});

test('admin profiles API exposes HTTP status in its error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Supabase query failed' }), {
    status: 502,
    headers: { 'Content-Type': 'application/json' }
  });
  try {
    await assert.rejects(api.adminProfiles('token'), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 502);
      assert.equal(error.message, 'HTTP 502: Supabase query failed');
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin profiles endpoint pages the list and computes exact canonical global counts', async () => {
  const source = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const branch = source.slice(source.indexOf("adminRouter.get('/profiles'"), source.indexOf("adminRouter.get('/profiles/visibility-audit'"));
  assert.match(branch, /const pageSize = 200/);
  assert.match(branch, /const safetyLimit = 5000/);
  assert.match(branch, /\.range\(offset, Math\.min\(offset \+ pageSize, safetyLimit\) - 1\)/);
  assert.doesNotMatch(branch, /\.limit\(300\)/);
  assert.match(source, /select\('id', \{ count: 'exact', head: true \}\)/);
  assert.match(source, /eq\('sponsorship_type', 'admin_sponsored'\)/);
  assert.match(source, /sponsored_other_moderation: Math\.max\(0, counts\[5\] - counts\[10\] - counts\[11\]\)/);
  const adminPage = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  assert.match(adminPage, /view === 'dashboard' \? api\.adminProfileStats\(accessToken\) : api\.adminProfiles\(accessToken\)/);
});
