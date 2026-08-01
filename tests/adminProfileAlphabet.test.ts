import assert from 'node:assert/strict';
import test from 'node:test';
import type { Profile } from '../Front/src/types.ts';
import {
  adminProfileAlphabetCounts,
  adminProfileAlphabetKey,
  adminProfileIdsInCatalogGroups,
  filterAdminProfileCatalogGroups
} from '../Front/src/lib/adminProfileAlphabet.ts';
import { setAdminProfileScopeSelected, emptyAdminProfileSelection } from '../Front/src/lib/adminProfileSelection.ts';
import { defaultAdminProfileFilters, profileMatchesAdminFilters } from '../Front/src/lib/adminProfiles.ts';

const profile = (id: string, displayName: unknown, values: Record<string, unknown> = {}) => ({
  id,
  display_name: displayName,
  category: 'ladies',
  moderation_status: 'approved',
  is_published: true,
  verified: true,
  ...values
}) as Profile;

function catalog(rows: Profile[]) {
  const approved = rows.filter((row) => row.moderation_status === 'approved').length;
  const pending = rows.filter((row) => row.moderation_status === 'pending').length;
  const city = { key: 'berlin', name: 'Berlin', profiles: rows, total: rows.length, approved, pending, approvedCount: approved };
  return [{ key: 'DE', name: 'Germany', profiles: rows, cities: [city], total: rows.length, approved, pending, approvedCount: approved }];
}

test('alphabet key is case-insensitive and folds European diacritics to the base letter', () => {
  for (const value of ['Anna', 'anna', 'Ągata']) assert.equal(adminProfileAlphabetKey(value), 'A');
  assert.deepEqual(['Čapek', 'élodie', 'Łucja', 'Özlem', 'Šara', 'Üma', 'Žana'].map(adminProfileAlphabetKey), ['C', 'E', 'L', 'O', 'S', 'U', 'Z']);
});

test('# contains a digit, special character and missing public name', () => {
  for (const value of ['7even', '!Nova', '', null, undefined]) assert.equal(adminProfileAlphabetKey(value), '#');
});

test('alphabet filter composes after existing filters and removes empty country and city groups', () => {
  const rows = [
    profile('anna', 'Anna', { city: 'berlin', owner_email: 'owner@example.com', premium_tier: 'gold', is_seed_profile: false, is_published: true }),
    profile('amelie-hidden', 'Ämelie', { city: 'berlin', owner_email: 'owner@example.com', premium_tier: 'gold', is_seed_profile: false, is_published: false }),
    profile('beata', 'Beata', { city: 'berlin', owner_email: 'owner@example.com', premium_tier: 'gold', is_seed_profile: false, is_published: true })
  ];
  const existingFilters = {
    ...defaultAdminProfileFilters,
    city: 'berlin', type: 'ladies', published: 'yes', suspended: 'no', seed: 'no', verified: 'yes', premium_tier: 'gold', owner_email: 'OWNER@EXAMPLE.COM'
  };
  const afterExistingFilters = rows.filter((row) => profileMatchesAdminFilters(row, 'ann', existingFilters));
  const visible = filterAdminProfileCatalogGroups(catalog(afterExistingFilters), 'A');
  assert.deepEqual(adminProfileIdsInCatalogGroups(visible), ['anna']);
  assert.equal(visible[0].total, 1);
  assert.equal(filterAdminProfileCatalogGroups(catalog([profile('beata', 'Beata')]), 'A').length, 0);
});

test('availability counts and bulk selection use only the alphabet-filtered IDs', () => {
  const groups = catalog([profile('anna', 'Anna'), profile('adia', 'Ądia'), profile('beata', 'Beata')]);
  const counts = adminProfileAlphabetCounts(groups[0].profiles);
  assert.equal(counts.A, 2);
  assert.equal(counts.B, 1);
  const visibleIds = adminProfileIdsInCatalogGroups(filterAdminProfileCatalogGroups(groups, 'A'));
  const selected = setAdminProfileScopeSelected(emptyAdminProfileSelection, visibleIds, true);
  assert.deepEqual(selected, { mode: 'explicit', profile_ids: ['anna', 'adia'] });
  assert.ok(!selected.profile_ids.includes('beata'));
});
