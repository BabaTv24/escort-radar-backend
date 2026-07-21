function normalizeCityKey(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pl-PL')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l');
}

const polishCityOverrides = new Set([
  'bydgoszcz',
  'kolobrzeg',
  'koszalin',
  'stargard',
  'stargard szczecinski',
  'szczecin',
  'poznan'
]);

export function resolvePolishCityCountryOverride(city: unknown) {
  return polishCityOverrides.has(normalizeCityKey(city)) ? 'PL' : '';
}
