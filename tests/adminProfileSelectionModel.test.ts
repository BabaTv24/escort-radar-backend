import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adminProfileSelectionCount,
  adminProfileSelectionRequest,
  isAdminProfileSelected,
  resetAllFilteredSelectionForFilters,
  selectAllFilteredProfiles,
  setAdminProfileScopeSelected,
  toggleAdminProfileInSelection
} from '../Front/src/lib/adminProfileSelection.ts';
import type { AdminProfileSelectionFilters } from '../Front/src/lib/adminProfileSelection.ts';

const filters: AdminProfileSelectionFilters = {
  q: '', type: 'all', published: 'all', suspended: 'all', seed: 'all',
  verified: 'all', premium_tier: 'all', owner_email: '', city_query: '', country: '', city: ''
};

test('main selection represents all 1369 results without loading profile records', () => {
  const selection = selectAllFilteredProfiles(filters, 1369);
  assert.equal(selection.mode, 'all_filtered');
  assert.equal(adminProfileSelectionCount(selection), 1369);
  assert.deepEqual(adminProfileSelectionRequest(selection), {
    mode: 'all_filtered', filters, excluded_profile_ids: [], total_count: 1369
  });
  assert.equal('profiles' in selection, false);
});

test('toggling one profile in all_filtered adds and removes an exclusion with an exact count', () => {
  const all = selectAllFilteredProfiles(filters, 1369);
  const excluded = toggleAdminProfileInSelection(all, 'profile-1');
  assert.equal(isAdminProfileSelected(excluded, 'profile-1'), false);
  assert.equal(adminProfileSelectionCount(excluded), 1368);
  const restored = toggleAdminProfileInSelection(excluded, 'profile-1');
  assert.equal(isAdminProfileSelected(restored, 'profile-1'), true);
  assert.equal(adminProfileSelectionCount(restored), 1369);
});

test('changing filters deterministically resets all_filtered selection', () => {
  const selected = selectAllFilteredProfiles(filters, 1369);
  const same = resetAllFilteredSelectionForFilters(selected, { ...filters });
  assert.equal(same.reset, false);
  const changed = resetAllFilteredSelectionForFilters(selected, { ...filters, published: 'yes' });
  assert.equal(changed.reset, true);
  assert.deepEqual(changed.selection, { mode: 'explicit', profile_ids: [] });
});

test('country scope selects all backend-resolved IDs without expanded city records', () => {
  const countryIds = ['pl-1', 'pl-2', 'pl-3'];
  const selected = setAdminProfileScopeSelected({ mode: 'explicit', profile_ids: ['de-1'] }, countryIds, true);
  assert.deepEqual(selected, { mode: 'explicit', profile_ids: ['de-1', ...countryIds] });
  const unselected = setAdminProfileScopeSelected(selected, countryIds, false);
  assert.deepEqual(unselected, { mode: 'explicit', profile_ids: ['de-1'] });
});
