import { normalizeAdminCatalogText, resolveAdminProfileCity, resolveAdminProfileCountry } from './adminProfileCatalog.js';

export type AdminProfileSelectionFilters = {
  q: string;
  type: string;
  published: 'all' | 'yes' | 'no';
  suspended: 'all' | 'yes' | 'no';
  seed: 'all' | 'yes' | 'no';
  verified: 'all' | 'yes' | 'no';
  premium_tier: string;
  owner_email: string;
  city_query: string;
  country: string;
  city: string;
};

export type AdminProfileSelection =
  | { mode: 'explicit'; profile_ids: string[] }
  | { mode: 'all_filtered'; filters: AdminProfileSelectionFilters; excluded_profile_ids: string[]; total_count?: number };

export type AdminProfileSelectionRow = {
  id: string;
  work_country?: string | null;
  work_city?: string | null;
  city?: string | null;
};

export type AdminProfileSelectionPageLoader = (
  filters: AdminProfileSelectionFilters,
  afterId: string | null,
  pageSize: number
) => Promise<AdminProfileSelectionRow[]>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedFilterKeys = new Set([
  'q', 'type', 'published', 'suspended', 'seed', 'verified', 'premium_tier',
  'owner_email', 'city_query', 'country', 'city'
]);
const triStateValues = new Set(['all', 'yes', 'no']);

function uniqueUuids(value: unknown) {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
  return ids.every((id) => uuidPattern.test(id)) ? ids : null;
}

function shortText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max);
}

export function validateAdminProfileSelectionFilters(value: unknown): { filters?: AdminProfileSelectionFilters; error?: string } {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) return { error: 'selection_filters_invalid' };
  const raw = (value || {}) as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !allowedFilterKeys.has(key))) return { error: 'selection_filter_not_allowed' };
  const published = shortText(raw.published || 'all', 8);
  const suspended = shortText(raw.suspended || 'all', 8);
  const seed = shortText(raw.seed || 'all', 8);
  const verified = shortText(raw.verified || 'all', 8);
  if (![published, suspended, seed, verified].every((item) => triStateValues.has(item))) return { error: 'selection_filter_value_invalid' };
  const type = shortText(raw.type || 'all', 40);
  const premiumTier = shortText(raw.premium_tier || 'all', 40);
  const country = shortText(raw.country, 40);
  const city = normalizeAdminCatalogText(shortText(raw.city, 120));
  if (!/^[a-z0-9_-]+$/i.test(type) || !/^[a-z0-9_-]+$/i.test(premiumTier)) return { error: 'selection_filter_value_invalid' };
  if (country && !/^(?:[A-Z]{2}|__unknown_country__)$/i.test(country)) return { error: 'selection_filter_value_invalid' };
  return {
    filters: {
      q: shortText(raw.q, 120),
      type,
      published: published as AdminProfileSelectionFilters['published'],
      suspended: suspended as AdminProfileSelectionFilters['suspended'],
      seed: seed as AdminProfileSelectionFilters['seed'],
      verified: verified as AdminProfileSelectionFilters['verified'],
      premium_tier: premiumTier,
      owner_email: shortText(raw.owner_email, 160),
      city_query: shortText(raw.city_query, 120),
      country: country.toLowerCase() === '__unknown_country__' ? '__unknown_country__' : country.toUpperCase(),
      city
    }
  };
}

export function validateAdminProfileSelection(value: unknown): { selection?: AdminProfileSelection; error?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'selection_required' };
  const raw = value as Record<string, unknown>;
  if (raw.mode === 'explicit') {
    const profileIds = uniqueUuids(raw.profile_ids);
    if (!profileIds) return { error: 'selection_profile_ids_invalid' };
    if (!profileIds.length) return { error: 'selection_empty' };
    return { selection: { mode: 'explicit', profile_ids: profileIds } };
  }
  if (raw.mode === 'all_filtered') {
    const validatedFilters = validateAdminProfileSelectionFilters(raw.filters);
    if (!validatedFilters.filters) return { error: validatedFilters.error };
    const excludedProfileIds = uniqueUuids(raw.excluded_profile_ids || []);
    if (!excludedProfileIds) return { error: 'selection_excluded_profile_ids_invalid' };
    return {
      selection: {
        mode: 'all_filtered',
        filters: validatedFilters.filters,
        excluded_profile_ids: excludedProfileIds,
        total_count: Number.isFinite(Number(raw.total_count)) ? Math.max(0, Number(raw.total_count)) : undefined
      }
    };
  }
  return { error: 'selection_mode_invalid' };
}

function rowMatchesLocationFilters(row: AdminProfileSelectionRow, filters: AdminProfileSelectionFilters) {
  if (filters.country && resolveAdminProfileCountry(row) !== filters.country) return false;
  const cityKey = normalizeAdminCatalogText(resolveAdminProfileCity(row));
  if (filters.city && cityKey !== filters.city) return false;
  if (filters.city_query) {
    const query = normalizeAdminCatalogText(filters.city_query).replace(/ue/g, 'u').replace(/oe/g, 'o').replace(/ae/g, 'a');
    const searchable = cityKey.replace(/ue/g, 'u').replace(/oe/g, 'o').replace(/ae/g, 'a');
    if (!searchable.includes(query)) return false;
  }
  return true;
}

export async function resolveAdminProfileSelection(
  selection: AdminProfileSelection,
  loadPage: AdminProfileSelectionPageLoader,
  pageSize = 1000
) {
  if (selection.mode === 'explicit') return [...new Set(selection.profile_ids)];
  const excluded = new Set(selection.excluded_profile_ids);
  const ids: string[] = [];
  let afterId: string | null = null;
  while (true) {
    const page = await loadPage(selection.filters, afterId, pageSize);
    if (!page.length) break;
    for (const row of page) {
      if (rowMatchesLocationFilters(row, selection.filters) && !excluded.has(row.id)) ids.push(row.id);
    }
    if (page.length < pageSize) break;
    const nextId = String(page[page.length - 1]?.id || '');
    if (!nextId || nextId === afterId) throw new Error('Admin profile selection cursor did not advance');
    afterId = nextId;
  }
  return [...new Set(ids)];
}
