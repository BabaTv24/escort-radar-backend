import { normalizeCity, resolveCityLocation } from './locations.js';

export type EffectivePublicLocation = {
  latitude: number;
  longitude: number;
  location_approximate: boolean;
  location_precision: 'exact' | 'postal_area' | 'city';
};

export function resolveEffectivePublicLocation(profile: Record<string, any>, cityOnlyLayoutIndex?: number): EffectivePublicLocation | null {
  const visibility = normalizeEffectiveLocationVisibility(profile.location_mode, profile.location_visibility);
  if (visibility === 'hidden') return null;

  const latitude = Number(profile.latitude);
  const longitude = Number(profile.longitude);
  const hasValidCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
    && !(latitude === 0 && longitude === 0)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;

  if (profile.location_mode === 'city_only' || visibility === 'city_only') {
    const city = resolveCityLocation(profile.work_city || profile.city);
    const point = city && Number.isInteger(cityOnlyLayoutIndex)
      ? disperseCityOnlyLocation(city.latitude, city.longitude, cityOnlyLayoutIndex as number)
      : city;
    return city ? {
      latitude: point!.latitude,
      longitude: point!.longitude,
      location_approximate: true,
      location_precision: 'city'
    } : null;
  }

  if (visibility === 'postal_area' && !hasValidCoordinates && hasPostalArea(profile)) {
    const city = resolveCityLocation(profile.work_city || profile.city);
    return city ? {
      latitude: city.latitude,
      longitude: city.longitude,
      location_approximate: true,
      location_precision: 'postal_area'
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

function hasPostalArea(profile: Record<string, any>) {
  return Boolean(String(profile.postal_code || profile.postalCode || profile.zip || '').trim());
}

export function buildCityOnlyLayoutIndexes(profiles: Record<string, any>[]) {
  const groups = new Map<string, Record<string, any>[]>();
  for (const profile of profiles) {
    const visibility = normalizeEffectiveLocationVisibility(profile.location_mode, profile.location_visibility);
    if (visibility !== 'city_only') continue;
    const cityKey = normalizeCity(profile.work_city || profile.city);
    if (!cityKey || !resolveCityLocation(cityKey)) continue;
    const group = groups.get(cityKey) || [];
    group.push(profile);
    groups.set(cityKey, group);
  }

  const indexes = new Map<string, number>();
  for (const group of groups.values()) {
    group
      .sort((left, right) => String(left.id || '').localeCompare(String(right.id || '')))
      .forEach((profile, index) => indexes.set(String(profile.id), index));
  }
  return indexes;
}

export function disperseCityOnlyLocation(latitude: number, longitude: number, index: number) {
  let ring = 1;
  let slot = Math.max(0, Math.floor(index));
  while (slot >= ring * 6) {
    slot -= ring * 6;
    ring += 1;
  }

  const radiusMeters = ring * 100;
  const angle = 2 * Math.PI * slot / (ring * 6);
  const northMeters = Math.cos(angle) * radiusMeters;
  const eastMeters = Math.sin(angle) * radiusMeters;
  const earthRadiusMeters = 6_371_000;
  return {
    latitude: latitude + northMeters / earthRadiusMeters * 180 / Math.PI,
    longitude: longitude + eastMeters / (earthRadiusMeters * Math.cos(latitude * Math.PI / 180)) * 180 / Math.PI
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
