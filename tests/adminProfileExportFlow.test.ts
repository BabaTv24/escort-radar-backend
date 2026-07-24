import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { AdminProfileExportReady } from '../Front/src/components/AdminProfileExportReady.tsx';
import {
  adminProfileExportFiltersActive,
  adminProfileExportOptions,
  adminProfileSelectionMatchesFilters,
  isAdminProfileExportPickerAbort,
  releaseAdminProfileExportObjectUrl,
  replaceAdminProfileExportObjectUrl,
  savePreparedAdminProfileExportAs
} from '../Front/src/lib/adminProfileExportFlow.ts';
import type { AdminProfileSelectionFilters } from '../Front/src/lib/adminProfileSelection.ts';

const noFilters: AdminProfileSelectionFilters = {
  q: '',
  type: 'all',
  published: 'all',
  suspended: 'all',
  seed: 'all',
  verified: 'all',
  premium_tier: 'all',
  owner_email: '',
  city_query: '',
  country: '',
  city: ''
};

const labels = {
  ready: 'Plik jest gotowy',
  profileCount: 'Liczba profili',
  filename: 'Nazwa',
  fileSize: 'Rozmiar',
  download: 'Pobierz plik',
  saveAs: 'Zapisz jako…',
  close: 'Zamknij'
};

test('all selected without filters produces only the all-profiles export option', () => {
  assert.deepEqual(adminProfileExportOptions({
    selectedCount: 1369,
    filteredCount: 1369,
    totalCount: 1369,
    filtersActive: false,
    selectionMatchesFilters: true
  }), [{ scope: 'all', count: 1369 }]);
});

test('manual selection produces selected and all-profiles options', () => {
  assert.deepEqual(adminProfileExportOptions({
    selectedCount: 20,
    filteredCount: 1369,
    totalCount: 1369,
    filtersActive: false,
    selectionMatchesFilters: false
  }), [
    { scope: 'selected', count: 20 },
    { scope: 'all', count: 1369 }
  ]);
});

test('a limiting filter produces filtered and all-profiles options', () => {
  assert.equal(adminProfileExportFiltersActive({ ...noFilters, country: 'PL' }), true);
  assert.deepEqual(adminProfileExportOptions({
    selectedCount: 0,
    filteredCount: 1134,
    totalCount: 1369,
    filtersActive: true,
    selectionMatchesFilters: false
  }), [
    { scope: 'filtered', count: 1134 },
    { scope: 'all', count: 1369 }
  ]);
});

test('identical selected and filtered ranges are not duplicated', () => {
  const filters = { ...noFilters, country: 'PL' };
  const selection = { mode: 'all_filtered' as const, filters, excluded_profile_ids: [], total_count: 1134 };
  assert.equal(adminProfileSelectionMatchesFilters(selection, filters), true);
  assert.deepEqual(adminProfileExportOptions({
    selectedCount: 1134,
    filteredCount: 1134,
    totalCount: 1369,
    filtersActive: true,
    selectionMatchesFilters: true
  }), [
    { scope: 'filtered', count: 1134 },
    { scope: 'all', count: 1369 }
  ]);
});

test('new prepared Blob creates an object URL and only replaces a previous URL', () => {
  const revoked: string[] = [];
  const created: Blob[] = [];
  const urlApi = {
    createObjectURL(blob: Blob) {
      created.push(blob);
      return `blob:${created.length}`;
    },
    revokeObjectURL(url: string) {
      revoked.push(url);
    }
  };
  const firstBlob = new Blob(['one']);
  const firstUrl = replaceAdminProfileExportObjectUrl(firstBlob, null, urlApi);
  assert.equal(firstUrl, 'blob:1');
  assert.deepEqual(revoked, []);

  const secondUrl = replaceAdminProfileExportObjectUrl(new Blob(['two']), firstUrl, urlApi);
  assert.equal(secondUrl, 'blob:2');
  assert.deepEqual(revoked, ['blob:1']);
});

