import type { Profile } from '../types';

export type GeoPoint = {
  lat: number;
  lng: number;
  source: 'browser' | 'city_fallback';
};

const cityCenters: Record<string, { lat: number; lng: number }> = {
  berlin: { lat: 52.52, lng: 13.405 },
  hamburg: { lat: 53.5511, lng: 9.9937 },
  hannover: { lat: 52.3759, lng: 9.732 },
  koeln: { lat: 50.9375, lng: 6.9603 },
  muenchen: { lat: 48.1351, lng: 11.582 },
  warszawa: { lat: 52.2297, lng: 21.0122 }
};

export function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getCityCenter(city: string) {
  return cityCenters[city] || cityCenters.berlin;
}

export function getProfileCoordinates(profile: Profile) {
  if (typeof profile.latitude === 'number' && typeof profile.longitude === 'number') {
    return { lat: profile.latitude, lng: profile.longitude };
  }
  return getCityCenter(profile.city);
}

export function isProfileInRadarRange(profile: Profile, searcherLocation: GeoPoint, selectedRadius = 25) {
  const coordinates = getProfileCoordinates(profile);
  const distance = getDistanceKm(searcherLocation.lat, searcherLocation.lng, coordinates.lat, coordinates.lng);
  const serviceRadius = profile.service_radius_km || 25;

  return {
    inRange: distance <= selectedRadius && distance <= serviceRadius,
    distance_km: Math.round(distance * 10) / 10
  };
}

export function getSearcherLocationWithFallback(city: string): Promise<GeoPoint> {
  const fallback = getCityCenter(city);

  if (!navigator.geolocation) {
    return Promise.resolve({ ...fallback, source: 'city_fallback' });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        source: 'browser'
      }),
      () => resolve({ ...fallback, source: 'city_fallback' }),
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 }
    );
  });
}

function toRad(value: number) {
  return value * Math.PI / 180;
}
