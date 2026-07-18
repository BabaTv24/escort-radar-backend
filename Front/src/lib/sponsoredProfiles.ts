import type { Profile } from '../types';
import type { GeoPoint } from './geo';

export function isSponsoredProfile(profile: Profile) {
  return profile.is_sponsored || profile.acquisition_source === 'admin_sponsored' || profile.provider === 'manual_admin';
}

export function selectSponsoredProfilesForLocation(profiles: Profile[], location: GeoPoint | null, _legacyRadius?: number) {
  const locationCity = getLocationCity(location);
  if (!locationCity) return [];
  return profiles.filter((profile) => isSponsoredProfile(profile) && cityNamesMatch(getProfileCity(profile), locationCity));
}

export function getProfileCity(profile: Profile) {
  const raw = profile as Profile & Record<string, unknown>;
  return text(raw.work_city) || text(raw.city) || text(raw.location_city) || text(raw.location_city_label);
}

export function getLocationCity(location: GeoPoint | null) {
  return text(location?.city) || text(location?.label);
}

export function cityNamesMatch(left: string, right: string) {
  if (!left || !right) return false;
  const leftKeys = cityNormalizationKeys(left);
  const rightKeys = cityNormalizationKeys(right);
  if (leftKeys.some((key) => rightKeys.includes(key))) return true;

  // A geocoder label may contain an address and country around the city name.
  return leftKeys.some((key) => rightKeys.some((candidate) => containsNormalizedPhrase(candidate, key)));
}

export function normalizeCityName(value: string) {
  return normalizeCityVariant(value, true);
}

export function toLocationCitySlug(location: GeoPoint | null) {
  return normalizeCityName(getLocationCity(location)).replace(/\s+/g, '-');
}

function cityNormalizationKeys(value: string) {
  return [...new Set([
    normalizeCityVariant(value, true),
    normalizeCityVariant(value, false)
  ].filter(Boolean))];
}

function normalizeCityVariant(value: string, transliterateGerman: boolean) {
  let normalized = value.trim().toLowerCase().replace(/ß/g, 'ss').replace(/ł/g, 'l');
  if (transliterateGerman) normalized = normalized.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
  return normalized
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function containsNormalizedPhrase(value: string, phrase: string) {
  return ` ${value} `.includes(` ${phrase} `);
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}
