import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { AdminOperationCenter } from '../Front/src/components/AdminOperationCenter.tsx';
import {
  createAdminOperation,
  executeAdminBatches,
  finalAdminOperationStatus,
  findActiveDuplicate,
  findAdminOperationConflict,
  shouldWarnBeforeAdminUnload,
  stableAdminOperationKey
} from '../Front/src/lib/adminOperations.ts';

function operation(ids = ['profile-1'], type = 'approve') {
  return createAdminOperation({
    type,
    labelKey: `admin.operations.type.${type}`,
    targetKind: 'profile',
    conflictGroup: 'profile-mutation',
    targetIds: ids,
    total: ids.length,
    indeterminate: false
  }, 100);
}

test('creating an admin process produces a preparing registry entry with a stable snapshot', () => {
  const created = operation(['b', 'a', 'a']);
  assert.equal(created.status, 'preparing');
  assert.deepEqual(created.targetIds, ['a', 'b']);
  assert.equal(created.completed, 0);
  assert.equal(created.total, 2);
});

test('operation key is stable for ordered ids and relevant parameter key order', () => {
  assert.equal(
    stableAdminOperationKey('publish', ['b', 'a'], { tier: 'gold', force: false }),
    stableAdminOperationKey('publish', ['a', 'b'], { force: false, tier: 'gold' })
  );
});

test('an identical active operation is found and cannot be launched twice', () => {
  const active = operation(['a', 'b']);
  assert.equal(findActiveDuplicate([active], active.key)?.id, active.id);
});

test('profile mutations conflict only when profile snapshots overlap', () => {
  const active = operation(['a', 'b']);
  assert.equal(findAdminOperationConflict([active], operation(['b', 'c'], 'publish'))?.id, active.id);
  assert.equal(findAdminOperationConflict([active], operation(['c', 'd'], 'publish')), undefined);
});

test('1957 items are processed sequentially in batches no larger than 100', async () => {
  const items = Array.from({ length: 1957 }, (_, index) => index);
  const sizes: number[] = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  const result = await executeAdminBatches({
    items,
    batchSize: 100,
    execute: async (batch) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      sizes.push(batch.length);
      await Promise.resolve();
      concurrent -= 1;
      return { succeeded: batch.length, skipped: 0, failed: 0 };
    }
  });
  assert.equal(sizes.length, 20);
  assert.equal(Math.max(...sizes), 100);
  assert.equal(sizes.at(-1), 57);
  assert.equal(maxConcurrent, 1);
  assert.equal(result.completed, 1957);
});

test('confirmed progress is emitted only after the API promise resolves', async () => {
  let resolveRequest!: () => void;
  const request = new Promise<void>((resolve) => { resolveRequest = resolve; });
  const updates: number[] = [];
  const running = executeAdminBatches({
    items: [1, 2],
    batchSize: 2,
    execute: async (batch) => {
      await request;
      return { succeeded: batch.length, skipped: 0, failed: 0 };
    },
    onProgress: (progress) => updates.push(progress.completed)
  });
  await Promise.resolve();
  assert.deepEqual(updates, []);
  resolveRequest();
  await running;
  assert.deepEqual(updates, [2]);
});

test('a failed safe batch is reported and later batches continue', async () => {
  const called: number[][] = [];
  const result = await executeAdminBatches({
    items: [1, 2, 3, 4, 5],
    batchSize: 2,
    errorTargetId: String,
    execute: async (batch, index) => {
      called.push([...batch]);
      if (index === 1) throw new Error('temporary token=secret failure');
      return { succeeded: batch.length, skipped: 0, failed: 0 };
    }
  });
  assert.deepEqual(called, [[1, 2], [3, 4], [5]]);
  assert.deepEqual({ completed: result.completed, succeeded: result.succeeded, skipped: result.skipped, failed: result.failed }, {
    completed: 5, succeeded: 3, skipped: 0, failed: 2
  });
  assert.equal(result.errors?.[0].message.includes('secret'), false);
  assert.equal(finalAdminOperationStatus(result), 'partially_completed');
});

