import assert from 'node:assert/strict';
import test from 'node:test';
import { runCityImportQueue } from '../Front/src/lib/cityImportQueue.ts';

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
