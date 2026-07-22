import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { classifyProfileForPublish, runBulkProfilePublish } from '../Back/src/bulkProfilePublish.ts';
import { selectedIdsAfterBulkPublish } from '../Front/src/lib/bulkProfilePublish.ts';

function profile(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: 'active',
    moderation_status: 'approved',
    shadowbanned: false,
    category: 'ladies',
    is_published: false,
    subscription_status: 'expired',
    ...overrides
  };
}

test('approved active profile is published even without a paid subscription', async () => {
  const published: string[] = [];
  const result = await runBulkProfilePublish(['eligible'], [profile('eligible')], async (id) => { published.push(id); });
  assert.deepEqual(published, ['eligible']);
  assert.equal(result.items[0].status, 'published');
  assert.equal(result.published, 1);
});

test('moderation pending is skipped without changing publication', async () => {
  let called = false;
  const result = await runBulkProfilePublish(['pending'], [profile('pending', { moderation_status: 'pending' })], async () => { called = true; });
  assert.equal(called, false);
  assert.equal(result.items[0].status, 'skipped_moderation_pending');
});

test('suspended profile is skipped', () => {
  assert.equal(classifyProfileForPublish(profile('suspended', { status: 'suspended' })), 'skipped_suspended');
});

test('already published profile is reported separately', () => {
  assert.equal(classifyProfileForPublish(profile('published', { is_published: true })), 'already_published');
});

test('sponsored profile keeps the current public rule and needs no paid subscription', () => {
  assert.equal(classifyProfileForPublish(profile('sponsored', {
    is_sponsored: true,
    acquisition_source: 'admin_sponsored',
    subscription_status: 'expired'
  })), 'publishable');
});

test('mixed batch returns partial success and one failed record does not stop the batch', async () => {
  const updated: string[] = [];
  const ids = ['good', 'pending', 'already', 'bad', 'missing'];
  const result = await runBulkProfilePublish(ids, [
    profile('good'),
    profile('pending', { moderation_status: 'pending' }),
    profile('already', { is_published: true }),
    profile('bad')
  ], async (id) => {
    if (id === 'bad') throw new Error('database_error');
    updated.push(id);
  });

  assert.deepEqual(updated, ['good']);
  assert.deepEqual(result.items.map((item) => item.status), [
    'published',
    'skipped_moderation_pending',
    'already_published',
    'failed',
    'not_found'
  ]);
  assert.deepEqual({ published: result.published, already: result.already_published, skipped: result.skipped, failed: result.failed }, {
    published: 1,
    already: 1,
    skipped: 2,
    failed: 1
  });
});

test('frontend removes published IDs and preserves skipped and failed selections', () => {
  const remaining = selectedIdsAfterBulkPublish(['good', 'pending', 'bad'], {
    operation: 'publish', requested: 3, published: 1, already_published: 0, skipped: 1, failed: 1, updated: 1,
    items: [
      { profile_id: 'good', status: 'published' },
      { profile_id: 'pending', status: 'skipped_moderation_pending' },
      { profile_id: 'bad', status: 'failed' }
    ]
  });
  assert.deepEqual(remaining, ['pending', 'bad']);
});

test('admin UI renders publish summary and refreshes profiles after bulk publish', async () => {
  const source = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  const bulkPublishSource = source.slice(source.indexOf("if (operation === 'publish')"), source.indexOf('await action(async () =>', source.indexOf("if (operation === 'publish')")));
  assert.match(source, /BulkPublishSummary/);
  assert.match(bulkPublishSource, /const refreshed = await api\.adminProfileStats\(token\)/);
  assert.match(bulkPublishSource, /await loadProfileCatalogCountries\(token, true\)/);
  assert.doesNotMatch(bulkPublishSource, /api\.adminProfiles\(/);
  assert.match(source, /disabled=\{bulkPublishBusy\}/);
  assert.match(source, /selectedIdsAfterBulkPublish/);
});

test('bulk publish does not require deletion PIN while bulk delete still does', async () => {
  const source = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const publishBranch = source.slice(source.indexOf("operation === 'publish'"), source.indexOf("operation === 'unpublish'"));
  const deleteBranch = source.slice(source.indexOf("operation === 'delete'", source.indexOf("/profiles/bulk")), source.indexOf("Invalid bulk operation", source.indexOf("/profiles/bulk")));
  assert.doesNotMatch(publishBranch, /authorizeAdminDeletion|deletion_pin/);
  assert.match(deleteBranch, /authorizeAdminDeletion/);
});
