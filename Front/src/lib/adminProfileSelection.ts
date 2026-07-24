export type AdminProfileSelectionFilters = {
  q: string;
  type: string;
  published: 'all' | 'yes' | 'no';
  suspended: 'all' | 'yes' | 'no';
  seed: 'all' | 'yes' | 'no';
  verified: 'all' | 'yes' | 'no';
  premium_tier: string;
  owner_email: string;
  city_query: string;
  country: string;
  city: string;
};

export type AdminProfileSelection =
  | { mode: 'explicit'; profile_ids: string[] }
  | {
      mode: 'all_filtered';
      filters: AdminProfileSelectionFilters;
      excluded_profile_ids: string[];
      total_count: number;
    };

export const emptyAdminProfileSelection: AdminProfileSelection = { mode: 'explicit', profile_ids: [] };

export function uniqueProfileSelectionIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

export function adminProfileSelectionFilterKey(filters: AdminProfileSelectionFilters) {
  return JSON.stringify(filters);
}

export function adminProfileSelectionCount(selection: AdminProfileSelection) {
  return selection.mode === 'explicit'
    ? uniqueProfileSelectionIds(selection.profile_ids).length
    : Math.max(0, selection.total_count - uniqueProfileSelectionIds(selection.excluded_profile_ids).length);
}

export function isAdminProfileSelected(selection: AdminProfileSelection, profileId: string) {
  return selection.mode === 'explicit'
    ? selection.profile_ids.includes(profileId)
    : !selection.excluded_profile_ids.includes(profileId);
}

export function toggleAdminProfileInSelection(selection: AdminProfileSelection, profileId: string) {
  if (selection.mode === 'explicit') {
    const ids = uniqueProfileSelectionIds(selection.profile_ids);
    return {
      mode: 'explicit' as const,
      profile_ids: ids.includes(profileId) ? ids.filter((id) => id !== profileId) : [...ids, profileId]
    };
  }
  const excluded = uniqueProfileSelectionIds(selection.excluded_profile_ids);
  return {
    ...selection,
    excluded_profile_ids: excluded.includes(profileId)
      ? excluded.filter((id) => id !== profileId)
      : [...excluded, profileId]
  };
}

export function selectAllFilteredProfiles(filters: AdminProfileSelectionFilters, totalCount: number): AdminProfileSelection {
  return { mode: 'all_filtered', filters: { ...filters }, excluded_profile_ids: [], total_count: Math.max(0, totalCount) };
}

export function setAdminProfileScopeSelected(selection: AdminProfileSelection, scopeIds: string[], selected: boolean): AdminProfileSelection {
  const scope = uniqueProfileSelectionIds(scopeIds);
  if (selection.mode === 'explicit') {
    const current = uniqueProfileSelectionIds(selection.profile_ids);
    const scopeSet = new Set(scope);
    return {
      mode: 'explicit',
      profile_ids: selected ? uniqueProfileSelectionIds([...current, ...scope]) : current.filter((id) => !scopeSet.has(id))
    };
  }
  const excluded = new Set(uniqueProfileSelectionIds(selection.excluded_profile_ids));
  scope.forEach((id) => selected ? excluded.delete(id) : excluded.add(id));
  return { ...selection, excluded_profile_ids: [...excluded] };
}

export function removeProcessedAdminProfiles(selection: AdminProfileSelection, processedIds: string[]): AdminProfileSelection {
  const processed = uniqueProfileSelectionIds(processedIds);
  if (selection.mode === 'explicit') {
    const processedSet = new Set(processed);
    return { mode: 'explicit', profile_ids: selection.profile_ids.filter((id) => !processedSet.has(id)) };
  }
  if (processed.length >= adminProfileSelectionCount(selection)) return emptyAdminProfileSelection;
  return setAdminProfileScopeSelected(selection, processed, false);
}

export function adminProfileSelectionRequest(selection: AdminProfileSelection) {
  return selection.mode === 'explicit'
    ? { mode: 'explicit' as const, profile_ids: uniqueProfileSelectionIds(selection.profile_ids) }
    : {
        mode: 'all_filtered' as const,
        filters: selection.filters,
        excluded_profile_ids: uniqueProfileSelectionIds(selection.excluded_profile_ids),
        total_count: selection.total_count
      };
}

export function resetAllFilteredSelectionForFilters(selection: AdminProfileSelection, filters: AdminProfileSelectionFilters) {
  const reset = selection.mode === 'all_filtered'
    && adminProfileSelectionFilterKey(selection.filters) !== adminProfileSelectionFilterKey(filters);
  return { selection: reset ? emptyAdminProfileSelection : selection, reset };
}
