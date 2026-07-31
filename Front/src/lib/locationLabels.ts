import type { Profile } from '../types';

type Translate = (key: string, params?: Record<string, string | number>) => string;
type PublicLocationMode = 'exact' | 'postal_area' | 'city_only' | 'hidden';

export function getPublicLocationMode(profile: Pick<Profile, 'location_mode' | 'location_visibility'>): PublicLocationMode {
  if (profile.location_visibility) return profile.location_visibility;
  if (profile.location_mode === 'exact_hidden' || profile.location_mode === 'hidden') return 'hidden';
  if (profile.location_mode === 'city_only') return 'city_only';
  if (profile.location_mode === 'exact') return 'exact';
  if (profile.location_mode === 'postal_area' || profile.location_mode === 'approximate') return 'postal_area';
  return 'city_only';
}

export function getPublicLocationLabel(profile: Profile, t: Translate) {
  const city = profile.work_city || profile.city;
  const area = profile.work_area || profile.area || profile.approximate_location_area || '';
  const mode = getPublicLocationMode(profile);

  if (mode === 'hidden') return t('radar.locationHidden');
  if (area && area.toLocaleLowerCase() !== String(city).toLocaleLowerCase()) return `${area}, ${city}`;
  if (profile.location_approximate || profile.location_precision === 'city') return `${city} (${t('radar.approximateDistance')})`;
  return city;
}
