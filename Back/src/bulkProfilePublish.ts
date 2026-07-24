import { isActivePublicCategory } from './categories.js';
import { isPublicProfile } from './publicProfiles.js';

export type BulkProfilePublishStatus =
  | 'published'
  | 'already_published'
  | 'skipped_moderation_pending'
  | 'skipped_unpaid_or_inactive_subscription'
  | 'skipped_suspended'
  | 'skipped_incomplete'
  | 'not_found'
  | 'failed';

export type BulkProfilePublishItem = {
  profile_id: string;
  status: BulkProfilePublishStatus;
  error?: string;
};

export type BulkProfilePublishResponse = {
  operation: 'publish';
  requested: number;
  published: number;
  already_published: number;
  skipped: number;
  failed: number;
  updated: number;
  items: BulkProfilePublishItem[];
};

type ProfileRecord = Record<string, any> & { id: string };

export function classifyProfileForPublish(profile: ProfileRecord): Exclude<BulkProfilePublishStatus, 'published' | 'not_found' | 'failed'> | 'publishable' {
  if (profile.status === 'suspended' || profile.moderation_status === 'suspended' || profile.shadowbanned !== false) {
    return 'skipped_suspended';
  }
  if (profile.moderation_status !== 'approved') return 'skipped_moderation_pending';
  if (profile.status !== 'active' || !isActivePublicCategory(profile.category)) return 'skipped_incomplete';

  // Keep this check tied to the same predicate used by the public profiles API.
  // Subscription, photos, prices and GPS are deliberately not publication gates.
  if (!isPublicProfile({ ...profile, is_published: true })) return 'skipped_incomplete';
  if (profile.is_published === true) return 'already_published';
  return 'publishable';
}

export async function runBulkProfilePublish(
  profileIds: string[],
  profiles: ProfileRecord[],
  publishProfile: (profileId: string) => Promise<void>
): Promise<BulkProfilePublishResponse> {
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const results = new Map<string, BulkProfilePublishItem>();
  const publishableIds: string[] = [];

  for (const profileId of profileIds) {
    const profile = profilesById.get(profileId);
    if (!profile) {
      results.set(profileId, { profile_id: profileId, status: 'not_found' });
      continue;
    }
    const status = classifyProfileForPublish(profile);
    if (status === 'publishable') publishableIds.push(profileId);
    else results.set(profileId, { profile_id: profileId, status });
  }

  const concurrency = 25;
  for (let offset = 0; offset < publishableIds.length; offset += concurrency) {
    await Promise.all(publishableIds.slice(offset, offset + concurrency).map(async (profileId) => {
      try {
        await publishProfile(profileId);
        results.set(profileId, { profile_id: profileId, status: 'published' });
      } catch (error) {
        results.set(profileId, {
          profile_id: profileId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'publish_failed'
        });
      }
    }));
  }

  const items = profileIds.map((profileId) => results.get(profileId) || ({ profile_id: profileId, status: 'failed' as const }));
  const published = countStatus(items, 'published');
  const alreadyPublished = countStatus(items, 'already_published');
  const failed = countStatus(items, 'failed');
  const skipped = items.filter((item) => item.status.startsWith('skipped_') || item.status === 'not_found').length;

  return {
    operation: 'publish',
    requested: profileIds.length,
    published,
    already_published: alreadyPublished,
    skipped,
    failed,
    updated: published,
    items
  };
}

function countStatus(items: BulkProfilePublishItem[], status: BulkProfilePublishStatus) {
  return items.filter((item) => item.status === status).length;
}
