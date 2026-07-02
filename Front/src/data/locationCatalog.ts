import { berlinDistrictOptions } from '../lib/geo';
import { citySlug, globalCountries, normalizeCountry } from '../lib/globalLocations';

export type LocationCity = {
  name: string;
  legacySlug?: string;
  districts: string[];
};

export type LocationCountry = {
  code: string;
  name: string;
  cities: LocationCity[];
};

const cityDistricts: Record<string, string[]> = {
  berlin: berlinDistrictOptions,
  hamburg: ['St. Pauli', 'Altona', 'Eimsbuttel', 'Sternschanze', 'HafenCity', 'Wandsbek', 'Harburg', 'Barmbek', 'Winterhude', 'Ottensen'],
  muenchen: ['Altstadt', 'Maxvorstadt', 'Schwabing', 'Ludwigsvorstadt', 'Isarvorstadt', 'Glockenbachviertel', 'Sendling', 'Bogenhausen', 'Neuhausen', 'Nymphenburg'],
  koeln: ['Innenstadt', 'Altstadt', 'Neustadt', 'Ehrenfeld', 'Nippes', 'Deutz', 'Kalk', 'Mulheim', 'Lindenthal', 'Rodenkirchen'],
  hannover: ['Mitte', 'List', 'Linden', 'Nordstadt', 'Sudstadt', 'Vahrenwald', 'Bothfeld', 'Dohren', 'Ricklingen', 'Herrenhausen']
};

export const locationCatalog: LocationCountry[] = globalCountries.map((country) => ({
  code: country.code,
  name: country.labels.en,
  cities: country.cities.map((name) => ({
    name,
    legacySlug: citySlug(name),
    districts: cityDistricts[citySlug(name)] || []
  }))
}));

export function getCountryByNameOrCode(value: string | null | undefined) {
  const normalized = normalizeLocationValue(value || '');
  const countryCode = normalizeCountry(value);
  return locationCatalog.find((country) => country.code === countryCode || normalizeLocationValue(country.code) === normalized || normalizeLocationValue(country.name) === normalized) || locationCatalog[0];
}

export function getCitiesForCountry(value: string | null | undefined) {
  return getCountryByNameOrCode(value).cities;
}

export function getCityConfig(country: string | null | undefined, city: string | null | undefined) {
  const normalized = normalizeLocationValue(city || '');
  return getCitiesForCountry(country).find((item) => normalizeLocationValue(item.name) === normalized || normalizeLocationValue(item.legacySlug || '') === normalized) || null;
}

export function getDistrictsForCity(country: string | null | undefined, city: string | null | undefined) {
  return getCityConfig(country, city)?.districts || [];
}

export function getLegacyCitySlug(value: string | null | undefined) {
  const normalized = normalizeLocationValue(value || '');
  for (const country of locationCatalog) {
    const city = country.cities.find((item) => normalizeLocationValue(item.name) === normalized || normalizeLocationValue(item.legacySlug || '') === normalized);
    if (city?.legacySlug) return city.legacySlug;
  }
  return normalized || 'berlin';
}

export function normalizeLocationValue(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}
