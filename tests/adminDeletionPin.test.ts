import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  compareDeletionPin,
  hashDeletionPin,
  type AdminDeletionPinRecord,
  type AdminDeletionPinStore,
  validateDeletionPin,
  verifyAdminDeletionPin
} from '../Back/src/adminDeletionPin.ts';

class MemoryPinStore implements AdminDeletionPinStore {
  record: AdminDeletionPinRecord | null = null;

  async get() {
    return this.record ? { ...this.record } : null;
  }

  async save(adminId: string, hash: string) {
    this.record = {
      admin_id: adminId,
      deletion_pin_hash: hash,
      deletion_pin_updated_at: new Date().toISOString(),
      failed_attempts: 0,
      attempt_window_started_at: null,
      locked_until: null
    };
    return { ...this.record };
  }

  async recordFailure() {
    if (!this.record) throw new Error('not configured');
    this.record.failed_attempts += 1;
    this.record.attempt_window_started_at ||= new Date().toISOString();
    if (this.record.failed_attempts >= 5) this.record.locked_until = new Date(Date.now() + 15 * 60_000).toISOString();
    return { failed_attempts: this.record.failed_attempts, locked_until: this.record.locked_until };
  }

  async resetFailures() {
    if (!this.record) return;
    this.record.failed_attempts = 0;
    this.record.attempt_window_started_at = null;
    this.record.locked_until = null;
  }
}

test('deletion PIN accepts exactly six digits and preserves a leading zero', async () => {
  assert.equal(validateDeletionPin('012345'), true);
  assert.equal(validateDeletionPin('12345'), false);
  assert.equal(validateDeletionPin('1234567'), false);
  assert.equal(validateDeletionPin(123456), false);
  const hash = await hashDeletionPin('012345');
  assert.equal(await compareDeletionPin('012345', hash), true);
  assert.equal(await compareDeletionPin('12345', hash), false);
});

test('deletion PIN is salted and never stored as plaintext', async () => {
  const first = await hashDeletionPin('123456');
  const second = await hashDeletionPin('123456');
  assert.notEqual(first, second);
  assert.equal(first.includes('123456'), false);
  assert.match(first, /^scrypt\$v1\$/);
  assert.equal(await compareDeletionPin('123456', first), true);
  assert.equal(await compareDeletionPin('654321', first), false);
});

test('unconfigured, invalid and correct deletion PIN verification have separate outcomes', async () => {
  const store = new MemoryPinStore();
  assert.deepEqual(await verifyAdminDeletionPin(store, 'admin@example.test', '123456'), { ok: false, status: 403, error: 'deletion_pin_not_configured' });
  await store.save('admin@example.test', await hashDeletionPin('012345'), false);
  assert.deepEqual(await verifyAdminDeletionPin(store, 'admin@example.test', '12345'), { ok: false, status: 400, error: 'invalid_pin_format' });
  assert.deepEqual(await verifyAdminDeletionPin(store, 'admin@example.test', '999999'), { ok: false, status: 403, error: 'invalid_deletion_pin' });
  assert.deepEqual(await verifyAdminDeletionPin(store, 'admin@example.test', '012345'), { ok: true });
});

test('five wrong PIN attempts create a persistent lock and a correct PIN resets failures', async () => {
  const store = new MemoryPinStore();
  await store.save('admin@example.test', await hashDeletionPin('012345'), false);
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    assert.deepEqual(await verifyAdminDeletionPin(store, 'admin@example.test', '999999'), { ok: false, status: 403, error: 'invalid_deletion_pin' });
  }
  const fifth = await verifyAdminDeletionPin(store, 'admin@example.test', '999999');
  assert.equal(fifth.ok, false);
  assert.equal(fifth.ok ? 0 : fifth.status, 429);
  assert.equal(store.record?.failed_attempts, 5);
  const locked = await verifyAdminDeletionPin(store, 'admin@example.test', '012345');
  assert.equal(locked.ok, false);
  assert.equal(locked.ok ? 0 : locked.status, 423);

  store.record!.locked_until = new Date(Date.now() - 1000).toISOString();
  assert.deepEqual(await verifyAdminDeletionPin(store, 'admin@example.test', '012345'), { ok: true });
  assert.equal(store.record?.failed_attempts, 0);
  assert.equal(store.record?.locked_until, null);
});

