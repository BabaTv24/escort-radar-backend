import { globalCountries, normalizeCountry, resolveCityLocation } from './locations.js';
import { normalizeEffectiveLocationVisibility } from './publicLocation.js';

export type AdminLocationResolution = {
  latitude: number;
  longitude: number;
  work_country?: string;
  work_city?: string;
  work_area?: string;
  postal_code?: string;
  street?: string;
  house_number?: string;
  exact_address?: string;
  work_place_label?: string;
  geocoded: boolean;
  precision: 'exact' | 'street' | 'postal_area' | 'city';
};

export class AdminLocationGeocodingError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AdminLocationGeocodingError';
  }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type NominatimOptions = {
  fetchImpl?: FetchLike;
  userAgent?: string;
  rateLimitMs?: number;
  cacheTtlMs?: number;
};

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  type?: string;
  addresstype?: string;
  address?: {
    country_code?: string;
    house_number?: string;
    road?: string;
    pedestrian?: string;
    residential?: string;
    footway?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    borough?: string;
    city_district?: string;
    suburb?: string;
    quarter?: string;
    neighbourhood?: string;
    postcode?: string;
    country?: string;
  };
};

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const DEFAULT_USER_AGENT = 'Escort Radar/1.0 (+https://escort-radar.fun; contact: support@escort-radar.fun)';
const DEFAULT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;
const addressFields = [
  'work_country',
  'work_city',
  'work_area',
  'postal_code',
  'work_place_label',
  'exact_address',
  'city',
  'area'
] as const;

const geocodeCache = new Map<string, { expiresAt: number; result: AdminLocationResolution }>();
const geocodeInFlight = new Map<string, Promise<AdminLocationResolution>>();
let nominatimQueue: Promise<void> = Promise.resolve();
let lastNominatimRequestAt = 0;

export function adminLocationChanged(previous: Record<string, unknown> | null, next: Record<string, unknown>) {
  if (!previous) return true;
  const fields = [...addressFields, 'location_mode', 'location_visibility', 'latitude', 'longitude'] as const;
  return fields.some((field) => normalizeComparableLocationValue(previous[field]) !== normalizeComparableLocationValue(next[field]));
}

export function adminAddressOrPrivacyChanged(previous: Record<string, unknown> | null, next: Record<string, unknown>) {
  if (!previous) return true;
  const fields = [...addressFields, 'location_mode', 'location_visibility'] as const;
  return fields.some((field) => normalizeComparableLocationValue(previous[field]) !== normalizeComparableLocationValue(next[field]));
}

export async function resolveAdminLocation(
  profile: Record<string, any>,
  options: NominatimOptions = {}
): Promise<AdminLocationResolution> {
  const visibility = normalizeEffectiveLocationVisibility(profile.location_mode, profile.location_visibility);
  const countryCode = normalizeCountry(profile.work_country || profile.country);
  if (!countryCode) {
    throw new AdminLocationGeocodingError('Choose a supported country before saving the location.', 'unsupported_country');
  }

  if (visibility === 'city_only') return cityFallback(profile, countryCode);

  const exactStreet = text(profile.exact_address || profile.work_place_label);
  if (visibility === 'hidden' && !exactStreet) return cityFallback(profile, countryCode);
  if (visibility === 'exact' && profile.location_input_source === 'manual') {
    return validateManualAdminLocation(profile);
  }
  if ((visibility === 'exact' || visibility === 'hidden') && !exactStreet) {
    throw new AdminLocationGeocodingError('Enter a street/address or choose an exact point on the map.', 'exact_address_required');
  }
  if (!text(profile.work_city)) {
    throw new AdminLocationGeocodingError('Enter a city before saving the location.', 'city_required');
  }

  const structuredQuery = {
    street: visibility === 'exact' || visibility === 'hidden' ? streetComponent(exactStreet) : '',
    city: text(profile.work_city),
    postalcode: text(profile.postal_code),
    country: countryName(countryCode),
    countrycodes: countryCode.toLowerCase()
  };
  const cacheKey = normalizedAddressKey(visibility, structuredQuery);
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.result };
  if (cached) geocodeCache.delete(cacheKey);

  const existing = geocodeInFlight.get(cacheKey);
  if (existing) return existing.then((result) => ({ ...result }));

  const pending = enqueueNominatimRequest(
    () => requestNominatim(structuredQuery, countryCode, visibility, options),
    options.rateLimitMs ?? 1000
  ).then((result) => {
    cacheResult(cacheKey, result, options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
    return result;
  }).finally(() => {
    geocodeInFlight.delete(cacheKey);
  });
  geocodeInFlight.set(cacheKey, pending);
  return pending.then((result) => ({ ...result }));
}

