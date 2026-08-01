import type { Profile } from '../types';

export const adminProfileAlphabet = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'] as const;
export type AdminProfileAlphabetValue = 'all' | (typeof adminProfileAlphabet)[number];

type CatalogCity = {
  profiles: Profile[];
  total: number;
  approved: number;
  pending: number;
  approvedCount: number;
};

type CatalogCountry<TCity extends CatalogCity = CatalogCity> = {
  profiles: Profile[];
  cities: TCity[];
  total: number;
  approved: number;
  pending: number;
  approvedCount: number;
};

const europeanBaseLetters: Record<string, string> = {
  æ: 'A', ð: 'D', đ: 'D', ħ: 'H', ı: 'I', ł: 'L', ŋ: 'N',
  ø: 'O', œ: 'O', ß: 'S', þ: 'T'
};

export function adminProfileAlphabetKey(value: unknown): Exclude<AdminProfileAlphabetValue, 'all'> {
  const firstCharacter = Array.from(String(value || '').trim())[0];
  if (!firstCharacter) return '#';
  const normalized = firstCharacter
    .toLocaleLowerCase('en-US')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  const base = (europeanBaseLetters[normalized] || normalized).charAt(0).toUpperCase();
  return /^[A-Z]$/.test(base) ? base as Exclude<AdminProfileAlphabetValue, 'all'> : '#';
}

export function adminProfileMatchesAlphabet(profile: Profile, alphabet: AdminProfileAlphabetValue) {
  return alphabet === 'all' || adminProfileAlphabetKey(profile.display_name) === alphabet;
}

export function adminProfileAlphabetCounts(profiles: Profile[]) {
  const counts = Object.fromEntries(adminProfileAlphabet.map((letter) => [letter, 0])) as Record<(typeof adminProfileAlphabet)[number], number>;
  profiles.forEach((profile) => { counts[adminProfileAlphabetKey(profile.display_name)] += 1; });
  return counts;
}

export function filterAdminProfileCatalogGroups<TCity extends CatalogCity, TCountry extends CatalogCountry<TCity>>(
  groups: TCountry[],
  alphabet: AdminProfileAlphabetValue
): TCountry[] {
  if (alphabet === 'all') return groups;
  return groups.flatMap((country) => {
    const cities = country.cities.flatMap((city) => {
      const profiles = city.profiles.filter((profile) => adminProfileMatchesAlphabet(profile, alphabet));
      if (!profiles.length) return [];
      const approvedCount = profiles.filter((profile) => profile.moderation_status === 'approved').length;
      const pending = profiles.filter((profile) => profile.moderation_status === 'pending').length;
      return [{ ...city, profiles, total: profiles.length, approved: approvedCount, approvedCount, pending }];
    }) as TCity[];
    if (!cities.length) return [];
    const profiles = cities.flatMap((city) => city.profiles);
    const approvedCount = profiles.filter((profile) => profile.moderation_status === 'approved').length;
    const pending = profiles.filter((profile) => profile.moderation_status === 'pending').length;
    return [{ ...country, cities, profiles, total: profiles.length, approved: approvedCount, approvedCount, pending }];
  }) as TCountry[];
}

export function adminProfileIdsInCatalogGroups(groups: Array<CatalogCountry>) {
  return [...new Set(groups.flatMap((country) => country.profiles.map((profile) => profile.id)))];
}