test('PIN endpoints are admin-authenticated, status omits hash, and changing PIN verifies the current PIN', async () => {
  const source = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const guard = source.indexOf('adminRouter.use(verifyAdminJwt, requireAdmin)');
  const statusRoute = source.indexOf("adminRouter.get('/security/pin-status'");
  const changeRoute = source.indexOf("adminRouter.put('/security/deletion-pin'");
  assert.ok(guard >= 0 && statusRoute > guard && changeRoute > guard);
  const statusSource = source.slice(statusRoute, changeRoute);
  assert.match(statusSource, /configured/);
  assert.match(statusSource, /updated_at/);
  assert.doesNotMatch(statusSource, /deletion_pin_hash/);
  const changeSource = source.slice(changeRoute, source.indexOf("adminRouter.get('/location-catalog'"));
  assert.match(changeSource, /if \(existing\)[\s\S]*verifyAdminDeletionPin/);
  assert.match(changeSource, /hashDeletionPin\(newPin\)/);
  assert.doesNotMatch(changeSource, /console\.|req\.body\s*[,)]/);
});

test('bulk and single admin profile deletion authorize PIN before reading or deleting profiles', async () => {
  const source = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const bulk = source.slice(source.indexOf("adminRouter.post('/profiles/bulk'"), source.indexOf("adminRouter.patch('/profiles/:profileId/images/reorder'"));
  const deleteBranch = bulk.slice(bulk.indexOf("operation === 'delete'"));
  assert.ok(deleteBranch.indexOf('authorizeAdminDeletion') < deleteBranch.indexOf("from('profile_images')"));
  assert.ok(deleteBranch.indexOf('authorizeAdminDeletion') < deleteBranch.indexOf("from('profiles').delete()"));
  assert.match(deleteBranch, /bulk_profile_delete_success/);

  const single = source.slice(source.indexOf("adminRouter.delete('/profiles/:id'"), source.indexOf("adminRouter.patch('/profiles/:id/test-account'"));
  assert.ok(single.indexOf('authorizeAdminDeletion') < single.indexOf("from('profile_images')"));
  assert.ok(single.indexOf('authorizeAdminDeletion') < single.indexOf("from('profiles').delete()"));
  assert.match(single, /profile_delete_success/);
});

test('delete denial auditing contains no PIN, hash, or request body', async () => {
  const source = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const helper = source.slice(source.indexOf('async function authorizeAdminDeletion'), source.indexOf('function isUuid'));
  assert.match(helper, /bulk_profile_delete_denied|deniedAction/);
  assert.doesNotMatch(helper, /deletion_pin_hash|req\.body(?!\.deletion_pin)/);
  assert.doesNotMatch(helper, /console\.(?:log|info|warn|error)/);
});

test('frontend blocks short PIN submission and clears modal PIN after error and success', async () => {
  const [page, apiSource] = await Promise.all([
    readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/lib/api.ts', import.meta.url), 'utf8')
  ]);
  const confirmDelete = page.slice(page.indexOf('async function confirmBulkProfileDelete'), page.indexOf('function deletionPinErrorMessage'));
  assert.match(confirmDelete, /!\/\^\\d\{6\}\$\/\.test\(bulkDeletePin\)[\s\S]*return/);
  assert.match(confirmDelete, /deletion_pin: bulkDeletePin/);
  assert.ok((confirmDelete.match(/setBulkDeletePin\(''\)/g) || []).length >= 2);
  assert.match(page, /disabled=\{bulkDeleteBusy \|\| !deletionPinStatus\?\.configured \|\| !\/\^\\d\{6\}\$\/\.test\(bulkDeletePin\)\}/);
  assert.match(apiSource, /deleteAdminProfile:[\s\S]*deletion_pin: deletionPin/);
});

test('migration keeps PIN settings private and persists atomic lock attempts', async () => {
  const migration = await readFile(new URL('../supabase/migrations/051_admin_deletion_pin.sql', import.meta.url), 'utf8');
  assert.match(migration, /^begin;/);
  assert.match(migration, /commit;\s*$/);
  assert.match(migration, /admin_id text primary key/);
  assert.match(migration, /deletion_pin_hash text not null/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all privileges on table public\.admin_security_settings from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select, insert, update on table public\.admin_security_settings to service_role/);
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog\s/);
  assert.match(migration, /failed_attempts \+ 1/);
  assert.match(migration, />= 5 then now\(\) \+ interval '15 minutes'/);
  assert.match(migration, /grant execute[\s\S]*service_role/);
  assert.match(migration, /revoke all on function public\.record_admin_deletion_pin_failure\(text\) from public, anon, authenticated, service_role/);
});
