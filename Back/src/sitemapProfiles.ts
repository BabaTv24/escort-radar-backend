import { isActivePublicCategory } from './categories.js';
import { isPublicProfile } from './publicProfiles.js';

export type SitemapProfileCandidate = {
  id: string;
  updated_at?: string | null;
  category?: unknown;
  status?: unknown;
  is_published?: unknown;
  moderation_status?: unknown;
  shadowbanned?: unknown;
};

export function selectSitemapProfiles(profiles: SitemapProfileCandidate[]) {
  return profiles
    .filter((profile) => isPublicProfile(profile) && isActivePublicCategory(profile.category))
    .map((profile) => ({ id: profile.id, updated_at: profile.updated_at || null }));
}