export async function reverseGeocodeAdminLocation(
  latitudeValue: unknown,
  longitudeValue: unknown,
  options: NominatimOptions = {}
): Promise<AdminLocationResolution> {
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!validCoordinates(latitude, longitude)) {
    throw new AdminLocationGeocodingError('Enter valid non-zero latitude and longitude values.', 'invalid_manual_coordinates');
  }

  const cacheKey = `reverse|${latitude.toFixed(6)}|${longitude.toFixed(6)}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.result };
  if (cached) geocodeCache.delete(cacheKey);
  const existing = geocodeInFlight.get(cacheKey);
  if (existing) return existing.then((result) => ({ ...result }));

  const pending = enqueueNominatimRequest(async () => {
    const url = new URL(NOMINATIM_REVERSE_URL);
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    const result = await fetchNominatimJson(url, options);
    if (!result || Array.isArray(result)) {
      throw new AdminLocationGeocodingError('No matching OpenStreetMap address was found for this point.', 'reverse_address_not_found');
    }
    const normalized = normalizeNominatimAddress(result as NominatimResult, latitude, longitude, true);
    if (!normalized.work_country || !normalized.work_city) {
      throw new AdminLocationGeocodingError('OpenStreetMap did not return a complete country and city for this point.', 'incomplete_reverse_address');
    }
    return normalized;
  }, options.rateLimitMs ?? 1000).then((result) => {
    cacheResult(cacheKey, result, options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
    return result;
  }).finally(() => geocodeInFlight.delete(cacheKey));
  geocodeInFlight.set(cacheKey, pending);
  return pending.then((result) => ({ ...result }));
}

export function validateManualAdminLocation(profile: Record<string, any>): AdminLocationResolution {
  const latitude = Number(profile.latitude);
  const longitude = Number(profile.longitude);
  if (!validCoordinates(latitude, longitude)) {
    throw new AdminLocationGeocodingError('Enter valid non-zero latitude and longitude values.', 'invalid_manual_coordinates');
  }
  return { latitude, longitude, geocoded: false, precision: 'exact' };
}

export function resetAdminLocationGeocodingStateForTests() {
  geocodeCache.clear();
  geocodeInFlight.clear();
  nominatimQueue = Promise.resolve();
  lastNominatimRequestAt = 0;
}

async function requestNominatim(
  query: { street: string; city: string; postalcode: string; country: string; countrycodes: string },
  expectedCountry: string,
  visibility: string,
  options: NominatimOptions
) {
  const url = new URL(NOMINATIM_SEARCH_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');

  const payload = await fetchNominatimJson(url, options);
  const results = Array.isArray(payload) ? payload as NominatimResult[] : [];
  if (!results.length) {
    throw new AdminLocationGeocodingError('No matching OpenStreetMap location was found. Check the country, postal code, city and street.', 'address_not_found');
  }

  const countryMatches = results.filter((result) => normalizeCountry(result.address?.country_code) === expectedCountry);
  if (!countryMatches.length) {
    throw new AdminLocationGeocodingError('The geocoder returned locations in a different country.', 'geocoder_country_mismatch');
  }

  const requestedHouseNumber = extractHouseNumber(query.street);
  const selected = selectBestNominatimResult(countryMatches, query);
  if (!selected) {
    throw new AdminLocationGeocodingError('The OpenStreetMap geocoder returned invalid coordinates.', 'invalid_geocoder_coordinates');
  }

  const latitude = Number(selected.lat);
  const longitude = Number(selected.lon);
  if (!validCoordinates(latitude, longitude)) {
    throw new AdminLocationGeocodingError('The OpenStreetMap geocoder returned invalid coordinates.', 'invalid_geocoder_coordinates');
  }

  const exactRequested = visibility === 'exact' || visibility === 'hidden';
  const exactHouse = Boolean(requestedHouseNumber && normalizeHouseNumber(selected.address?.house_number) === normalizeHouseNumber(requestedHouseNumber));
  const precision: AdminLocationResolution['precision'] = exactRequested
    ? exactHouse ? 'exact' : 'street'
    : 'postal_area';
  return { ...normalizeNominatimAddress(selected, latitude, longitude), precision };
}

async function fetchNominatimJson(url: URL, options: NominatimOptions) {
  let response: Response;
  try {
    response = await (options.fetchImpl || fetch)(url, {
      headers: { Accept: 'application/json', 'User-Agent': options.userAgent || DEFAULT_USER_AGENT },
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw new AdminLocationGeocodingError('The OpenStreetMap geocoder could not be reached. The profile was not changed.', 'geocoder_unavailable');
  }
  if (!response.ok) throw new AdminLocationGeocodingError('The OpenStreetMap geocoder rejected the request. The profile was not changed.', 'geocoder_http_error');
  try {
    return await response.json() as unknown;
  } catch {
    throw new AdminLocationGeocodingError('The OpenStreetMap geocoder returned an invalid response. The profile was not changed.', 'invalid_geocoder_response');
  }
}

function normalizeNominatimAddress(result: NominatimResult, latitude: number, longitude: number, preservePoint = false): AdminLocationResolution {
  const address = result.address || {};
  const workCountry = normalizeCountry(address.country_code);
  const city = text(address.city || address.town || address.village || address.municipality);
  const area = text(address.borough || address.city_district || address.suburb || address.quarter || address.neighbourhood);
  const street = text(address.road || address.pedestrian || address.residential || address.footway);
  const houseNumber = text(address.house_number);
  const postalCode = text(address.postcode);
  const streetLine = [street, houseNumber].filter(Boolean).join(' ');
  const exactAddress = [streetLine, postalCode, city, address.country].filter(Boolean).join(', ');
  return {
    latitude,
    longitude,
    ...(workCountry ? { work_country: workCountry } : {}),
    ...(city ? { work_city: city } : {}),
    ...(area ? { work_area: area } : {}),
    ...(postalCode ? { postal_code: postalCode } : {}),
    ...(street ? { street } : {}),
    ...(houseNumber ? { house_number: houseNumber } : {}),
    ...(exactAddress ? { exact_address: exactAddress } : {}),
    work_place_label: text(result.display_name) || exactAddress,
    geocoded: !preservePoint,
    precision: houseNumber ? 'exact' : street ? 'street' : postalCode ? 'postal_area' : 'city'
  };
}

function scoreNominatimResult(result: NominatimResult, query: Record<string, string>) {
  const address = result.address || {};
  const requestedStreet = normalizeComparableLocationValue(query.street.replace(extractHouseNumber(query.street), ''));
  const resultStreet = normalizeComparableLocationValue(address.road || address.pedestrian || address.residential || address.footway);
  const requestedCity = normalizeComparableLocationValue(query.city);
  const resultCity = normalizeComparableLocationValue(address.city || address.town || address.village || address.municipality);
  let score = 0;
  if (requestedStreet && resultStreet && (resultStreet.includes(requestedStreet) || requestedStreet.includes(resultStreet))) score += 8;
  if (requestedCity && resultCity === requestedCity) score += 5;
  if (query.postalcode && text(address.postcode) === text(query.postalcode)) score += 4;
  if (extractHouseNumber(query.street) && normalizeHouseNumber(address.house_number) === normalizeHouseNumber(extractHouseNumber(query.street))) score += 10;
  return score;
}

function selectBestNominatimResult(results: NominatimResult[], query: Record<string, string>) {
  let candidates = results.filter(hasValidNominatimCoordinates);
  const requestedCity = normalizeComparableLocationValue(query.city);
  const matchingCity = candidates.filter((result) => normalizeComparableLocationValue(
    result.address?.city || result.address?.town || result.address?.village || result.address?.municipality
  ) === requestedCity);
  if (matchingCity.length) candidates = matchingCity;
  if (query.postalcode) {
    const matchingPostal = candidates.filter((result) => text(result.address?.postcode) === text(query.postalcode));
    if (matchingPostal.length) candidates = matchingPostal;
  }
  return [...candidates].sort((left, right) => scoreNominatimResult(right, query) - scoreNominatimResult(left, query))[0];
}

function enqueueNominatimRequest<T>(task: () => Promise<T>, rateLimitMs: number): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const waitMs = Math.max(0, Math.max(0, rateLimitMs) - (Date.now() - lastNominatimRequestAt));
    if (waitMs) await delay(waitMs);
    lastNominatimRequestAt = Date.now();
    return task();
  });
  nominatimQueue = run.then(() => undefined, () => undefined);
  return run;
}

function cacheResult(key: string, result: AdminLocationResolution, ttlMs: number) {
  if (geocodeCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = geocodeCache.keys().next().value;
    if (oldest) geocodeCache.delete(oldest);
  }
  geocodeCache.set(key, { expiresAt: Date.now() + Math.max(0, ttlMs), result: { ...result } });
}

function cityFallback(profile: Record<string, any>, countryCode: string): AdminLocationResolution {
  const city = resolveCityLocation(profile.work_city || profile.city);
  if (!city || city.country_code !== countryCode) {
    throw new AdminLocationGeocodingError('The selected city does not match the selected country.', 'city_country_mismatch');
  }
  return { latitude: city.latitude, longitude: city.longitude, geocoded: false, precision: 'city' };
}

function normalizedAddressKey(visibility: string, query: Record<string, string>) {
  return [visibility, ...Object.entries(query).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${normalizeComparableLocationValue(value)}`)].join('|');
}

function countryName(code: string) {
  return globalCountries.find((country) => country.code === code)?.labels[0] || code;
}

function extractHouseNumber(street: string) {
  return street.match(/(?:^|\s)(\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?)(?:\s|,|$)/)?.[1] || '';
}

function streetComponent(value: string) {
  return text(value.split(',')[0]);
}

function normalizeHouseNumber(value: unknown) {
  return text(value).toLowerCase().replace(/\s+/g, '');
}

function hasValidNominatimCoordinates(result: NominatimResult) {
  return validCoordinates(Number(result.lat), Number(result.lon));
}

function validCoordinates(latitude: number, longitude: number) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && !(latitude === 0 && longitude === 0)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

function structuredLabel(query: Record<string, string>) {
  return [query.street, query.postalcode, query.city, query.country].filter(Boolean).join(', ');
}

function normalizeComparableLocationValue(value: unknown) {
  return text(value).toLocaleLowerCase('en-US');
}

function text(value: unknown) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
