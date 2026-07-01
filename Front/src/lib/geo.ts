import type { Profile } from '../types';

export type GeoPoint = {
  lat: number;
  lng: number;
  source: 'browser' | 'manual' | 'city' | 'city_fallback';
  label?: string;
};

export type ProfileRadarLocation = {
  lat: number;
  lng: number;
  label: string;
  precision: 'exact' | 'postal_area' | 'area' | 'approximate';
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
  kreuzberg: { lat: 52.5009, lng: 13.4194, label: 'Berlin Kreuzberg' },
  neukolln: { lat: 52.481, lng: 13.435, label: 'Berlin Neukoelln' },
  neukoelln: { lat: 52.481, lng: 13.435, label: 'Berlin Neukoelln' },
  kurfurstenstrasse: { lat: 52.5026, lng: 13.3595, label: 'Kurfuerstenstrasse' },
  kurfuerstenstrasse: { lat: 52.5026, lng: 13.3595, label: 'Kurfuerstenstrasse' },
  '10115': { lat: 52.5321, lng: 13.3849, label: '10115 Berlin' },
  '10117': { lat: 52.5155, lng: 13.3899, label: '10117 Berlin' },
  '10119': { lat: 52.5291, lng: 13.4109, label: '10119 Berlin' },
  '10243': { lat: 52.5124, lng: 13.4407, label: '10243 Berlin' },
  '10997': { lat: 52.499, lng: 13.437, label: '10997 Berlin Kreuzberg' },
  '10999': { lat: 52.4995, lng: 13.4314, label: '10999 Berlin' },
  '12043': { lat: 52.4808, lng: 13.4384, label: '12043 Berlin' },
  '12045': { lat: 52.4859, lng: 13.4294, label: '12045 Berlin' },
  '12047': { lat: 52.4898, lng: 13.4235, label: '12047 Berlin' },
  '12049': { lat: 52.4776, lng: 13.4196, label: '12049 Berlin' },
  '12353': { lat: 52.424, lng: 13.462, label: '12353 Berlin Buckow / Rudow' },
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
  return cityCenters[normalizeLocationQuery(city)] || cityCenters.berlin;
}

export function getProfileCoordinates(profile: Profile) {
  const raw = profile as Profile & Record<string, unknown>;
  const lat = toCoordinate(raw.latitude ?? raw.lat);
  const lng = toCoordinate(raw.longitude ?? raw.lng);
  if (isValidCoordinate(lat, lng)) return { lat, lng };
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
  const location = resolveKnownLocation(input);
  return location ? { ...location, source: 'manual' } : null;
}

export function resolveProfileRadarLocation(profile: Profile): ProfileRadarLocation | null {
  if (profile.location_mode === 'exact_hidden' || profile.location_mode === 'hidden') return null;

  const raw = profile as Profile & Record<string, unknown>;
  const lat = toCoordinate(raw.latitude ?? raw.lat);
  const lng = toCoordinate(raw.longitude ?? raw.lng);
  if (isValidCoordinate(lat, lng)) {
    return {
      lat,
      lng,
      label: textValue(raw.work_place_label ?? raw.exact_address ?? raw.postal_code ?? raw.postalCode ?? raw.zip ?? raw.work_area ?? raw.area ?? raw.district ?? raw.work_city ?? raw.location_city ?? raw.city),
      precision: profile.work_place_label || profile.exact_address ? 'exact' : 'approximate'
    };
  }

  const city = textValue(raw.work_city ?? raw.city ?? raw.location_city);
  const postalCode = textValue(raw.postal_code ?? raw.postalCode ?? raw.zip);
  if (postalCode) {
    const postal = resolveKnownLocation(`${postalCode} ${city}`);
    if (postal) return { lat: postal.lat, lng: postal.lng, label: postal.label, precision: 'postal_area' };
  }

  const area = textValue(raw.work_area ?? raw.area ?? raw.district ?? raw.approximate_location_area);
  if (area) {
    const areaLocation = resolveKnownLocation(`${area} ${city}`);
    if (areaLocation) return { lat: areaLocation.lat, lng: areaLocation.lng, label: areaLocation.label, precision: 'area' };
  }

  return null;
}

export function isValidCoordinate(lat: unknown, lng: unknown) {
  return typeof lat === 'number'
    && typeof lng === 'number'
    && Number.isFinite(lat)
    && Number.isFinite(lng)
    && Math.abs(lat) <= 90
    && Math.abs(lng) <= 180;
}

function resolveKnownLocation(input: string) {
  const normalized = normalizeLocationQuery(input);
  if (!normalized) return null;
  const direct = manualLocationCenters[normalized];
  if (direct) return direct;

  const postalMatch = normalized.match(/\b\d{5}\b/);
  if (postalMatch && manualLocationCenters[postalMatch[0]]) return manualLocationCenters[postalMatch[0]];

  const matchedKey = Object.keys(manualLocationCenters).find((key) => normalized.includes(key));
  return matchedKey ? manualLocationCenters[matchedKey] : null;
}

function toRad(value: number) {
  return value * Math.PI / 180;
}

function toCoordinate(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function normalizeLocationQuery(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00df/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getCityLabel(city: string) {
  return city.slice(0, 1).toUpperCase() + city.slice(1);
}
