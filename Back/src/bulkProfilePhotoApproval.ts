import { UUID_PATTERN } from './bulkPhotoModeration.js';

export type ProfilePhotoApprovalItem = {
  profile_id: string;
  status: 'matched' | 'not_found';
  pending_found: number;
  approved: number;
  already_approved: number;
  failed: number;
};

export type ProfilePhotoApprovalResult = {
  requested_profiles: number;
  matched_profiles: number;
  pending_found: number;
  approved: number;
  already_approved: number;
  failed: number;
  profiles: ProfilePhotoApprovalItem[];
};

type ImageStatusRow = { profile_id: string; moderation_status?: string | null };
type UpdatedImageRow = { profile_id: string };

export function validateProfilePhotoApprovalInput(body: unknown) {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  if (!Array.isArray(input.profile_ids)) return { error: 'profile_ids are required' } as const;
  const rawIds = input.profile_ids.map((value) => typeof value === 'string' ? value.trim() : '');
  if (!rawIds.length) return { error: 'profile_ids are required' } as const;
  if (rawIds.some((id) => !id)) return { error: 'profile_ids cannot contain empty values' } as const;
  if (rawIds.some((id) => !UUID_PATTERN.test(id))) return { error: 'Every profile_id must be a UUID' } as const;
  const profileIds = [...new Set(rawIds)];
  if (profileIds.length > 100) return { error: 'A maximum of 100 unique profile_ids is allowed' } as const;
  return { profileIds } as const;
}

export function buildProfilePhotoApprovalResult(
  profileIds: string[],
  matchedProfileIds: string[],
  imageRows: ImageStatusRow[],
  updatedRows: UpdatedImageRow[],
  updateFailed = false
): ProfilePhotoApprovalResult {
  const matched = new Set(matchedProfileIds);
  const approvedByProfile = countByProfile(updatedRows);
  const pendingByProfile = countByProfile(imageRows.filter((row) => row.moderation_status === 'pending'));
  const existingApprovedByProfile = countByProfile(imageRows.filter((row) => row.moderation_status === 'approved'));

  const profiles = profileIds.map((profileId): ProfilePhotoApprovalItem => {
    if (!matched.has(profileId)) {
      return { profile_id: profileId, status: 'not_found', pending_found: 0, approved: 0, already_approved: 0, failed: 0 };
    }
    const pendingFound = pendingByProfile.get(profileId) || 0;
    const approved = updateFailed ? 0 : approvedByProfile.get(profileId) || 0;
    const concurrentlyApproved = updateFailed ? 0 : Math.max(pendingFound - approved, 0);
    return {
      profile_id: profileId,
      status: 'matched',
      pending_found: pendingFound,
      approved,
      already_approved: (existingApprovedByProfile.get(profileId) || 0) + concurrentlyApproved,
      failed: updateFailed ? pendingFound : 0
    };
  });

  return {
    requested_profiles: profileIds.length,
    matched_profiles: profiles.filter((profile) => profile.status === 'matched').length,
    pending_found: sum(profiles, 'pending_found'),
    approved: sum(profiles, 'approved'),
    already_approved: sum(profiles, 'already_approved'),
    failed: sum(profiles, 'failed'),
    profiles
  };
}

function countByProfile(rows: Array<{ profile_id: string }>) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.profile_id, (counts.get(row.profile_id) || 0) + 1);
  return counts;
}

function sum(rows: ProfilePhotoApprovalItem[], key: 'pending_found' | 'approved' | 'already_approved' | 'failed') {
  return rows.reduce((total, row) => total + row[key], 0);
}
