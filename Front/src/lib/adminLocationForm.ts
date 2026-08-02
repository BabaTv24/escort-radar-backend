import type { LocationGeocodeResult } from './api';
import type { Profile } from '../types';
import { berlinDistrictOptions, resolveManualSearcherLocation } from './geo';
import { citySlug, getCityLabel, normalizeCountry, resolveProfileCountry } from './globalLocations';

export type AdminMapPoint = { latitude: number; longitude: number };

type AdminLocationForm = Record<string, unknown> & {
  latitude?: string | number | null;
  longitude?: string | number | null;
  work_country?: string;
  work_city?: string;
  city?: string;
  work_area?: string;
  area?: string;
  postal_code?: string;
  exact_address?: string;
  work_place_label?: string;
  location_mode?: string;
  location_visibility?: string;
  location_precision?: Profile['location_precision'];
  location_input_source?: string;
};

export function mergeAdminReverseGeocode(
  current: AdminLocationForm,
  point: AdminMapPoint,
  location: LocationGeocodeResult,
  citySlug: (city: string) => string
) {
  return {
    ...current,
    // Coordinates always come from the selected point, never from the geocoder response.
    latitude: String(point.latitude),
    longitude: String(point.longitude),
    work_country: location.work_country || current.work_country || '',
    work_city: location.work_city || current.work_city || '',
    city: location.work_city ? citySlug(location.work_city) : current.city || '',
    work_area: location.work_area || current.work_area || '',
    area: location.work_area || current.area || '',
    postal_code: location.postal_code || current.postal_code || '',
    exact_address: location.exact_address || location.work_place_label || current.exact_address || '',
    work_place_label: location.work_place_label || location.exact_address || current.work_place_label || '',
    // Existing DB constraint stores exact visibility on the legacy approximate mode.
    location_mode: 'approximate',
    location_visibility: 'exact',
    location_precision: location.precision === 'city' ? 'city' : location.precision === 'postal_area' ? 'postal_area' : 'exact',
    location_input_source: 'manual'
  };
}

export function adminLocationSavePayload(form: AdminLocationForm) {
  return {
    latitude: form.latitude === '' || form.latitude == null ? null : Number(form.latitude),
    longitude: form.longitude === '' || form.longitude == null ? null : Number(form.longitude),
    work_country: form.work_country || '',
    work_city: String(form.work_city || '').trim(),
    work_area: form.work_area || '',
    area: form.area || '',
    postal_code: form.postal_code || '',
    exact_address: form.exact_address || '',
    work_place_label: form.work_place_label || '',
    location_mode: form.location_mode,
    location_visibility: form.location_visibility,
    location_precision: form.location_precision,
    location_input_source: form.location_input_source
  };
}

export function adminLocationFormFromProfile(profile: Profile) {
  const rawCity = String(profile.work_city || profile.city || '').trim();
  const workCity = getCityLabel(rawCity);
  const workCountry = resolveProfileCountry(profile.work_country, workCity);
  const storedCountry = normalizeCountry(profile.work_country);
  const cityPoint = resolveManualSearcherLocation(workCity);
  const savedLatitude = formCoordinate(profile.latitude, -90, 90);
  const savedLongitude = formCoordinate(profile.longitude, -180, 180);
  const hasSavedPoint = savedLatitude !== null && savedLongitude !== null;
  const legacyBerlinFallback = Boolean(
    hasSavedPoint
    && cityPoint
    && storedCountry === 'DE'
    && workCountry !== 'DE'
    && Math.abs(savedLatitude - 52.52) <= 0.02
    && Math.abs(savedLongitude - 13.405) <= 0.03
  );
  const latitude = !hasSavedPoint || legacyBerlinFallback ? cityPoint?.lat ?? null : savedLatitude;
  const longitude = !hasSavedPoint || legacyBerlinFallback ? cityPoint?.lng ?? null : savedLongitude;
  const workArea = legacyBerlinFallback && isBerlinDistrict(profile.work_area || profile.area) ? '' : profile.work_area || profile.area || '';
  const postalCode = legacyBerlinFallback && /^1[0-4]\d{3}$/.test(String(profile.postal_code || '').trim()) ? '' : profile.postal_code || '';
  const exactAddress = legacyBerlinFallback && /\bberlin\b/i.test(String(profile.exact_address || '')) ? '' : profile.exact_address || '';
  const placeLabel = legacyBerlinFallback && /\bberlin\b/i.test(String(profile.work_place_label || '')) ? '' : profile.work_place_label || '';
  return {
    work_country: workCountry,
    work_city: workCity,
    city: workCity ? citySlug(workCity) : '',
    work_area: workArea,
    area: workArea,
    postal_code: postalCode,
    work_place_label: placeLabel,
    exact_address: exactAddress,
    latitude: latitude === null ? '' : String(latitude),
    longitude: longitude === null ? '' : String(longitude),
    location_mode: profile.location_mode || 'city_only',
    location_visibility: profile.location_visibility,
    location_input_source: profile.location_input_source || 'automatic',
    location_precision: profile.location_precision || null
  };
}

export function isCurrentAdminProfileRequest(requestId: number, currentRequestId: number, requestedProfileId: string, selectedProfileId: string) {
  return requestId === currentRequestId && requestedProfileId === selectedProfileId;
}

function formCoordinate(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === '') return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max ? coordinate : null;
}

function isBerlinDistrict(value: unknown) {
  const normalized = String(value || '').trim().toLocaleLowerCase('de-DE');
  return berlinDistrictOptions.some((district) => district.toLocaleLowerCase('de-DE') === normalized);
}
