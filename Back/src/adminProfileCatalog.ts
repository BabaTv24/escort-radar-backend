export const UNKNOWN_ADMIN_COUNTRY = '__unknown_country__';
export const UNKNOWN_ADMIN_CITY = '__unknown_city__';

export type AdminProfileCatalogRow = {
  id: string;
  work_country?: string | null;
  work_city?: string | null;
  city?: string | null;
  moderation_status?: string | null;
  admin_priority?: number | null;
  created_at?: string | null;
};

const countryAliases: Record<string, string> = {
  de: 'DE', germany: 'DE', deutschland: 'DE', niemcy: 'DE',
  pl: 'PL', poland: 'PL', polska: 'PL',
  nl: 'NL', netherlands: 'NL', nederland: 'NL', holandia: 'NL',
  cz: 'CZ', czechia: 'CZ', 'czech republic': 'CZ', czechy: 'CZ',
  at: 'AT', austria: 'AT', osterreich: 'AT'
};

const cityCountryFallback: Record<string, string> = {
  bonn: 'DE',
  prag: 'CZ', praga: 'CZ', praha: 'CZ', prague: 'CZ'
};

export function normalizeAdminCatalogText(value: unknown) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/ß/g, 'ss');
}

export function resolveAdminProfileCountry(row: Pick<AdminProfileCatalogRow, 'work_country' | 'work_city' | 'city'>) {
  const explicit = countryAliases[normalizeAdminCatalogText(row.work_country)];
  if (explicit) return explicit;
  const city = normalizeAdminCatalogText(row.work_city || row.city);
  return cityCountryFallback[city] || UNKNOWN_ADMIN_COUNTRY;
}

export function resolveAdminProfileCity(row: Pick<AdminProfileCatalogRow, 'work_city' | 'city'>) {
  return String(row.work_city || row.city || '').trim().replace(/\s+/g, ' ') || UNKNOWN_ADMIN_CITY;
}

export function aggregateAdminProfileCountries(rows: AdminProfileCatalogRow[]) {
  const groups = new Map<string, { key: string; total: number; approved: number; pending: number }>();
  for (const row of rows) {
    const key = resolveAdminProfileCountry(row);
    const group = groups.get(key) || { key, total: 0, approved: 0, pending: 0 };
    group.total += 1;
    group.approved += Number(row.moderation_status === 'approved');
    group.pending += Number(row.moderation_status === 'pending');
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => left.key === UNKNOWN_ADMIN_COUNTRY ? 1 : right.key === UNKNOWN_ADMIN_COUNTRY ? -1 : left.key.localeCompare(right.key));
}

export function aggregateAdminProfileCities(rows: AdminProfileCatalogRow[], country: string, search = '') {
  const normalizedSearch = normalizeAdminCatalogText(search).replace(/ue/g, 'u').replace(/oe/g, 'o').replace(/ae/g, 'a');
  const groups = new Map<string, { key: string; name: string; total: number; approved: number; pending: number }>();
  for (const row of rows) {
    if (resolveAdminProfileCountry(row) !== country) continue;
    const name = resolveAdminProfileCity(row);
    const key = normalizeAdminCatalogText(name);
    const searchable = key.replace(/ue/g, 'u').replace(/oe/g, 'o').replace(/ae/g, 'a');
    if (normalizedSearch && !searchable.includes(normalizedSearch)) continue;
    const group = groups.get(key) || { key, name, total: 0, approved: 0, pending: 0 };
    group.total += 1;
    group.approved += Number(row.moderation_status === 'approved');
    group.pending += Number(row.moderation_status === 'pending');
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => left.key === UNKNOWN_ADMIN_CITY ? 1 : right.key === UNKNOWN_ADMIN_CITY ? -1 : left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
}

export function selectAdminProfilePage(rows: AdminProfileCatalogRow[], country: string, cityKey: string, page: number, limit: number) {
  const matching = rows.filter((row) => resolveAdminProfileCountry(row) === country && normalizeAdminCatalogText(resolveAdminProfileCity(row)) === cityKey);
  const offset = (page - 1) * limit;
  return { ids: matching.slice(offset, offset + limit).map((row) => row.id), total: matching.length, hasMore: offset + limit < matching.length };
}
