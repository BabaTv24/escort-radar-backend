import type { LocationGeocodeResult } from './api';
import type { Profile } from '../types';

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
    work_area: location.work_area || '',
    area: location.work_area || '',
    postal_code: location.postal_code || '',
    exact_address: location.exact_address || location.work_place_label || '',
    work_place_label: location.work_place_label || location.exact_address || '',
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
  return {
    work_country: profile.work_country || 'DE',
    work_city: profile.work_city || profile.city || '',
    work_area: profile.work_area || profile.area || '',
    postal_code: profile.postal_code || '',
    work_place_label: profile.work_place_label || '',
    exact_address: profile.exact_address || '',
    latitude: profile.latitude === null || profile.latitude === undefined ? '' : String(profile.latitude),
    longitude: profile.longitude === null || profile.longitude === undefined ? '' : String(profile.longitude),
    location_mode: profile.location_mode || 'city_only',
    location_visibility: profile.location_visibility,
    location_input_source: profile.location_input_source || 'automatic',
    location_precision: profile.location_precision || null
  };
}
