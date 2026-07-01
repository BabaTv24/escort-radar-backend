import type { Profile } from '../types';

export type GeoPoint = {
  lat: number;
  lng: number;
  source: 'browser' | 'manual' | 'city' | 'city_fallback';
  label?: string;
};

const cityCenters: Record<string, { lat: number; lng: number }> = {
  berlin: { lat: 52.52, lng: 13.405 },
  hamburg: { lat: 53.5511, lng: 9.9937 },
  hannover: { lat: 52.3759, lng: 9.732 },
  koeln: { lat: 50.9375, lng: 6.9603 },
  muenchen: { lat: 48.1351, lng: 11.582 },
  warszawa: { lat: 52.2297, lng: 21.0122 }
};

const manualLocationCenters: Record<string, { lat: number; lng: number; label: string }> = {
  berlin: { lat: 52.52, lng: 13.405, label: 'Berlin' },
  mitte: { lat: 52.52, lng: 13.405, label: 'Berlin Mitte' },
  neukolln: { lat: 52.481, lng: 13.435, label: 'Neukoelln' },
  neukölln: { lat: 52.481, lng: 13.435, label: 'Neukoelln' },
  kurfurstenstrasse: { lat: 52.5026, lng: 13.3595, label: 'Kurfuerstenstrasse' },
  kurfürstenstraße: { lat: 52.5026, lng: 13.3595, label: 'Kurfuerstenstrasse' },
  kurfürstenstrasse: { lat: 52.5026, lng: 13.3595, label: 'Kurfuerstenstrasse' },
  '10115': { lat: 52.5321, lng: 13.3849, label: '10115 Berlin' },
  '10117': { lat: 52.5155, lng: 13.3899, label: '10117 Berlin' },
  '10119': { lat: 52.5291, lng: 13.4109, label: '10119 Berlin' },
  '10243': { lat: 52.5124, lng: 13.4407, label: '10243 Berlin' },
  '10999': { lat: 52.4995, lng: 13.4314, label: '10999 Berlin' },
  '12043': { lat: 52.4808, lng: 13.4384, label: '12043 Berlin' },
  '12045': { lat: 52.4859, lng: 13.4294, label: '12045 Berlin' },
  '12047': { lat: 52.4898, lng: 13.4235, label: '12047 Berlin' },
  '12049': { lat: 52.4776, lng: 13.4196, label: '12049 Berlin' },
  '10785': { lat: 52.5068, lng: 13.3671, label: '10785 Berlin' },
  '10787': { lat: 52.5038, lng: 13.3438, label: '10787 Berlin' }
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
    return Promise.resolve({ ...fallback, source: 'city', label: getCityLabel(city) });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        source: 'browser',
        label: 'GPS'
      }),
      () => resolve({ ...fallback, source: 'city', label: getCityLabel(city) }),
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 }
    );
  });
}

export function resolveManualSearcherLocation(input: string): GeoPoint | null {
  const normalized = normalizeLocationQuery(input);
  if (!normalized) return null;
  const direct = manualLocationCenters[normalized];
  if (direct) return { ...direct, source: 'manual' };

  const postalMatch = normalized.match(/\b\d{5}\b/);
  if (postalMatch && manualLocationCenters[postalMatch[0]]) {
    const location = manualLocationCenters[postalMatch[0]];
    return { ...location, source: 'manual' };
  }

  const matchedKey = Object.keys(manualLocationCenters).find((key) => normalized.includes(key));
  if (!matchedKey) return null;
  const location = manualLocationCenters[matchedKey];
  return { ...location, source: 'manual' };
}

function toRad(value: number) {
  return value * Math.PI / 180;
}

function normalizeLocationQuery(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9äöü]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getCityLabel(city: string) {
  return city.slice(0, 1).toUpperCase() + city.slice(1);
}
