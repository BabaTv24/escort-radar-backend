import { resolveCityLocation } from './locations.js';

export type EffectivePublicLocation = {
  latitude: number;
  longitude: number;
  location_approximate: boolean;
  location_precision: 'exact' | 'postal_area' | 'city';
};

export function resolveEffectivePublicLocation(profile: Record<string, any>): EffectivePublicLocation | null {
  const visibility = normalizeEffectiveLocationVisibility(profile.location_mode, profile.location_visibility);
  if (visibility === 'hidden') return null;

  const latitude = Number(profile.latitude);
  const longitude = Number(profile.longitude);
  const hasValidCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
    && !(latitude === 0 && longitude === 0)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;

  if (profile.location_mode === 'city_only' || visibility === 'city_only') {
    const city = resolveCityLocation(profile.work_city || profile.city);
    return city ? {
      latitude: city.latitude,
      longitude: city.longitude,
      location_approximate: true,
      location_precision: 'city'
    } : null;
  }

  if (!hasValidCoordinates || (visibility !== 'exact' && visibility !== 'postal_area')) return null;
  return {
    latitude,
    longitude,
    location_approximate: visibility !== 'exact',
    location_precision: visibility === 'exact' ? 'exact' : 'postal_area'
  };
}

export function normalizeEffectiveLocationVisibility(locationMode: unknown, locationVisibility: unknown) {
  if (locationVisibility === 'hidden' || locationMode === 'exact_hidden' || locationMode === 'hidden') return 'hidden';
  if (locationMode === 'city_only') return 'city_only';
  const mode = String(locationVisibility || locationMode || 'postal_area');
  if (['exact', 'postal_area', 'city_only', 'hidden'].includes(mode)) return mode;
  if (mode === 'exact_hidden') return 'hidden';
  if (mode === 'approximate') return 'postal_area';
  return 'postal_area';
}
