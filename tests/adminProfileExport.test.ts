import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import express from 'express';
import { buildProfileExport, loadAllProfilesForExport, profileExportFilename } from '../Back/src/adminProfileExport.ts';
import { adminProfileExportDownloadFilename, api, saveDownloadedFile } from '../Front/src/lib/api.ts';

async function listen(app: express.Express) {
  const server = await new Promise<ReturnType<express.Express['listen']>>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function close(server: ReturnType<express.Express['listen']>) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('admin profile export endpoint uses existing admin authorization and returns real HTTP 401/403', async () => {
  const source = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const authSource = await readFile(new URL('../Back/src/middleware/auth.ts', import.meta.url), 'utf8');
  assert.match(source, /adminRouter\.use\(verifyAdminJwt, requireAdmin\)/);
  assert.match(source, /adminRouter\.get\('\/profiles\/export'/);
  assert.ok(source.indexOf('adminRouter.use(verifyAdminJwt, requireAdmin)') < source.indexOf("adminRouter.get('/profiles/export'"));
  assert.match(authSource, /export function requireAdmin[\s\S]*role === 'admin'[\s\S]*if \(!isAdmin\)[\s\S]*status\(403\)[\s\S]*Admin access required/);

  process.env.SUPABASE_URL ||= 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';
  process.env.SUPABASE_ANON_KEY ||= 'test-anon-key';
  process.env.JWT_SECRET ||= 'profile-export-test-secret';
  const [{ adminRouter }, { requireAdmin }] = await Promise.all([
    import('../Back/src/routes/admin.ts'),
    import('../Back/src/middleware/auth.ts')
  ]);

  const protectedApp = express();
  protectedApp.use('/api/admin', adminRouter);
  const protectedServer = await listen(protectedApp);
  try {
    const missingToken = await fetch(`${protectedServer.url}/api/admin/profiles/export`);
    const invalidToken = await fetch(`${protectedServer.url}/api/admin/profiles/export`, { headers: { Authorization: 'Bearer client-token' } });
    assert.equal(missingToken.status, 401);
    assert.equal(invalidToken.status, 401);
  } finally {
    await close(protectedServer.server);
  }

  const forbiddenApp = express();
  forbiddenApp.get('/api/admin/profiles/export', (req, _res, next) => {
    req.user = { id: 'client-1', app_metadata: { role: 'client' } };
    next();
  }, requireAdmin, (_req, res) => res.json({ should_not_be_reached: true }));
  const forbiddenServer = await listen(forbiddenApp);
  try {
    const response = await fetch(`${forbiddenServer.url}/api/admin/profiles/export`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Admin access required' });
  } finally {
    await close(forbiddenServer.server);
  }
});

test('profile export follows every page without a total-record cap', async () => {
  const rows = Array.from({ length: 7 }, (_, index) => ({
    id: String(index + 1).padStart(2, '0'),
    profile_images: [{ storage_path: `profiles/${index + 1}/cover.jpg` }]
  }));
  const cursors: Array<string | null> = [];
  const exported = await loadAllProfilesForExport(async (afterId, pageSize) => {
    cursors.push(afterId);
    const start = afterId ? rows.findIndex((row) => row.id === afterId) + 1 : 0;
    return rows.slice(start, start + pageSize);
  }, 3);
  assert.deepEqual(exported, rows);
  assert.deepEqual(cursors, [null, '03', '06']);
  assert.equal(exported.every((profile) => Array.isArray(profile.profile_images) && profile.profile_images.length === 1), true);

  const source = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  const exportRoute = source.slice(source.indexOf("adminRouter.get('/profiles/export'"), source.indexOf("adminRouter.get('/profiles/visibility-audit'"));
  assert.match(exportRoute, /select\('\*, profile_images\(\*\)'\)/);
  assert.match(exportRoute, /order\('id', \{ ascending: true \}\)/);
  assert.match(exportRoute, /query\.gt\('id', afterId\)/);
});

test('profile export has the required structure, exact count, image references and no secrets', () => {
  const exportedAt = new Date('2026-07-21T09:07:00.000Z');
  const payload = buildProfileExport([
    { id: '1', city: 'Berlin', opening_hours: { mon: ['09:00', '18:00'] }, access_token: 'secret', profile_images: [{ storage_path: 'profiles/1/a.jpg', claimToken: 'secret' }] },
    { id: '2', service_menu: [{ key: 'massage', price: 100 }], metadata: { api_key: 'secret', source: 'hermes' } }
  ], exportedAt);
  assert.equal(payload.format_version, 1);
  assert.equal(payload.exported_at, exportedAt.toISOString());
  assert.equal(payload.profile_count, 2);
  assert.equal(payload.profiles.length, 2);
  assert.equal((payload.profiles[0].profile_images as any[])[0].storage_path, 'profiles/1/a.jpg');
  const json = JSON.stringify(payload);
  assert.doesNotMatch(json, /access_token|claimToken|api_key|secret/);
});

test('frontend downloads the export with the backend filename', async () => {
  const filename = profileExportFilename(new Date('2026-07-21T09:07:00.000Z'));
  const originalFetch = globalThis.fetch;
  let authorization = '';
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get('Authorization') || '';
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` }
    });
  };
  try {
    const file = await api.exportAdminProfiles('admin-token');
    let clicked = false;
    let downloadedAs = '';
    const link = { href: '', download: '', style: {}, click() { clicked = true; downloadedAs = this.download; }, remove() {} };
    const documentRef = { createElement: () => link, body: { appendChild() {} } } as any;
    const urlRef = { createObjectURL: () => 'blob:test', revokeObjectURL() {} };
    saveDownloadedFile(file.blob, file.filename, documentRef, urlRef);
    assert.equal(clicked, true);
    assert.equal(authorization, 'Bearer admin-token');
    assert.equal(downloadedAs, 'escort-radar-profiles-backup-2026-07-21-0907.json');
    assert.equal(adminProfileExportDownloadFilename('attachment; filename="../../unsafe.json"', new Date('2026-07-21T09:07:00.000Z')), filename);
    assert.equal(adminProfileExportDownloadFilename(null, new Date('2026-07-21T09:07:00.000Z')), filename);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('frontend rejects HTML and an unexpected content type instead of downloading it as JSON', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('<html><title>Login</title></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
    await assert.rejects(api.exportAdminProfiles('admin-token'), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Login|Content-Type/);
      return true;
    });

    globalThis.fetch = async () => new Response('gateway failure', {
      status: 502,
      headers: { 'Content-Type': 'text/plain' }
    });
    await assert.rejects(api.exportAdminProfiles('admin-token'), /gateway failure/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
