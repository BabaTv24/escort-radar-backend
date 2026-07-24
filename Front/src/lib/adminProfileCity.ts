import type { Profile } from '../types';

export const unknownAdminProfileCityKey = '__unknown_city__';
export const unknownAdminProfileCountryKey = '__unknown_country__';

export type AdminProfileCityGroup = {
  key: string;
  name: string;
  profiles: Profile[];
  approvedCount: number;
};

export type AdminProfileCountryGroup = {
  key: string;
  name: string;
  profiles: Profile[];
  approvedCount: number;
  cities: AdminProfileCityGroup[];
};

const countryAliases: Record<string, string> = {
  de: 'DE', germany: 'DE', deutschland: 'DE', niemcy: 'DE',
  pl: 'PL', poland: 'PL', polska: 'PL',
  nl: 'NL', netherlands: 'NL', nederland: 'NL', holandia: 'NL',
  cz: 'CZ', czechia: 'CZ', 'czech republic': 'CZ', czechy: 'CZ',
  at: 'AT', austria: 'AT', osterreich: 'AT'
};

const polishCityCountryOverrides = new Set([
  'bydgoszcz',
  'kolobrzeg',
  'koszalin',
  'stargard',
  'stargard szczecinski',
  'szczecin',
  'poznan'
]);

const countryNames: Record<string, Record<string, string>> = {
  PL: { DE: 'Niemcy', PL: 'Polska', NL: 'Holandia', CZ: 'Republika Czeska', AT: 'Austria' },
  EN: { DE: 'Germany', PL: 'Poland', NL: 'Netherlands', CZ: 'Czechia', AT: 'Austria' },
  DE: { DE: 'Deutschland', PL: 'Polen', NL: 'Niederlande', CZ: 'Tschechien', AT: 'Österreich' }
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
  return String(value || '').trim().toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/ß/g, 'ss');
}

export function normalizeAdminProfileCountry(value: unknown, city?: unknown) {
  const cityKey = normalizeAdminProfileCitySearch(city);
  if (polishCityCountryOverrides.has(cityKey)) return 'PL';
  const normalized = normalizeAdminProfileCitySearch(value);
  const explicit = countryAliases[normalized];
  if (explicit) return explicit;
  if (cityKey === 'bonn') return 'DE';
  if (['prag', 'praga', 'praha', 'prague', 'pragu'].includes(cityKey)) return 'CZ';
  return unknownAdminProfileCountryKey;
}

export function adminProfileCountryName(code: string, language: string, unknownLabel: string) {
  if (code === unknownAdminProfileCountryKey) return unknownLabel;
  const locale = String(language || 'en').slice(0, 2).toUpperCase();
  return (countryNames[locale] || countryNames.EN)[code] || code;
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
    groups.set(key, { key, name: rawName || unknownCityLabel, profiles: [profile], approvedCount: profile.moderation_status === 'approved' ? 1 : 0 });
  }
  for (const group of groups.values()) {
    group.approvedCount = group.profiles.filter((profile) => profile.moderation_status === 'approved').length;
  }
  return [...groups.values()].sort((left, right) => {
    if (left.key === unknownAdminProfileCityKey) return 1;
    if (right.key === unknownAdminProfileCityKey) return -1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}

export function groupAdminProfilesByCountry(
  profiles: Profile[],
  language: string,
  unknownCountryLabel: string,
  unknownCityLabel: string
): AdminProfileCountryGroup[] {
  const groups = new Map<string, Profile[]>();
  for (const profile of profiles) {
    const row = profile as Profile & { country?: string | null };
    const key = normalizeAdminProfileCountry(row.work_country || row.country, adminProfileCityName(profile));
    groups.set(key, [...(groups.get(key) || []), profile]);
  }
  return [...groups.entries()].map(([key, rows]) => ({
    key,
    name: adminProfileCountryName(key, language, unknownCountryLabel),
    profiles: rows,
    approvedCount: rows.filter((profile) => profile.moderation_status === 'approved').length,
    cities: groupAdminProfilesByCity(rows, unknownCityLabel)
  })).sort((left, right) => {
    if (left.key === unknownAdminProfileCountryKey) return 1;
    if (right.key === unknownAdminProfileCountryKey) return -1;
    return left.name.localeCompare(right.name, language, { sensitivity: 'base' });
  });
}

export function filterAdminProfileCountryGroups(
  groups: AdminProfileCountryGroup[],
  cityQuery: string,
  selectedCountryKey = 'all',
  selectedCityKey = 'all'
) {
  const normalizedQuery = normalizeAdminProfileCitySearch(cityQuery);
  return groups.flatMap((country) => {
    if (selectedCountryKey !== 'all' && country.key !== selectedCountryKey) return [];
    const cities = country.cities.filter((city) => {
      const scopedKey = `${country.key}:${city.key}`;
      if (selectedCityKey !== 'all' && scopedKey !== selectedCityKey) return false;
      return !normalizedQuery || normalizeAdminProfileCitySearch(city.name).includes(normalizedQuery);
    });
    if (!cities.length) return [];
    const visibleIds = new Set(cities.flatMap((city) => city.profiles.map((profile) => profile.id)));
    const visibleProfiles = country.profiles.filter((profile) => visibleIds.has(profile.id));
    return [{ ...country, profiles: visibleProfiles, approvedCount: visibleProfiles.filter((profile) => profile.moderation_status === 'approved').length, cities }];
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

export function profileIdsInCountryGroups(groups: AdminProfileCountryGroup[]) {
  return [...new Set(groups.flatMap((group) => group.profiles.map((profile) => profile.id)))];
}

export function updateAdminProfileSelection(current: string[], visibleIds: string[], selected: boolean) {
  const visible = new Set(uniqueAdminProfileIds(visibleIds));
  return selected ? uniqueAdminProfileIds([...current, ...visible]) : uniqueAdminProfileIds(current).filter((id) => !visible.has(id));
}

export function uniqueAdminProfileIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

export function toggleAdminProfileSelection(current: string[], profileId: string) {
  const unique = uniqueAdminProfileIds(current);
  return unique.includes(profileId) ? unique.filter((id) => id !== profileId) : [...unique, profileId];
}

export function adminProfileSelectionState(current: string[], visibleIds: string[]) {
  const selected = new Set(uniqueAdminProfileIds(current));
  const visible = uniqueAdminProfileIds(visibleIds);
  const selectedVisibleCount = visible.filter((id) => selected.has(id)).length;
  return {
    checked: visible.length > 0 && selectedVisibleCount === visible.length,
    indeterminate: selectedVisibleCount > 0 && selectedVisibleCount < visible.length
  };
}

export function selectionAfterProcessedProfiles(current: string[], processedIds: string[]) {
  const processed = new Set(uniqueAdminProfileIds(processedIds));
  return uniqueAdminProfileIds(current).filter((id) => !processed.has(id));
}

export async function runAdminProfileSelectionRequest<T>(
  request: () => Promise<T>,
  processedIds: (result: T) => string[],
  updateSelection: (updater: (current: string[]) => string[]) => void
) {
  const result = await request();
  const processed = uniqueAdminProfileIds(processedIds(result));
  updateSelection((current) => selectionAfterProcessedProfiles(current, processed));
  return result;
}

function isBetterDisplayName(candidate: string, current: string) {
  if (!candidate) return false;
  const candidateHasCase = candidate !== candidate.toLocaleLowerCase('de-DE');
  const currentHasCase = current !== current.toLocaleLowerCase('de-DE');
  return candidateHasCase && !currentHasCase;
}
