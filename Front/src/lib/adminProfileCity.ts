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

const countryNames: Record<string, Record<string, string>> = {
  PL: { DE: 'Niemcy', PL: 'Polska', NL: 'Holandia', CZ: 'Czechy', AT: 'Austria' },
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

export function normalizeAdminProfileCountry(value: unknown) {
  const normalized = normalizeAdminProfileCitySearch(value);
  return countryAliases[normalized] || unknownAdminProfileCountryKey;
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
    const key = normalizeAdminProfileCountry(row.work_country || row.country);
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
  const visible = new Set(visibleIds);
  return selected ? [...new Set([...current, ...visibleIds])] : current.filter((id) => !visible.has(id));
}

function isBetterDisplayName(candidate: string, current: string) {
  if (!candidate) return false;
  const candidateHasCase = candidate !== candidate.toLocaleLowerCase('de-DE');
  const currentHasCase = current !== current.toLocaleLowerCase('de-DE');
  return candidateHasCase && !currentHasCase;
}
