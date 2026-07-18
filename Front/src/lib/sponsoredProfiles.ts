import type { Profile } from '../types';
import type { GeoPoint } from './geo';
import { isProfileInRadarRange } from './geo';

export function isSponsoredProfile(profile: Profile) {
  return profile.is_sponsored || profile.acquisition_source === 'admin_sponsored' || profile.provider === 'manual_admin';
}

export function selectSponsoredProfilesForLocation(profiles: Profile[], location: GeoPoint, radius: number) {
  return profiles.filter((profile) => isSponsoredProfile(profile) && isProfileInRadarRange(profile, location, radius).inRange);
}
