import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  ADMIN_PROFILE_EXPORT_TIMEOUT_MS,
  AdminProfileExportError,
  api,
  requestAdminProfileExport
} from '../Front/src/lib/api.ts';

function exportResponse(blob: Blob, headers: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="escort-radar-profiles-backup-2026-07-24-1000.json"',
      'X-Profile-Count': '1369',
      ...headers
    }),
    blob: async () => blob,
    json: async () => ({ profiles: [] })
  } as Response;
}

test('profile export has a dedicated 120 second timeout that stays active through response.blob', async () => {
  let timeoutDelay = 0;
  let timerCleared = false;
  let objectUrlCreatedWhileTimerActive = false;
  let resolveBlob!: (blob: Blob) => void;
  const body = new Promise<Blob>((resolve) => { resolveBlob = resolve; });
  const runtime = {
    fetch: async () => ({
      ...exportResponse(new Blob(['unused'])),
      blob: () => body
    } as Response),
    setTimeout: ((_callback: () => void, delay: number) => {
      timeoutDelay = delay;
      return 41;
    }) as any,
    clearTimeout: ((id: number) => {
      assert.equal(id, 41);
      timerCleared = true;
    }) as any
  };

  const pending = requestAdminProfileExport('/api/admin/profiles/export', {}, 'backup', {
    onBlobReady: () => {
      objectUrlCreatedWhileTimerActive = !timerCleared;
    }
  }, runtime);
  await Promise.resolve();
  assert.equal(ADMIN_PROFILE_EXPORT_TIMEOUT_MS, 120_000);
  assert.equal(timeoutDelay, 120_000);
  assert.equal(timerCleared, false);

  resolveBlob(new Blob(['{"profiles":[]}'], { type: 'application/json' }));
  const file = await pending;
  assert.equal(file.blob.size > 0, true);
  assert.equal(objectUrlCreatedWhileTimerActive, true);
  assert.equal(timerCleared, true);
});

test('a simulated nine-second response is not aborted by an eight-second timer', async () => {
  const scheduled: Array<{ callback: () => void; delay: number }> = [];
  let aborted = false;
  const runtime = {
    fetch: async (_url: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', () => { aborted = true; });
      return exportResponse(new Blob(['{"ok":true}']));
    },
    setTimeout: ((callback: () => void, delay: number) => {
      scheduled.push({ callback, delay });
      return scheduled.length;
    }) as any,
    clearTimeout: (() => undefined) as any
  };
  const file = await requestAdminProfileExport('/api/admin/profiles/export', {}, 'backup', {}, runtime);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 120_000);
  assert.equal(scheduled.some((timer) => timer.delay <= 9_000), false);
  assert.equal(aborted, false);
  assert.equal(file.blob.size > 0, true);
});

test('timeout and caller cancellation have distinct export errors', async () => {
  let timeoutCallback!: () => void;
  const waitingFetch = (_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });
  const runtime = {
    fetch: waitingFetch as typeof fetch,
    setTimeout: ((callback: () => void) => {
      timeoutCallback = callback;
      return 1;
    }) as any,
    clearTimeout: (() => undefined) as any
  };

  const timedOut = requestAdminProfileExport('/api/admin/profiles/export', {}, 'backup', {}, runtime);
  timeoutCallback();
  await assert.rejects(timedOut, (error: unknown) => {
    assert.ok(error instanceof AdminProfileExportError);
    assert.equal(error.code, 'timeout');
    return true;
  });

  const caller = new AbortController();
  const cancelled = requestAdminProfileExport('/api/admin/profiles/export', {}, 'backup', { signal: caller.signal }, runtime);
  caller.abort();
  await assert.rejects(cancelled, (error: unknown) => {
    assert.ok(error instanceof AdminProfileExportError);
    assert.equal(error.code, 'cancelled');
    return true;
  });
});

