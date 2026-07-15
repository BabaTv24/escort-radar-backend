export type AdminProfilesResponse<T extends Record<string, any>> = {
  profiles: T[];
  stats: {
    total_profiles: number;
    active_profiles: number;
    pending_profiles: number;
    suspended_profiles: number;
    test_accounts: number;
  };
};

export function buildAdminProfilesResponse<T extends Record<string, any>>(profiles: T[]): AdminProfilesResponse<T> {
  return {
    profiles,
    stats: {
      total_profiles: profiles.length,
      active_profiles: profiles.filter((profile) => profile.status === 'active').length,
      pending_profiles: profiles.filter((profile) => profile.status === 'pending').length,
      suspended_profiles: profiles.filter((profile) => profile.status === 'suspended' || profile.moderation_status === 'suspended').length,
      test_accounts: profiles.filter((profile) => profile.is_test_account).length
    }
  };
}
