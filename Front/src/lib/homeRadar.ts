import type { Profile } from '../types';
import type { GeoPoint } from './geo';
import { isValidLatLng, resolveProfileRadarLocation, safeDistanceKm } from './geo';
import { selectSponsoredProfilesForLocation, toLocationCitySlug } from './sponsoredProfiles';

export const HOME_RADAR_RADIUS_METERS = 150_000;

export type HomeRadarProfile = {
  profile: Profile;
  distanceKm: number;
};

type PublicProfilesLoader = (
  params: URLSearchParams,
  options: { signal?: AbortSignal }
) => Promise<Profile[]>;

export function loadHomeRadarCandidatePool(loader: PublicProfilesLoader, signal?: AbortSignal) {
  return loader(new URLSearchParams({ radar: '1' }), { signal });
}

export function deriveHomeRadarView(profiles: Profile[], location: GeoPoint | null, status = 'all') {
  return {
    sponsoredProfiles: selectSponsoredProfilesForLocation(profiles, location),
    nearbyProfiles: selectHomeRadarProfiles(profiles, location, status)
  };
}

export function selectHomeRadarProfiles(profiles: Profile[], location: GeoPoint | null, status = 'all'): HomeRadarProfile[] {
  if (!location || !isValidLatLng(location.lat, location.lng)) return [];

  return profiles
    .map((profile): HomeRadarProfile | null => {
      // The radar=1 endpoint is the single public-eligibility authority. Here we only
      // enforce public location privacy, distance and the user's status selection.
      const profileLocation = resolveProfileRadarLocation(profile);
      if (!profileLocation) return null;
      const distanceKm = safeDistanceKm(location, profileLocation);
      if (distanceKm === null || distanceKm * 1000 > HOME_RADAR_RADIUS_METERS) return null;
      return { profile, distanceKm };
    })
    .filter((item): item is HomeRadarProfile => Boolean(item))
    .filter(({ profile }) => matchesRadarStatus(profile, status))
    .sort((left, right) => left.distanceKm - right.distanceKm);
}

export function matchesRadarStatus(profile: Profile, status: string) {
  if (status === 'all' || status === 'favorites') return true;
  const operatorStatus = getOperatorStatus(profile);
  if (status === 'online') return operatorStatus === 'ONLINE_NOW';
  if (status === 'available') return operatorStatus === 'ONLINE_NOW' || operatorStatus === 'AVAILABLE_TODAY';
  if (status === 'busy') return operatorStatus === 'BUSY';
  if (status === 'unavailable') return operatorStatus === 'OFFLINE';
  return operatorStatus === status;
}

export function getOperatorStatus(profile: Profile) {
  return profile.operator_status || (profile.available_now ? 'ONLINE_NOW' : profile.availability_status === 'busy' ? 'BUSY' : 'OFFLINE');
}

export function getHomeRadarHref(location: GeoPoint | null) {
  const citySlug = toLocationCitySlug(location);
  return citySlug ? `/city/${citySlug}` : '#live-radar';
}