test('network failure and empty Blob have distinct export errors', async () => {
  const noTimer = {
    setTimeout: (() => 1) as any,
    clearTimeout: (() => undefined) as any
  };
  await assert.rejects(requestAdminProfileExport('/api/admin/profiles/export', {}, 'backup', {}, {
    ...noTimer,
    fetch: async () => { throw new TypeError('Failed to fetch'); }
  }), (error: unknown) => {
    assert.ok(error instanceof AdminProfileExportError);
    assert.equal(error.code, 'network');
    assert.equal(error.stage, 'fetch');
    return true;
  });
  await assert.rejects(requestAdminProfileExport('/api/admin/profiles/export', {}, 'backup', {}, {
    ...noTimer,
    fetch: async () => ({
      ...exportResponse(new Blob(['unused'])),
      blob: async () => { throw new TypeError('terminated'); }
    } as Response)
  }), (error: unknown) => {
    assert.ok(error instanceof AdminProfileExportError);
    assert.equal(error.code, 'network');
    assert.equal(error.stage, 'body');
    return true;
  });
  await assert.rejects(requestAdminProfileExport('/api/admin/profiles/export', {}, 'backup', {}, {
    ...noTimer,
    fetch: async () => exportResponse(new Blob([]))
  }), (error: unknown) => {
    assert.ok(error instanceof AdminProfileExportError);
    assert.equal(error.code, 'empty_blob');
    return true;
  });
});

test('a 1.89 MB JSON Blob is accepted completely', async () => {
  const blob = new Blob(['x'.repeat(1_890 * 1024)], { type: 'application/json' });
  const file = await requestAdminProfileExport('/api/admin/profiles/export', {}, 'backup', {}, {
    fetch: async () => exportResponse(blob),
    setTimeout: (() => 1) as any,
    clearTimeout: (() => undefined) as any
  });
  assert.equal(file.blob.size, 1_890 * 1024);
  assert.equal(file.profileCount, 1369);
});

test('both full and selected exports use the dedicated request with an AbortSignal', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  const signals: Array<AbortSignal | null | undefined> = [];
  globalThis.fetch = async (input, init) => {
    urls.push(String(input));
    signals.push(init?.signal);
    return exportResponse(new Blob(['{}']));
  };
  try {
    await api.exportAdminProfiles('token');
    await api.exportAdminProfileSelection('token', { mode: 'explicit', profile_ids: ['one'] });
    await api.profiles();
    assert.match(urls[0], /\/api\/admin\/profiles\/export$/);
    assert.match(urls[1], /\/api\/admin\/profiles\/export-selection$/);
    assert.equal(signals[0] instanceof AbortSignal, true);
    assert.equal(signals[1] instanceof AbortSignal, true);
    assert.equal(signals[2], undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retry and close enforce one active export request in AdminPage', async () => {
  const source = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /async function prepareProfileExport[\s\S]*profileExportAbortRef\.current\?\.abort\(\)[\s\S]*new AbortController/);
  assert.match(source, /requestId !== profileExportRequestIdRef\.current/);
  assert.match(source, /function closeProfileExport[\s\S]*profileExportAbortRef\.current\?\.abort\(\)/);
  assert.match(source, /onBlobReady:[\s\S]*replaceAdminProfileExportObjectUrl\(blob/);
  assert.match(source, /<AdminProfileExportReady/);
});

test('production service worker does not proxy cross-origin export bodies', async () => {
  const source = await readFile(new URL('../Front/public/sw.js', import.meta.url), 'utf8');
  assert.match(source, /if \(url\.origin !== self\.location\.origin\) return;/);
});

test('backend relies on byte-safe Express send and exposes all export headers', async () => {
  const [routes, server] = await Promise.all([
    readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8'),
    readFile(new URL('../Back/src/server.ts', import.meta.url), 'utf8')
  ]);
  const exportRoutes = routes.slice(routes.indexOf("adminRouter.get('/profiles/export'"), routes.indexOf("adminRouter.get('/profiles/visibility-audit'"));
  assert.doesNotMatch(exportRoutes, /setHeader\(['"]Content-Length/);
  assert.match(exportRoutes, /res\.send\(JSON\.stringify\(payload\)\)/);
  assert.match(server, /'Content-Disposition', 'X-Profile-Count', 'Content-Length'/);
  const localized = JSON.stringify({ message: 'Zażółć gęślą jaźń — Größe' });
  assert.ok(Buffer.byteLength(localized, 'utf8') > localized.length);
});