test('ready export renders a real download anchor without automatic download or early revoke', () => {
  let downloads = 0;
  let saves = 0;
  let closes = 0;
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(AdminProfileExportReady, {
      file: {
        blob: new Blob(['{"profile_count":2}'], { type: 'application/json' }),
        objectUrl: 'blob:prepared-export',
        filename: 'escort-radar-profiles-selected.json',
        profileCount: 2
      },
      canSaveAs: true,
      labels,
      statusMessage: '',
      onDownload: () => { downloads += 1; },
      onSaveAs: () => { saves += 1; },
      onClose: () => { closes += 1; }
    }));
  });
  assert.equal(downloads, 0);
  assert.equal(saves, 0);
  assert.equal(closes, 0);
  const anchor = renderer!.root.findByType('a');
  assert.equal(anchor.props.href, 'blob:prepared-export');
  assert.equal(anchor.props.download, 'escort-radar-profiles-selected.json');
  assert.equal(anchor.children.join(''), 'Pobierz plik');
  act(() => anchor.props.onClick());
  assert.equal(downloads, 1);
});

test('ready export hides Save As when the picker is unavailable', () => {
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(AdminProfileExportReady, {
      file: { blob: new Blob(['{}']), objectUrl: 'blob:fallback', filename: 'fallback.json', profileCount: 0 },
      canSaveAs: false,
      labels,
      statusMessage: '',
      onDownload() {},
      onSaveAs() {},
      onClose() {}
    }));
  });
  assert.equal(renderer!.root.findAllByType('a').length, 1);
  assert.equal(renderer!.root.findAllByType('button').some((button) => button.children.join('') === labels.saveAs), false);
});

test('prepared object URL is released explicitly on close or unmount', () => {
  const revoked: string[] = [];
  releaseAdminProfileExportObjectUrl('blob:prepared', { revokeObjectURL: (url) => revoked.push(url) });
  releaseAdminProfileExportObjectUrl(null, { revokeObjectURL: (url) => revoked.push(url) });
  assert.deepEqual(revoked, ['blob:prepared']);
});

test('Save As calls the picker synchronously before its promise resolves and writes the ready Blob', async () => {
  const blob = new Blob(['{"ok":true}'], { type: 'application/json' });
  let pickerCalled = false;
  let resolveHandle!: (handle: any) => void;
  let written: Blob | null = null;
  const pickerPromise = new Promise<any>((resolve) => { resolveHandle = resolve; });
  const saving = savePreparedAdminProfileExportAs(blob, 'ready.json', (options) => {
    pickerCalled = true;
    assert.equal(options.suggestedName, 'ready.json');
    return pickerPromise;
  });
  assert.equal(pickerCalled, true);
  resolveHandle({
    async createWritable() {
      return {
        async write(value: Blob) { written = value; },
        async close() {}
      };
    }
  });
  await saving;
  assert.equal(written, blob);
});

test('Save As cancellation is recognized as a silent picker abort', async () => {
  const error = new DOMException('cancelled', 'AbortError');
  await assert.rejects(savePreparedAdminProfileExportAs(new Blob(['{}']), 'ready.json', () => Promise.reject(error)), error);
  assert.equal(isAdminProfileExportPickerAbort(error), true);
  assert.equal(isAdminProfileExportPickerAbort(new Error('write failed')), false);
});

test('AdminPage keeps preparation and API errors in the modal with retry', async () => {
  const source = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /setProfileExportBusy\(true\)[\s\S]*await api\.exportAdmin/);
  assert.match(source, /profileExportError[\s\S]*exportPrepareFailed[\s\S]*admin\.buttons\.retry/);
  assert.match(source, /onBlobReady:[\s\S]*replaceAdminProfileExportObjectUrl\(blob/);
  assert.doesNotMatch(source, /await saveAdminProfileExport/);
  assert.match(source, /useEffect\(\(\) => \(\) => \{[\s\S]*releaseAdminProfileExportObjectUrl/);
});
