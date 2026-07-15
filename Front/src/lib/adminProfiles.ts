import type { Profile } from '../types';

export type AdminProfileFilters = {
  city: string;
  type: string;
  published: string;
  suspended: string;
  seed: string;
  verified: string;
  premium_tier: string;
  owner_email: string;
};

export type AdminProfilesPayload = {
  profiles: Profile[];
  stats: Record<string, number>;
};

export const defaultAdminProfileFilters: AdminProfileFilters = {
  city: 'all',
  type: 'all',
  published: 'all',
  suspended: 'all',
  seed: 'all',
  verified: 'all',
  premium_tier: 'all',
  owner_email: ''
};

export function profileMatchesAdminFilters(profile: Profile, query: string, filters: AdminProfileFilters) {
  const haystack = JSON.stringify(profile).toLowerCase();
  if (query && !haystack.includes(query.toLowerCase())) return false;
  if (filters.city !== 'all' && profile.city !== filters.city) return false;
  if (filters.type !== 'all' && profile.category !== filters.type) return false;
  if (filters.published !== 'all' && Boolean(profile.is_published !== false) !== (filters.published === 'yes')) return false;
  if (filters.suspended !== 'all') {
    const suspended = profile.status === 'suspended' || profile.moderation_status === 'suspended';
    if (suspended !== (filters.suspended === 'yes')) return false;
  }
  if (filters.seed !== 'all' && Boolean(profile.is_seed_profile) !== (filters.seed === 'yes')) return false;
  if (filters.verified !== 'all' && Boolean(profile.verified) !== (filters.verified === 'yes')) return false;
  if (filters.premium_tier !== 'all' && profile.premium_tier !== filters.premium_tier) return false;
  if (filters.owner_email && !String(profile.owner_email || '').toLowerCase().includes(filters.owner_email.toLowerCase())) return false;
  return true;
}

export function resolveAdminProfilesResult(result: PromiseSettledResult<AdminProfilesPayload>):
  | { ok: true; data: AdminProfilesPayload }
  | { ok: false; error: string } {
  if (result.status === 'rejected') {
    return { ok: false, error: result.reason instanceof Error ? result.reason.message : String(result.reason || 'Request failed') };
  }
  if (!result.value || !Array.isArray(result.value.profiles)) {
    return { ok: false, error: 'Invalid admin profiles response: profiles must be an array' };
  }
  return { ok: true, data: result.value };
}
