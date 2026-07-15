import type { Profile } from '../types';

export const unknownAdminProfileCityKey = '__unknown_city__';

export type AdminProfileCityGroup = {
  key: string;
  name: string;
  profiles: Profile[];
};

export function adminProfileCityName(profile: Profile | Record<string, unknown>) {
  const row = profile as Record<string, unknown>;
  const candidates = [row.work_city, row.city, row.city_label, row.location_city];
  return candidates.map((value) => String(value || '').trim().replace(/\s+/g, ' ')).find(Boolean) || '';
}

export function normalizeAdminProfileCityKey(value: unknown) {
  const city = String(value || '').trim().replace(/\s+/g, ' ');
  return city ? city.toLocaleLowerCase('de-DE') : unknownAdminProfileCityKey;
}

export function normalizeAdminProfileCitySearch(value: unknown) {
  return String(value || '').trim().toLocaleLowerCase('de-DE').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/ß/g, 'ss');
}

export function groupAdminProfilesByCity(profiles: Profile[], unknownCityLabel: string): AdminProfileCityGroup[] {
  const groups = new Map<string, AdminProfileCityGroup>();
  for (const profile of profiles) {
    const rawName = adminProfileCityName(profile);
    const key = normalizeAdminProfileCityKey(rawName);
    const existing = groups.get(key);
    if (existing) {
      existing.profiles.push(profile);
      if (isBetterDisplayName(rawName, existing.name)) existing.name = rawName;
      continue;
    }
    groups.set(key, { key, name: rawName || unknownCityLabel, profiles: [profile] });
  }
  return [...groups.values()].sort((left, right) => {
    if (left.key === unknownAdminProfileCityKey) return 1;
    if (right.key === unknownAdminProfileCityKey) return -1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}

export function filterAdminProfileCityGroups(groups: AdminProfileCityGroup[], query: string, selectedKey = 'all') {
  const normalizedQuery = normalizeAdminProfileCitySearch(query);
  return groups.filter((group) => {
    if (selectedKey !== 'all' && group.key !== selectedKey) return false;
    return !normalizedQuery || normalizeAdminProfileCitySearch(group.name).includes(normalizedQuery);
  });
}

export function profileIdsInCityGroups(groups: AdminProfileCityGroup[]) {
  return [...new Set(groups.flatMap((group) => group.profiles.map((profile) => profile.id)))];
}

export function updateAdminProfileSelection(current: string[], visibleIds: string[], selected: boolean) {
  const visible = new Set(visibleIds);
  return selected ? [...new Set([...current, ...visibleIds])] : current.filter((id) => !visible.has(id));
}

function isBetterDisplayName(candidate: string, current: string) {
  if (!candidate) return false;
  const candidateHasCase = candidate !== candidate.toLocaleLowerCase('de-DE');
  const currentHasCase = current !== current.toLocaleLowerCase('de-DE');
  return candidateHasCase && !currentHasCase;
}
