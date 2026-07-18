import { isActivePublicCategory } from './categories.js';
import { isPublicProfile } from './publicProfiles.js';
import { buildCityOnlyLayoutIndexes, resolveEffectivePublicLocation } from './publicLocation.js';

export type RadarPoolMeta = {
  fetched_candidates: number;
  eligible_candidates: number;
  located_candidates: number;
  unlocated_candidates: number;
  pages_fetched: number;
  truncated: boolean;
  warning?: string;
};

export function isRadarRequest(value: unknown) {
  return value === '1';
}

export function prepareRadarCandidatePool(records: Record<string, any>[], pagesFetched = 1, truncated = false) {
  const uniqueRecords = dedupeRadarCandidates(records);
  const eligibleRecords = uniqueRecords.filter((profile) => isPublicProfile(profile) && isActivePublicCategory(profile.category));
  const layoutIndexes = buildCityOnlyLayoutIndexes(eligibleRecords);
  const candidates = eligibleRecords.map((profile) => ({
    profile,
    location: resolveEffectivePublicLocation(profile, layoutIndexes.get(String(profile.id)))
  }));
  const locatedCandidates = candidates.filter((candidate) => Boolean(candidate.location)).length;
  const warning = truncated ? 'Radar candidate pool reached the technical pagination limit.' : undefined;

  return {
    candidates,
    meta: {
      fetched_candidates: records.length,
      eligible_candidates: candidates.length,
      located_candidates: locatedCandidates,
      unlocated_candidates: candidates.length - locatedCandidates,
      pages_fetched: pagesFetched,
      truncated,
      ...(warning ? { warning } : {})
    } satisfies RadarPoolMeta
  };
}

export function dedupeRadarCandidates<T extends Record<string, any>>(records: T[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    const id = String(record.id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
