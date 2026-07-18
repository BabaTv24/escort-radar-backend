export type GlobalCountry = {
  code: string;
  labels: { en: string; pl: string; de: string };
  cities: string[];
};

export const globalCountries: GlobalCountry[] = [
  { code: 'DE', labels: { en: 'Germany', pl: 'Niemcy', de: 'Deutschland' }, cities: ['Berlin', 'Hamburg', 'Muenchen', 'Koeln', 'Frankfurt am Main', 'Duesseldorf', 'Stuttgart', 'Dortmund', 'Leipzig', 'Hannover', 'Bremen', 'Nuernberg', 'Dresden', 'Essen', 'Duisburg', 'Bochum'] },
  { code: 'PL', labels: { en: 'Poland', pl: 'Polska', de: 'Polen' }, cities: ['Warszawa', 'Krakow', 'Wroclaw', 'Poznan', 'Gdansk', 'Lodz', 'Szczecin', 'Katowice', 'Lublin', 'Bydgoszcz', 'Swiebodzin', 'Stargard', 'Koszalin', 'Kolobrzeg'] },
  { code: 'NL', labels: { en: 'Netherlands', pl: 'Holandia', de: 'Niederlande' }, cities: ['Amsterdam', 'Rotterdam', 'Den Haag', 'Utrecht', 'Eindhoven'] },
  { code: 'BE', labels: { en: 'Belgium', pl: 'Belgia', de: 'Belgien' }, cities: ['Brussels', 'Antwerp', 'Gent', 'Liege'] },
  { code: 'LU', labels: { en: 'Luxembourg', pl: 'Luksemburg', de: 'Luxemburg' }, cities: ['Luxembourg'] },
  { code: 'AT', labels: { en: 'Austria', pl: 'Austria', de: 'Oesterreich' }, cities: ['Wien', 'Graz', 'Linz', 'Salzburg'] },
  { code: 'CH', labels: { en: 'Switzerland', pl: 'Szwajcaria', de: 'Schweiz' }, cities: ['Zuerich', 'Basel', 'Bern', 'Geneve', 'Lausanne'] },
  { code: 'CZ', labels: { en: 'Czech Republic', pl: 'Czechy', de: 'Tschechien' }, cities: ['Praha', 'Brno', 'Ostrava'] },
  { code: 'ES', labels: { en: 'Spain', pl: 'Hiszpania', de: 'Spanien' }, cities: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Malaga'] },
  { code: 'FR', labels: { en: 'France', pl: 'Francja', de: 'Frankreich' }, cities: ['Paris', 'Lyon', 'Marseille', 'Nice', 'Toulouse'] },
  { code: 'IT', labels: { en: 'Italy', pl: 'Wlochy', de: 'Italien' }, cities: ['Roma', 'Milano', 'Napoli', 'Torino', 'Firenze'] }
];

export function normalizeCountry(value: unknown) {
  const key = normalizeText(value);
  return globalCountries.find((country) => normalizeText(country.code) === key || Object.values(country.labels).some((label) => normalizeText(label) === key))?.code || '';
}

export function normalizeCity(value: unknown) {
  return citySlug(String(value || ''));
}

export function citySlug(value: string) {
  return normalizeText(value).replace(/_/g, '-');
}

export function getCitiesForCountry(country: unknown) {
  const code = normalizeCountry(country) || 'DE';
  return globalCountries.find((item) => item.code === code)?.cities || [];
}

export function getPopularCities(country?: unknown) {
  if (country) return getCitiesForCountry(country).slice(0, 8);
  return globalCountries.flatMap((item) => item.cities.slice(0, 2)).slice(0, 14);
}

export function getCountryLabel(country: unknown, lang: 'en' | 'pl' | 'de' = 'en') {
  const code = normalizeCountry(country) || String(country || '').toUpperCase();
  const record = globalCountries.find((item) => item.code === code);
  return record?.labels[lang] || record?.labels.en || code;
}

export function getCityLabel(city: unknown) {
  const slug = normalizeCity(city);
  for (const country of globalCountries) {
    const match = country.cities.find((item) => citySlug(item) === slug);
    if (match) return match;
  }
  return String(city || '');
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
