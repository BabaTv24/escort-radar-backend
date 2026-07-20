export type AdminProfilesResponse<T extends Record<string, any>> = {
  profiles: T[];
  stats: AdminProfileStats;
  pagination?: AdminProfilesPagination;
};

export type AdminProfileStats = {
  total_profiles: number;
  active_profiles: number;
  pending_profiles: number;
  suspended_profiles: number;
  test_accounts: number;
  sponsored_total: number;
  approved_total: number;
  pending_approval_total: number;
  published_total: number;
  awaiting_owner_total: number;
  sponsored_approved: number;
  sponsored_pending: number;
  sponsored_other_moderation: number;
  sponsored_published: number;
  sponsored_awaiting_owner: number;
};

export type AdminProfilesPagination = {
  page_size: number;
  pages_loaded: number;
  loaded_profiles: number;
  safety_limit: number;
  truncated: boolean;
};

export function buildAdminProfilesResponse<T extends Record<string, any>>(
  profiles: T[],
  globalStats?: AdminProfileStats,
  pagination?: AdminProfilesPagination
): AdminProfilesResponse<T> {
  const localStats: AdminProfileStats = {
    total_profiles: profiles.length,
    active_profiles: profiles.filter((profile) => profile.status === 'active').length,
    pending_profiles: profiles.filter((profile) => profile.status === 'pending').length,
    suspended_profiles: profiles.filter((profile) => profile.status === 'suspended' || profile.moderation_status === 'suspended').length,
    test_accounts: profiles.filter((profile) => profile.is_test_account).length,
    sponsored_total: profiles.filter((profile) => profile.sponsorship_type === 'admin_sponsored').length,
    approved_total: profiles.filter((profile) => profile.moderation_status === 'approved').length,
    pending_approval_total: profiles.filter((profile) => profile.moderation_status === 'pending').length,
    published_total: profiles.filter((profile) => profile.is_published === true).length,
    awaiting_owner_total: profiles.filter((profile) => profile.owner_activation_status === 'awaiting_owner_activation').length,
    sponsored_approved: profiles.filter((profile) => profile.sponsorship_type === 'admin_sponsored' && profile.moderation_status === 'approved').length,
    sponsored_pending: profiles.filter((profile) => profile.sponsorship_type === 'admin_sponsored' && profile.moderation_status === 'pending').length,
    sponsored_other_moderation: profiles.filter((profile) => profile.sponsorship_type === 'admin_sponsored' && !['approved', 'pending'].includes(profile.moderation_status)).length,
    sponsored_published: profiles.filter((profile) => profile.sponsorship_type === 'admin_sponsored' && profile.is_published === true).length,
    sponsored_awaiting_owner: profiles.filter((profile) => profile.sponsorship_type === 'admin_sponsored' && profile.owner_activation_status === 'awaiting_owner_activation').length
  };
  return {
    profiles,
    stats: globalStats || localStats,
    ...(pagination ? { pagination } : {})
  };
}
