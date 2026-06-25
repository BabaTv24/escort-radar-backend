export type PublicProfileRecord = {
  status?: unknown;
  is_published?: unknown;
  moderation_status?: unknown;
  shadowbanned?: unknown;
};

export function isPublicProfile(profile: PublicProfileRecord) {
  if (profile.status !== 'active') return false;
  if (profile.is_published === false) return false;
  if (profile.moderation_status !== 'approved') return false;
  if (profile.shadowbanned === true) return false;
  return true;
}

export function publicProfileRejectionReason(profile: PublicProfileRecord) {
  if (profile.status !== 'active') return 'inactive';
  if (profile.is_published === false) return 'unpublished';
  if (profile.moderation_status !== 'approved') return 'not_approved';
  if (profile.shadowbanned === true) return 'hidden_by_admin';
  return null;
}
