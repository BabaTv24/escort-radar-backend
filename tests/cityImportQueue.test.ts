import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, api } from '../Front/src/lib/api.ts';
import { isDuplicateSourceUrlApiError, runCityImportQueue } from '../Front/src/lib/cityImportQueue.ts';

const noWait = async () => undefined;

test('city import queue processes items sequentially and never overlaps requests', async () => {
  let active = 0;
  let maxActive = 0;
  const order: string[] = [];
  const snapshots: string[][] = [];
  const result = await runCityImportQueue({
    urls: ['one', 'two', 'three'],
    shouldStop: () => false,
    wait: noWait,
    onChange: (items) => snapshots.push(items.map((item) => item.status)),
    importItem: async (url) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(url);
      await Promise.resolve();
      active -= 1;
      return { status: 'imported', profileId: url };
    }
  });
  assert.equal(maxActive, 1);
  assert.deepEqual(order, ['one', 'two', 'three']);
  assert.deepEqual(result.map((item) => item.status), ['imported', 'imported', 'imported']);
  assert.ok(snapshots.some((statuses) => statuses.includes('importing')));
});

test('failed city item does not stop the next item and duplicates are reported separately', async () => {
  const calls: string[] = [];
  const result = await runCityImportQueue({
    urls: ['failed', 'duplicate', 'ok'],
    shouldStop: () => false,
    wait: noWait,
    onChange: () => undefined,
    importItem: async (url) => {
      calls.push(url);
      if (url === 'failed') throw new Error('preview_failed');
      if (url === 'duplicate') return { status: 'skipped_duplicate' };
      return { status: 'imported', profileId: 'profile-ok' };
    }
  });
  assert.deepEqual(calls, ['failed', 'duplicate', 'ok']);
  assert.deepEqual(result.map((item) => item.status), ['failed', 'skipped_duplicate', 'imported']);
  assert.equal(result[0].error, 'preview_failed');
});

test('thrown duplicate API conflict is skipped, counted separately, not retried, and queue continues', async () => {
  const calls = new Map<string, number>();
  const result = await runCityImportQueue({
    urls: ['duplicate', 'ok', 'not-found', 'server-error'],
    shouldStop: () => false,
    wait: noWait,
    onChange: () => undefined,
    importItem: async (url) => {
      calls.set(url, (calls.get(url) || 0) + 1);
      if (url === 'duplicate') throw new ApiError('duplicate_source_url', 409, { error: 'duplicate_source_url', status: 'skipped_duplicate' });
      if (url === 'not-found') throw new ApiError('Not found', 404, { error: 'not_found' });
      if (url === 'server-error') throw new ApiError('Server error', 500, { error: 'server_error' });
      return { status: 'imported', profileId: 'profile-ok' };
    }
  });

  assert.deepEqual(result.map((item) => item.status), ['skipped_duplicate', 'imported', 'failed', 'failed']);
  assert.equal(result.filter((item) => item.status === 'skipped_duplicate').length, 1);
  assert.equal(result.filter((item) => item.status === 'failed').length, 2);
  assert.equal(result.filter((item) => ['imported', 'skipped_duplicate', 'failed'].includes(item.status)).length, 4);
  assert.deepEqual(Object.fromEntries(calls), { duplicate: 1, ok: 1, 'not-found': 1, 'server-error': 1 });
  assert.equal(result[0].error, undefined);
});

test('duplicate classification requires the complete expected 409 response contract', () => {
  assert.equal(isDuplicateSourceUrlApiError(new ApiError('duplicate_source_url', 409, { error: 'duplicate_source_url', status: 'skipped_duplicate' })), true);
  assert.equal(isDuplicateSourceUrlApiError(new ApiError('duplicate_source_url', 400, { error: 'duplicate_source_url', status: 'skipped_duplicate' })), false);
  assert.equal(isDuplicateSourceUrlApiError(new ApiError('duplicate_source_url', 409, { error: 'duplicate_source_url' })), false);
  assert.equal(isDuplicateSourceUrlApiError(new ApiError('Conflict', 409, { error: 'other', status: 'skipped_duplicate' })), false);
});

test('API client preserves duplicate response body for queue classification', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: 'duplicate_source_url', status: 'skipped_duplicate' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    const result = await runCityImportQueue({
      urls: ['https://pl.escort.club/anons/247251.html'],
      shouldStop: () => false,
      wait: noWait,
      onChange: () => undefined,
      importItem: async (sourceUrl) => {
        await api.importProfileCreate('token', { source_url: sourceUrl, profile: {} as never, create_as_draft: true });
        return { status: 'imported' };
      }
    });
    assert.equal(calls, 1);
    assert.equal(result[0].status, 'skipped_duplicate');
    assert.equal(result[0].error, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('stop request leaves unprocessed city items queued', async () => {
  let stop = false;
  const result = await runCityImportQueue({
    urls: ['one', 'two', 'three'],
    shouldStop: () => stop,
    wait: noWait,
    onChange: () => undefined,
    importItem: async (url) => {
      stop = true;
      return { status: 'imported', profileId: url };
    }
  });
  assert.deepEqual(result.map((item) => item.status), ['imported', 'queued', 'queued']);
});

test('city import queue deduplicates input and enforces the hard limit of 30', async () => {
  const calls: string[] = [];
  const urls = [...Array.from({ length: 35 }, (_, index) => `profile-${index}`), 'profile-0'];
  const result = await runCityImportQueue({
    urls,
    shouldStop: () => false,
    wait: noWait,
    onChange: () => undefined,
    importItem: async (url) => {
      calls.push(url);
      return { status: 'imported' };
    }
  });
  assert.equal(result.length, 30);
  assert.equal(calls.length, 30);
  assert.equal(new Set(calls).size, 30);
});
