import { normalizeCountry, resolveCityLocation } from './locations.js';

export function resolveProfileCountry(country: unknown, city: unknown) {
  const explicit = normalizeCountry(country);
  const resolvedCity = resolveCityLocation(city);
  if (resolvedCity && (!explicit || (explicit === 'DE' && resolvedCity.country_code !== 'DE'))) {
    return resolvedCity.country_code;
  }
  return explicit || resolvedCity?.country_code || '';
}

export function canonicalizeProfileLocation<T extends Record<string, unknown>>(profile: T): T {
  const rawCity = String(profile.work_city || profile.city || '').trim();
  const resolvedCity = resolveCityLocation(rawCity);
  const workCountry = resolveProfileCountry(profile.work_country, rawCity);
  return {
    ...profile,
    ...(workCountry ? { work_country: workCountry } : {}),
    ...(resolvedCity ? { work_city: resolvedCity.canonical_city } : rawCity ? { work_city: rawCity } : {})
  };
}

export function resolvePolishCityCountryOverride(city: unknown) {
  return resolveCityLocation(city)?.country_code === 'PL' ? 'PL' : '';
}