test('successful skipped and failed results aggregate exactly', async () => {
  const result = await executeAdminBatches({
    items: [1, 2, 3],
    batchSize: 3,
    execute: async () => ({ succeeded: 1, skipped: 1, failed: 1 })
  });
  assert.deepEqual({ succeeded: result.succeeded, skipped: result.skipped, failed: result.failed }, { succeeded: 1, skipped: 1, failed: 1 });
});

test('beforeunload warning is active only for active operations', () => {
  const active = operation();
  assert.equal(shouldWarnBeforeAdminUnload([active]), true);
  assert.equal(shouldWarnBeforeAdminUnload([{ ...active, status: 'completed' }]), false);
  assert.equal(shouldWarnBeforeAdminUnload([]), false);
});

test('export process starts indeterminate and receives no invented percentage', () => {
  const exported = createAdminOperation({
    type: 'profile-export-all',
    labelKey: 'admin.operations.type.exportProfiles',
    targetKind: 'global',
    conflictGroup: 'profile-export',
    targetIds: ['scope:all'],
    total: 1957,
    indeterminate: true
  });
  assert.equal(exported.indeterminate, true);
  assert.equal(exported.completed, 0);
});

test('process center renders accessible progress status and a terminal dismiss button', () => {
  const completed = { ...operation(), status: 'completed' as const, completed: 1, succeeded: 1, finishedAt: 200 };
  const renderer = TestRenderer.create(React.createElement(AdminOperationCenter, {
    operations: [completed],
    onDismiss: () => undefined,
    t: (key: string) => key
  }));
  const root = renderer.root;
  assert.equal(root.findAllByProps({ 'aria-live': 'polite' }).length, 1);
  assert.equal(root.findAllByProps({ role: 'progressbar' }).length, 1);
  assert.equal(root.findAllByType('button').some((button) => button.props['aria-label'] === 'admin.operations.dismiss'), true);
  renderer.unmount();
});

test('AdminPage owns the process center and the wildcard route preserves it across admin navigation', async () => {
  const [page, app] = await Promise.all([
    readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/App.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(page, /useAdminOperations\(\)/);
  assert.match(page, /<AdminOperationCenter operations=\{adminOperations\}/);
  assert.match(app, /path="\/admin\/\*" element=\{<AdminPage \/>}/);
});

test('profile photo approval uses an immutable snapshot and confirmed sequential batches of 100', async () => {
  const page = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  const start = page.indexOf('async function confirmBulkProfilePhotoApproval');
  const end = page.indexOf('async function refreshDeletionPinStatus', start);
  const branch = page.slice(start, end);
  assert.match(branch, /resolveProfileOperationSnapshot\('profile-approve-photos'\)/);
  assert.match(branch, /items: snapshot\.ids/);
  assert.match(branch, /batchSize: 100/);
  assert.match(branch, /await api\.approveProfileImagesByProfiles\(token, \[\.\.\.chunk\]\)/);
  assert.match(branch, /onProgress:/);
});

test('active operation controls display a spinner and a real completed total counter', async () => {
  const page = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /function operationButtonContent/);
  assert.match(page, /admin-operation-spinner/);
  assert.match(page, /`\$\{operation\.completed}\/\$\{operation\.total}`/);
  assert.match(page, /disabled=\{!selectedProfileCount \|\| bulkProfilePhotosBusy\}/);
});

test('new process UI strings exist in PL DE and EN', async () => {
  for (const locale of ['pl', 'de', 'en']) {
    const messages = JSON.parse(await readFile(new URL(`../Front/src/locales/${locale}.json`, import.meta.url), 'utf8'));
    for (const key of [
      'admin.operations.centerTitle',
      'admin.operations.status.partially_completed',
      'admin.operations.phase.processing',
      'admin.operations.type.approveProfilePhotos',
      'admin.operations.type.exportProfiles'
    ]) assert.equal(typeof messages[key], 'string', `${locale}: ${key}`);
  }
});
