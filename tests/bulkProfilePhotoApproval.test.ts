import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildProfilePhotoApprovalResult, validateProfilePhotoApprovalInput } from '../Back/src/bulkProfilePhotoApproval.js';

const profileA = '11111111-1111-4111-8111-111111111111';
const profileB = '22222222-2222-4222-8222-222222222222';
const missing = '33333333-3333-4333-8333-333333333333';

test('profile photo approval validates input, removes duplicates and caps unique profiles at 100', () => {
  assert.match(validateProfilePhotoApprovalInput({}).error || '', /required/);
  assert.match(validateProfilePhotoApprovalInput({ profile_ids: [] }).error || '', /required/);
  assert.match(validateProfilePhotoApprovalInput({ profile_ids: [''] }).error || '', /empty/);
  assert.match(validateProfilePhotoApprovalInput({ profile_ids: ['bad'] }).error || '', /UUID/);
  assert.deepEqual(validateProfilePhotoApprovalInput({ profile_ids: [profileA, profileA, profileB] }), { profileIds: [profileA, profileB] });
  const overLimit = Array.from({ length: 101 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  assert.match(validateProfilePhotoApprovalInput({ profile_ids: overLimit }).error || '', /100/);
});

test('only pending photos are approved while approved and rejected photos stay unchanged', () => {
  const result = buildProfilePhotoApprovalResult(
    [profileA, profileB],
    [profileA, profileB],
    [
      { profile_id: profileA, moderation_status: 'pending' },
      { profile_id: profileA, moderation_status: 'approved' },
      { profile_id: profileA, moderation_status: 'rejected' },
      { profile_id: profileB, moderation_status: 'pending' }
    ],
    [{ profile_id: profileA }, { profile_id: profileB }]
  );
  assert.deepEqual({ pending: result.pending_found, approved: result.approved, already: result.already_approved, failed: result.failed }, { pending: 2, approved: 2, already: 1, failed: 0 });
  assert.equal(result.profiles[0].approved, 1);
  assert.equal(result.profiles[1].approved, 1);
});

test('profiles without photos and missing profiles do not stop the batch', () => {
  const result = buildProfilePhotoApprovalResult([profileA, profileB, missing], [profileA, profileB], [], []);
  assert.equal(result.requested_profiles, 3);
  assert.equal(result.matched_profiles, 2);
  assert.equal(result.pending_found, 0);
  assert.equal(result.profiles.find((profile) => profile.profile_id === missing)?.status, 'not_found');
});

test('repeat execution is idempotent and a concurrent approval is not a critical failure', () => {
  const repeated = buildProfilePhotoApprovalResult([profileA], [profileA], [{ profile_id: profileA, moderation_status: 'approved' }], []);
  assert.deepEqual({ pending: repeated.pending_found, approved: repeated.approved, already: repeated.already_approved, failed: repeated.failed }, { pending: 0, approved: 0, already: 1, failed: 0 });
  const concurrent = buildProfilePhotoApprovalResult([profileA], [profileA], [{ profile_id: profileA, moderation_status: 'pending' }], []);
  assert.deepEqual({ approved: concurrent.approved, already: concurrent.already_approved, failed: concurrent.failed }, { approved: 0, already: 1, failed: 0 });
});

test('database update failure is reported as partial failure', () => {
  const result = buildProfilePhotoApprovalResult([profileA], [profileA], [{ profile_id: profileA, moderation_status: 'pending' }], [], true);
  assert.deepEqual({ approved: result.approved, failed: result.failed }, { approved: 0, failed: 1 });
});

test('one protected endpoint performs one set-based pending-only update and one audit entry', async () => {
  const source = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const endpointStart = source.indexOf("adminRouter.post('/profile-images/approve-by-profiles'");
  const endpointEnd = source.indexOf("adminRouter.get('/uploads'", endpointStart);
  const branch = source.slice(endpointStart, endpointEnd);
  assert.ok(source.indexOf('adminRouter.use(verifyAdminJwt, requireAdmin)') < endpointStart);
  assert.match(branch, /validateProfilePhotoApprovalInput/);
  assert.match(branch, /\.update\(\{ moderation_status: 'approved' \}\)/);
  assert.match(branch, /\.in\('profile_id', matchedProfileIds\)/);
  assert.match(branch, /\.eq\('moderation_status', 'pending'\)/);
  assert.equal((branch.match(/\.update\(/g) || []).length, 1);
  assert.equal((branch.match(/logAdminAction\(/g) || []).length, 1);
  assert.match(branch, /bulk_profile_images_approved/);
  assert.doesNotMatch(branch, /is_primary|is_cover|sort_order|is_hidden|is_private|storage_path|storage\.remove/);
});

test('profile control sends one profile_ids request without global loading or clearing selection', async () => {
  const page = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  const start = page.indexOf('async function confirmBulkProfilePhotoApproval');
  const end = page.indexOf('async function refreshDeletionPinStatus', start);
  const branch = page.slice(start, end);
  assert.match(page, /disabled=\{!selectedProfileIds\.length \|\| bulkProfilePhotosBusy\}/);
  assert.match(page, /admin\.bulkPhotos\.actionWithCount/);
  assert.match(page, /admin-bulk-profile-photo-approval/);
  assert.match(branch, /api\.approveProfileImagesByProfiles\(token, requestedProfileIds\)/);
  assert.match(branch, /const requestedProfileIds = \[\.\.\.selectedProfileIds\]/);
  assert.doesNotMatch(branch, /for \(|Promise\.all|bulkModerateProfileImages|setLoading\(|await load\(|api\.adminProfiles|api\.adminPhotos/);
  assert.doesNotMatch(branch, /setSelectedProfileIds/);
  assert.equal((branch.match(/setProfiles\(/g) || []).length, 1);
  assert.match(branch, /moderation_status === 'pending'/);
});

test('bulk profile photo copy exists in PL EN and DE', async () => {
  for (const locale of ['pl', 'en', 'de']) {
    const source = await readFile(new URL(`../Front/src/locales/${locale}.json`, import.meta.url), 'utf8');
    for (const key of ['title', 'actionWithCount', 'confirm', 'confirmAction', 'success', 'nonePending', 'failureNotice', 'inProgress']) {
      assert.match(source, new RegExp(`"admin\\.bulkPhotos\\.${key}"`));
    }
  }
});
