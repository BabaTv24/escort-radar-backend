export const globalCountries = [
  { code: 'DE', labels: ['Germany', 'Niemcy', 'Deutschland'], cities: ['Berlin', 'Hamburg', 'Muenchen', 'Koeln', 'Frankfurt am Main', 'Duesseldorf', 'Stuttgart', 'Dortmund', 'Leipzig', 'Hannover', 'Bremen', 'Nuernberg', 'Dresden', 'Essen', 'Duisburg', 'Bochum'] },
  { code: 'PL', labels: ['Poland', 'Polska', 'Polen'], cities: ['Warszawa', 'Krakow', 'Wroclaw', 'Poznan', 'Gdansk', 'Lodz', 'Szczecin', 'Katowice', 'Lublin', 'Bydgoszcz'] },
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

function normalizeText(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
