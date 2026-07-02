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

import { berlinDistrictOptions } from '../lib/geo';

export const locationCatalog: LocationCountry[] = [
  {
    code: 'DE',
    name: 'Germany',
    cities: [
      { name: 'Berlin', legacySlug: 'berlin', districts: berlinDistrictOptions },
      { name: 'Hamburg', legacySlug: 'hamburg', districts: ['St. Pauli', 'Altona', 'Eimsbuttel', 'Sternschanze', 'HafenCity', 'Wandsbek', 'Harburg', 'Barmbek', 'Winterhude', 'Ottensen'] },
      { name: 'Munchen', legacySlug: 'muenchen', districts: ['Altstadt', 'Maxvorstadt', 'Schwabing', 'Ludwigsvorstadt', 'Isarvorstadt', 'Glockenbachviertel', 'Sendling', 'Bogenhausen', 'Neuhausen', 'Nymphenburg'] },
      { name: 'Koln', legacySlug: 'koeln', districts: ['Innenstadt', 'Altstadt', 'Neustadt', 'Ehrenfeld', 'Nippes', 'Deutz', 'Kalk', 'Mulheim', 'Lindenthal', 'Rodenkirchen'] },
      { name: 'Hannover', legacySlug: 'hannover', districts: ['Mitte', 'List', 'Linden', 'Nordstadt', 'Sudstadt', 'Vahrenwald', 'Bothfeld', 'Dohren', 'Ricklingen', 'Herrenhausen'] }
    ]
  },
  {
    code: 'NL',
    name: 'Netherlands',
    cities: [
      { name: 'Amsterdam', districts: [] },
      { name: 'Rotterdam', districts: [] },
      { name: 'Den Haag', districts: [] },
      { name: 'Utrecht', districts: [] }
    ]
  },
  {
    code: 'BE',
    name: 'Belgium',
    cities: [
      { name: 'Brussels', districts: [] },
      { name: 'Antwerp', districts: [] },
      { name: 'Gent', districts: [] },
      { name: 'Liege', districts: [] }
    ]
  },
  {
    code: 'LU',
    name: 'Luxembourg',
    cities: [
      { name: 'Luxembourg City', districts: [] }
    ]
  }
];

export function getCountryByNameOrCode(value: string | null | undefined) {
  const normalized = normalizeLocationValue(value || '');
  return locationCatalog.find((country) => normalizeLocationValue(country.code) === normalized || normalizeLocationValue(country.name) === normalized) || locationCatalog[0];
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
