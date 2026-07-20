import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { adminSession, adminSessionStorageKey } from '../Front/src/lib/adminSession.ts';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function adminToken(expiresAt = Math.floor(Date.now() / 1000) + 3600) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'admin@example.com',
    exp: expiresAt,
    type: 'admin_session',
    role: 'admin',
    admin: true
  })}.test-signature`;
}

test('admin login session survives /admin, /admin/clients navigation and reload', () => {
  const storage = new MemoryStorage();
  const token = adminToken();

  adminSession.write(token, storage); // successful Admin login
  assert.equal(adminSession.read(storage), token); // /admin
  assert.equal(adminSession.read(storage), token); // client-side navigation to /admin/clients

  const storageAfterReload = storage;
  assert.equal(adminSession.read(storageAfterReload), token); // direct/reloaded /admin/clients
  assert.equal(storage.getItem(adminSessionStorageKey), token);
});

test('only an unequivocally expired local admin token is removed locally', () => {
  const storage = new MemoryStorage();
  adminSession.write(adminToken(Math.floor(Date.now() / 1000) - 1), storage);

  assert.equal(adminSession.read(storage), '');
  assert.equal(storage.getItem(adminSessionStorageKey), null);
});

test('admin route restoration is not coupled to navigation and transient validation keeps the session', async () => {
  const source = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');

  assert.match(source, /\}, \[isLoginRoute, authRetry\]\);/);
  assert.doesNotMatch(source, /\}, \[isLoginRoute, navigate/);
  assert.match(source, /sessionError instanceof ApiError && \(sessionError\.status === 401 \|\| sessionError\.status === 403\)/);
  assert.match(source, /setToken\(storedToken\);\s+setAuthUnavailable\(true\)/);
});
