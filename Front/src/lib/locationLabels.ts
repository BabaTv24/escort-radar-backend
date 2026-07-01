import type { Profile } from '../types';

type Translate = (key: string, params?: Record<string, string | number>) => string;
type PublicLocationMode = 'exact' | 'postal_area' | 'city_only' | 'hidden';

export function getPublicLocationMode(profile: Pick<Profile, 'location_mode' | 'work_place_label' | 'exact_address'>): PublicLocationMode {
  if (profile.location_mode === 'exact_hidden' || profile.location_mode === 'hidden') return 'hidden';
  if (profile.location_mode === 'city_only') return 'city_only';
  if (profile.location_mode === 'exact') return 'exact';
  if (profile.location_mode === 'postal_area' || profile.location_mode === 'approximate') {
    return profile.work_place_label || profile.exact_address ? 'exact' : 'postal_area';
  }
  return 'city_only';
}

export function getPublicLocationLabel(profile: Profile, t: Translate) {
  const city = profile.work_city || profile.city;
  const area = profile.work_area || profile.area || profile.approximate_location_area || '';
  const postal = profile.postal_code || '';
  const place = profile.work_place_label || profile.exact_address || '';
  const mode = getPublicLocationMode(profile);

  if (mode === 'hidden') return t('radar.locationHidden');
  if (mode === 'exact') return place || [postal, city].filter(Boolean).join(' ');
  if (mode === 'postal_area') {
    const location = [postal, city].filter(Boolean).join(' ');
    return [location, area].filter(Boolean).join(' / ') || city;
  }
  return city;
}
