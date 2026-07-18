export const globalCountries = [
  { code: 'DE', labels: ['Germany', 'Niemcy', 'Deutschland'], cities: ['Berlin', 'Hamburg', 'Muenchen', 'Koeln', 'Frankfurt am Main', 'Duesseldorf', 'Stuttgart', 'Dortmund', 'Leipzig', 'Hannover', 'Bremen', 'Nuernberg', 'Dresden', 'Essen', 'Duisburg', 'Bochum'] },
  { code: 'PL', labels: ['Poland', 'Polska', 'Polen'], cities: ['Warszawa', 'Krakow', 'Wroclaw', 'Poznan', 'Gdansk', 'Lodz', 'Szczecin', 'Katowice', 'Lublin', 'Bydgoszcz', 'Swiebodzin', 'Stargard', 'Koszalin', 'Kolobrzeg'] },
  { code: 'NL', labels: ['Netherlands', 'Holandia', 'Niederlande'], cities: ['Amsterdam', 'Rotterdam', 'Den Haag', 'Utrecht', 'Eindhoven'] },
  { code: 'BE', labels: ['Belgium', 'Belgia', 'Belgien'], cities: ['Brussels', 'Antwerp', 'Gent', 'Liege'] },
  { code: 'LU', labels: ['Luxembourg', 'Luksemburg', 'Luxemburg'], cities: ['Luxembourg'] },
  { code: 'AT', labels: ['Austria', 'Oesterreich'], cities: ['Wien', 'Graz', 'Linz', 'Salzburg'] },
  { code: 'CH', labels: ['Switzerland', 'Szwajcaria', 'Schweiz'], cities: ['Zuerich', 'Basel', 'Bern', 'Geneve', 'Lausanne'] },
  { code: 'CZ', labels: ['Czech Republic', 'Czechy', 'Tschechien'], cities: ['Praha', 'Brno', 'Ostrava'] },
  { code: 'ES', labels: ['Spain', 'Hiszpania', 'Spanien'], cities: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Malaga'] },
  { code: 'FR', labels: ['France', 'Francja', 'Frankreich'], cities: ['Paris', 'Lyon', 'Marseille', 'Nice', 'Toulouse'] },
  { code: 'IT', labels: ['Italy', 'Wlochy', 'Italien'], cities: ['Roma', 'Milano', 'Napoli', 'Torino', 'Firenze'] }
];

export function normalizeCountry(value: unknown) {
  const key = normalizeText(value);
  return globalCountries.find((country) => normalizeText(country.code) === key || country.labels.some((label) => normalizeText(label) === key))?.code || '';
}

export function normalizeCity(value: unknown) {
  return citySlug(String(value || ''));
}

export function citySlug(value: string) {
  return normalizeText(value).replace(/_/g, '-');
}

export function getCityLabel(value: unknown) {
  const slug = normalizeCity(value);
  for (const country of globalCountries) {
    const match = country.cities.find((city) => citySlug(city) === slug);
    if (match) return match;
  }
  return String(value || '');
}

export function getCountryAliases(value: unknown) {
  const code = normalizeCountry(value);
  const country = globalCountries.find((item) => item.code === code);
  return country ? [country.code, ...country.labels] : [];
}

export type ResolvedCityLocation = {
  canonical_city: string;
  country_code: string;
  latitude: number;
  longitude: number;
  precision: 'city';
  approximate: true;
};

// Privacy-safe city centres used by import normalization and public radar hydration.
const cityLocations: Record<string, Omit<ResolvedCityLocation, 'precision' | 'approximate'>> = {
  berlin: { canonical_city: 'Berlin', country_code: 'DE', latitude: 52.52, longitude: 13.405 },
  hamburg: { canonical_city: 'Hamburg', country_code: 'DE', latitude: 53.5511, longitude: 9.9937 },
  muenchen: { canonical_city: 'Muenchen', country_code: 'DE', latitude: 48.1351, longitude: 11.582 },
  koeln: { canonical_city: 'Koeln', country_code: 'DE', latitude: 50.9375, longitude: 6.9603 },
  'frankfurt-am-main': { canonical_city: 'Frankfurt am Main', country_code: 'DE', latitude: 50.1109, longitude: 8.6821 },
  duesseldorf: { canonical_city: 'Duesseldorf', country_code: 'DE', latitude: 51.2277, longitude: 6.7735 },
  stuttgart: { canonical_city: 'Stuttgart', country_code: 'DE', latitude: 48.7758, longitude: 9.1829 },
  dortmund: { canonical_city: 'Dortmund', country_code: 'DE', latitude: 51.5136, longitude: 7.4653 },
  leipzig: { canonical_city: 'Leipzig', country_code: 'DE', latitude: 51.3397, longitude: 12.3731 },
  hannover: { canonical_city: 'Hannover', country_code: 'DE', latitude: 52.3759, longitude: 9.732 },
  bremen: { canonical_city: 'Bremen', country_code: 'DE', latitude: 53.0793, longitude: 8.8017 },
  nuernberg: { canonical_city: 'Nuernberg', country_code: 'DE', latitude: 49.4521, longitude: 11.0767 },
  dresden: { canonical_city: 'Dresden', country_code: 'DE', latitude: 51.0504, longitude: 13.7373 },
  essen: { canonical_city: 'Essen', country_code: 'DE', latitude: 51.4556, longitude: 7.0116 },
  duisburg: { canonical_city: 'Duisburg', country_code: 'DE', latitude: 51.4344, longitude: 6.7623 },
  bochum: { canonical_city: 'Bochum', country_code: 'DE', latitude: 51.4818, longitude: 7.2162 },
  warszawa: { canonical_city: 'Warszawa', country_code: 'PL', latitude: 52.2297, longitude: 21.0122 },
  krakow: { canonical_city: 'Krakow', country_code: 'PL', latitude: 50.0647, longitude: 19.945 },
  wroclaw: { canonical_city: 'Wroclaw', country_code: 'PL', latitude: 51.1079, longitude: 17.0385 },
  poznan: { canonical_city: 'Poznan', country_code: 'PL', latitude: 52.4064, longitude: 16.9252 },
  gdansk: { canonical_city: 'Gdansk', country_code: 'PL', latitude: 54.352, longitude: 18.6466 },
  lodz: { canonical_city: 'Lodz', country_code: 'PL', latitude: 51.7592, longitude: 19.456 },
  szczecin: { canonical_city: 'Szczecin', country_code: 'PL', latitude: 53.4285, longitude: 14.5528 },
  katowice: { canonical_city: 'Katowice', country_code: 'PL', latitude: 50.2649, longitude: 19.0238 },
  lublin: { canonical_city: 'Lublin', country_code: 'PL', latitude: 51.2465, longitude: 22.5684 },
  bydgoszcz: { canonical_city: 'Bydgoszcz', country_code: 'PL', latitude: 53.1235, longitude: 18.0084 },
  swiebodzin: { canonical_city: 'Swiebodzin', country_code: 'PL', latitude: 52.2475, longitude: 15.5336 },
  stargard: { canonical_city: 'Stargard', country_code: 'PL', latitude: 53.336, longitude: 15.0499 },
  koszalin: { canonical_city: 'Koszalin', country_code: 'PL', latitude: 54.1944, longitude: 16.1722 },
  kolobrzeg: { canonical_city: 'Kolobrzeg', country_code: 'PL', latitude: 54.1757, longitude: 15.5833 },
  amsterdam: { canonical_city: 'Amsterdam', country_code: 'NL', latitude: 52.3676, longitude: 4.9041 },
  rotterdam: { canonical_city: 'Rotterdam', country_code: 'NL', latitude: 51.9244, longitude: 4.4777 },
  'den-haag': { canonical_city: 'Den Haag', country_code: 'NL', latitude: 52.0705, longitude: 4.3007 },
  utrecht: { canonical_city: 'Utrecht', country_code: 'NL', latitude: 52.0907, longitude: 5.1214 },
  eindhoven: { canonical_city: 'Eindhoven', country_code: 'NL', latitude: 51.4416, longitude: 5.4697 },
  brussels: { canonical_city: 'Brussels', country_code: 'BE', latitude: 50.8503, longitude: 4.3517 },
  antwerp: { canonical_city: 'Antwerp', country_code: 'BE', latitude: 51.2194, longitude: 4.4025 },
  gent: { canonical_city: 'Gent', country_code: 'BE', latitude: 51.0543, longitude: 3.7174 },
  liege: { canonical_city: 'Liege', country_code: 'BE', latitude: 50.6326, longitude: 5.5797 },
  luxembourg: { canonical_city: 'Luxembourg', country_code: 'LU', latitude: 49.6116, longitude: 6.1319 },
  wien: { canonical_city: 'Wien', country_code: 'AT', latitude: 48.2082, longitude: 16.3738 },
  graz: { canonical_city: 'Graz', country_code: 'AT', latitude: 47.0707, longitude: 15.4395 },
  linz: { canonical_city: 'Linz', country_code: 'AT', latitude: 48.3069, longitude: 14.2858 },
  salzburg: { canonical_city: 'Salzburg', country_code: 'AT', latitude: 47.8095, longitude: 13.055 },
  zuerich: { canonical_city: 'Zuerich', country_code: 'CH', latitude: 47.3769, longitude: 8.5417 },
  basel: { canonical_city: 'Basel', country_code: 'CH', latitude: 47.5596, longitude: 7.5886 },
  bern: { canonical_city: 'Bern', country_code: 'CH', latitude: 46.948, longitude: 7.4474 },
  geneve: { canonical_city: 'Geneve', country_code: 'CH', latitude: 46.2044, longitude: 6.1432 },
  lausanne: { canonical_city: 'Lausanne', country_code: 'CH', latitude: 46.5197, longitude: 6.6323 },
  praha: { canonical_city: 'Praha', country_code: 'CZ', latitude: 50.0755, longitude: 14.4378 },
  brno: { canonical_city: 'Brno', country_code: 'CZ', latitude: 49.1951, longitude: 16.6068 },
  ostrava: { canonical_city: 'Ostrava', country_code: 'CZ', latitude: 49.8209, longitude: 18.2625 },
  madrid: { canonical_city: 'Madrid', country_code: 'ES', latitude: 40.4168, longitude: -3.7038 },
  barcelona: { canonical_city: 'Barcelona', country_code: 'ES', latitude: 41.3874, longitude: 2.1686 },
  valencia: { canonical_city: 'Valencia', country_code: 'ES', latitude: 39.4699, longitude: -0.3763 },
  sevilla: { canonical_city: 'Sevilla', country_code: 'ES', latitude: 37.3891, longitude: -5.9845 },
  malaga: { canonical_city: 'Malaga', country_code: 'ES', latitude: 36.7213, longitude: -4.4214 },
  paris: { canonical_city: 'Paris', country_code: 'FR', latitude: 48.8566, longitude: 2.3522 },
  lyon: { canonical_city: 'Lyon', country_code: 'FR', latitude: 45.764, longitude: 4.8357 },
  marseille: { canonical_city: 'Marseille', country_code: 'FR', latitude: 43.2965, longitude: 5.3698 },
  nice: { canonical_city: 'Nice', country_code: 'FR', latitude: 43.7102, longitude: 7.262 },
  toulouse: { canonical_city: 'Toulouse', country_code: 'FR', latitude: 43.6047, longitude: 1.4442 },
  roma: { canonical_city: 'Roma', country_code: 'IT', latitude: 41.9028, longitude: 12.4964 },
  milano: { canonical_city: 'Milano', country_code: 'IT', latitude: 45.4642, longitude: 9.19 },
  napoli: { canonical_city: 'Napoli', country_code: 'IT', latitude: 40.8518, longitude: 14.2681 },
  torino: { canonical_city: 'Torino', country_code: 'IT', latitude: 45.0703, longitude: 7.6869 },
  firenze: { canonical_city: 'Firenze', country_code: 'IT', latitude: 43.7696, longitude: 11.2558 }
};

export function resolveCityLocation(value: unknown): ResolvedCityLocation | null {
  const resolved = cityLocations[normalizeCity(value)];
  return resolved ? { ...resolved, precision: 'city', approximate: true } : null;
}

function normalizeText(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ł/g, 'l')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
