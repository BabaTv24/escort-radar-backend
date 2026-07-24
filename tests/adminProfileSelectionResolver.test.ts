import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  resolveAdminProfileSelection,
  validateAdminProfileSelection,
  validateAdminProfileSelectionFilters
} from '../Back/src/adminProfileSelection.ts';

function id(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

test('selection resolver supports explicit IDs, removes duplicates and rejects invalid values', async () => {
  const validated = validateAdminProfileSelection({ mode: 'explicit', profile_ids: [id(1), id(1), id(2)] });
  assert.ok(validated.selection);
  const resolved = await resolveAdminProfileSelection(validated.selection!, async () => {
    throw new Error('explicit selection must not page the catalog');
  });
  assert.deepEqual(resolved, [id(1), id(2)]);
  assert.equal(validateAdminProfileSelection({ mode: 'explicit', profile_ids: ['bad'] }).error, 'selection_profile_ids_invalid');
});

test('all_filtered resolves 1369 rows with a stable cursor without a frontend profile download', async () => {
  const rows = Array.from({ length: 1369 }, (_, index) => ({
    id: id(index + 1),
    work_country: index < 1000 ? 'PL' : 'DE',
    work_city: index < 1000 ? 'Warszawa' : 'Berlin'
  }));
  const validated = validateAdminProfileSelection({
    mode: 'all_filtered',
    filters: {},
    excluded_profile_ids: []
  });
  assert.ok(validated.selection && validated.selection.mode === 'all_filtered');
  const cursors: Array<string | null> = [];
  const resolved = await resolveAdminProfileSelection(validated.selection!, async (filters, afterId, pageSize) => {
    cursors.push(afterId);
    assert.equal(filters.type, 'all');
    const start = afterId ? rows.findIndex((row) => row.id === afterId) + 1 : 0;
    return rows.slice(start, start + pageSize);
  }, 500);
  assert.equal(resolved.length, 1369);
  assert.deepEqual(cursors, [null, id(500), id(1000)]);
  assert.equal(new Set(resolved).size, 1369);
});

test('all_filtered respects country and exclusions while passing validated admin filters to the loader', async () => {
  const rows = [
    { id: id(1), work_country: 'PL', work_city: 'Warszawa' },
    { id: id(2), work_country: 'PL', work_city: 'Warszawa' },
    { id: id(3), work_country: 'DE', work_city: 'Berlin' }
  ];
  const validated = validateAdminProfileSelection({
    mode: 'all_filtered',
    filters: { country: 'PL', published: 'yes', q: 'Anna' },
    excluded_profile_ids: [id(2)],
    total_count: 999999
  });
  const resolved = await resolveAdminProfileSelection(validated.selection!, async (filters) => {
    assert.equal(filters.published, 'yes');
    assert.equal(filters.q, 'Anna');
    return rows;
  });
  assert.deepEqual(resolved, [id(1)]);
});

test('selection filters reject unknown names and arbitrary operators', () => {
  assert.equal(validateAdminProfileSelectionFilters({ raw_sql: 'drop table profiles' }).error, 'selection_filter_not_allowed');
  assert.equal(validateAdminProfileSelectionFilters({ published: 'contains' }).error, 'selection_filter_value_invalid');
  assert.equal(validateAdminProfileSelectionFilters({ type: 'ladies);delete' }).error, 'selection_filter_value_invalid');
});
