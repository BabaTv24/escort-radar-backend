import type { Profile, ProfileImage } from '../types';
import { normalizeProfileEthnicity, normalizeProfileGender, normalizeProfileOrientation, normalizeProfileTravels } from './profileDetails';
import { normalizeProfileCategory } from './geo';

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | boolean> }).env || {};
const API_URL = String(viteEnv.VITE_API_URL || 'http://localhost:4000');
const PUBLIC_PROFILES_PATH = '/api/profiles';
const PUBLIC_PROFILES_TIMEOUT_MS = 15_000;

type ApiProfile = Record<string, unknown>;

export type PublicProfilesMetrics = {
  fetched_candidates: number;
  eligible_candidates: number;
  located_candidates: number;
  unlocated_candidates: number;
  pages_fetched: number;
  truncated: boolean;
  warning?: string;
  candidates_before_filters: number;
  candidates_public: number;
  missing_location: number;
  rejected_by_reason: Record<string, number>;
  duration_ms: number;
  response_bytes: number;
};

type PublicProfilesRequestOptions = {
  signal?: AbortSignal;
  cacheTtlMs?: number;
  onMetrics?: (metrics: PublicProfilesMetrics | null) => void;
};

const publicProfilesInFlight = new Map<string, { promise: Promise<Profile[]> }>();
const publicProfilesCache = new Map<string, { expiresAt: number; profiles: Profile[] }>();
const publicProfilesMetrics = new Map<string, PublicProfilesMetrics>();

export async function getPublicProfiles(params: URLSearchParams | string = '', options: PublicProfilesRequestOptions = {}): Promise<Profile[]> {
  const query = typeof params === 'string'
    ? params
    : params.toString() ? `?${params.toString()}` : '';
  const url = `${API_URL}${PUBLIC_PROFILES_PATH}${query}`;
  if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
  const cacheTtlMs = options.cacheTtlMs ?? (new URL(url).searchParams.get('radar') === '1' ? 30_000 : 0);
  const cached = publicProfilesCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    options.onMetrics?.(publicProfilesMetrics.get(url) || null);
    return cached.profiles;
  }

  const existing = publicProfilesInFlight.get(url);
  if (existing) {
    return abortable(existing.promise, options.signal).then((profiles) => {
      options.onMetrics?.(publicProfilesMetrics.get(url) || null);
      return profiles;
    });
  }

  const controller = new AbortController();
  const startedAt = performance.now();
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException(`Public profiles request timed out after ${PUBLIC_PROFILES_TIMEOUT_MS}ms`, 'TimeoutError'));
  }, PUBLIC_PROFILES_TIMEOUT_MS);
  const pending = fetchPublicProfiles(url, controller.signal)
    .then((profiles) => {
      if (cacheTtlMs > 0) publicProfilesCache.set(url, { expiresAt: Date.now() + cacheTtlMs, profiles });
      options.onMetrics?.(publicProfilesMetrics.get(url) || null);
      if (viteEnv.DEV) {
        const metrics = publicProfilesMetrics.get(url);
        console.info('[public-profiles:metrics]', {
          url,
          client_duration_ms: Math.round(performance.now() - startedAt),
          server_duration_ms: metrics?.duration_ms ?? null,
          response_bytes: metrics?.response_bytes ?? null,
          profiles: profiles.length
        });
      }
      return profiles;
    })
    .finally(() => {
      clearTimeout(timeoutId);
      if (publicProfilesInFlight.get(url)?.promise === pending) publicProfilesInFlight.delete(url);
    });
  publicProfilesInFlight.set(url, { promise: pending });
  return abortable(pending, options.signal);
}

async function fetchPublicProfiles(url: string, signal: AbortSignal): Promise<Profile[]> {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal
  });

  if (viteEnv.DEV) {
    console.info('[public-profiles]', { url, status: response.status });
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(String(payload.error || 'Request failed'));
  }

  const payload = await response.json() as { profiles?: unknown[]; radar_meta?: PublicProfilesMetrics };
  const radarRequest = new URL(url).searchParams.get('radar') === '1';
  if (radarRequest && !payload.radar_meta) {
    throw new Error('Radar API response is missing radar_meta; the backend did not execute global radar mode.');
  }
  if (payload.radar_meta) publicProfilesMetrics.set(url, payload.radar_meta);
  const records = Array.isArray(payload.profiles) ? payload.profiles : [];
  const profiles = records
    .map(mapApiProfileToPublicProfile)
    .filter((profile): profile is Profile => Boolean(profile));

  if (viteEnv.DEV) {
    console.info('[public-profiles]', {
      url,
      api_records: records.length,
      public_records: profiles.length,
      rejected_records: records.length - profiles.length
    });
  }

  return profiles;
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('Request aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('Request aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function clearPublicProfilesRequestCache() {
  publicProfilesCache.clear();
  publicProfilesMetrics.clear();
}

export function mapApiProfileToPublicProfile(input: unknown): Profile | null {
  if (!input || typeof input !== 'object') {
    devReject('not_an_object');
    return null;
  }

  const raw = input as ApiProfile;
  const id = text(raw.id);
  const displayName = text(raw.display_name ?? raw.displayName ?? raw.name);
  if (!id || !displayName) {
    devReject(!id ? 'missing_id' : 'missing_display_name');
    return null;
  }

  const city = text(raw.city ?? raw.work_city ?? raw.workCity ?? raw.location_city) || 'unknown';
  const images = mapImages(raw);
  const availability = text(raw.availability_status ?? raw.availabilityStatus ?? raw.status);

  return {
    ...(raw as unknown as Profile),
    id,
    display_name: displayName,
    slug: text(raw.slug) || id,
    city,
    category: normalizeProfileCategory(raw.category) || nullableText(raw.category),
    work_city: nullableText(raw.work_city ?? raw.workCity ?? raw.location_city),
    area: nullableText(raw.area ?? raw.district),
    work_area: nullableText(raw.work_area ?? raw.workArea ?? raw.district),
    postal_code: nullableText(raw.postal_code ?? raw.postalCode ?? raw.zip),
    work_place_label: nullableText(raw.work_place_label ?? raw.workPlaceLabel),
    location_mode: normalizeLocationMode(raw.location_mode ?? raw.locationMode),
    location_visibility: normalizeLocationVisibility(raw.location_visibility ?? raw.locationVisibility ?? raw.location_mode ?? raw.locationMode),
    latitude: numberValue(raw.latitude ?? raw.lat),
    longitude: numberValue(raw.longitude ?? raw.lng),
    languages: stringArray(raw.languages),
    gender: normalizeProfileGender(raw.gender) || nullableText(raw.gender),
    orientation: normalizeProfileOrientation(raw.orientation) || nullableText(raw.orientation),
    ethnicity: normalizeProfileEthnicity(raw.ethnicity ?? raw.origin) || nullableText(raw.ethnicity),
    travels: normalizeProfileTravels(raw.travels ?? raw.travel),
    travel: nullableText(raw.travel),
    penis_length_cm: numberValue(raw.penis_length_cm ?? raw.penisLengthCm),
    penis_diameter_cm: numberValue(raw.penis_diameter_cm ?? raw.penisDiameterCm),
    available_now: booleanValue(raw.available_now ?? raw.availableNow),
    mobile_service: booleanValue(raw.mobile_service ?? raw.mobileService),
    private_studio: booleanValue(raw.private_studio ?? raw.privateStudio),
    verified: booleanValue(raw.verified),
    is_sponsored: booleanValue(raw.is_sponsored ?? raw.isSponsored),
    acquisition_source: nullableText(raw.acquisition_source ?? raw.acquisitionSource),
    provider: nullableText(raw.provider),
    status: normalizeStatus(raw.status),
    subscription_status: text(raw.subscription_status ?? raw.subscriptionStatus) || '',
    availability_status: normalizeAvailability(availability),
    operator_status: normalizeOperatorStatus(raw.operator_status ?? raw.operatorStatus),
    price_30min: numberValue(raw.price_30min),
    price_1h: numberValue(raw.price_1h ?? raw.hourly_rate ?? raw.price_per_hour),
    price_2h: numberValue(raw.price_2h),
    price_3h: numberValue(raw.price_3h),
    price_night: numberValue(raw.price_night),
    outcall_fee: numberValue(raw.outcall_fee),
    profile_images: images,
    images
  };
}

function mapImages(raw: ApiProfile): ProfileImage[] {
  const candidates: unknown[] = [];
  for (const value of [raw.profile_images, raw.profile_photos, raw.profilePhotos, raw.photos, raw.images]) {
    if (Array.isArray(value)) candidates.push(...value);
  }

  for (const [value, primary] of [[raw.cover_url, true], [raw.avatar_url, false]] as const) {
    if (typeof value === 'string' && value.trim()) {
      candidates.push({ public_url: value, is_primary: primary });
    }
  }

  const seen = new Set<string>();
  return candidates
    .map((value, index): ProfileImage | null => {
      if (typeof value === 'string') {
        const url = value.trim();
        if (!url || seen.has(url)) return null;
        seen.add(url);
        return {
          id: `image-${index}-${url}`,
          storage_path: url,
          public_url: url,
          is_primary: index === 0,
          is_blurred: false,
          moderation_status: 'approved',
          sort_order: index
        };
      }
      if (!value || typeof value !== 'object') return null;
      const image = value as Record<string, unknown>;
      if (
        image.is_hidden === true
        || image.moderation_status === 'pending'
        || image.moderation_status === 'rejected'
        || image.moderation_status === 'blocked'
      ) return null;
      const url = text(image.public_url ?? image.publicUrl ?? image.url ?? image.image_url);
      const storagePath = text(image.storage_path ?? image.storagePath) || url;
      if ((!url && !storagePath) || (url && seen.has(url))) return null;
      if (url) seen.add(url);
      return {
        ...(image as unknown as ProfileImage),
        id: text(image.id) || `image-${index}-${storagePath}`,
        storage_path: storagePath,
        public_url: url || undefined,
        is_primary: booleanValue(image.is_primary ?? image.isPrimary ?? image.is_cover),
        is_blurred: booleanValue(image.is_blurred ?? image.isBlurred),
        moderation_status: (text(image.moderation_status) || 'approved') as ProfileImage['moderation_status'],
        sort_order: numberValue(image.sort_order) ?? index
      };
    })
    .filter((image): image is ProfileImage => Boolean(image))
    .sort((left, right) => Number(right.is_primary) - Number(left.is_primary) || Number(left.sort_order || 0) - Number(right.sort_order || 0));
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function nullableText(value: unknown) {
  return text(value) || null;
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function booleanValue(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(value: unknown): Profile['status'] {
  const status = text(value);
  return ['pending', 'active', 'rejected', 'suspended'].includes(status) ? status as Profile['status'] : 'active';
}

function normalizeAvailability(value: string): Profile['availability_status'] {
  if (value === 'available' || value === 'busy' || value === 'unavailable') return value;
  return 'unavailable';
}

function normalizeOperatorStatus(value: unknown): Profile['operator_status'] {
  const key = text(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
  const aliases: Record<string, Profile['operator_status']> = {
    onlinenow: 'ONLINE_NOW',
    online: 'ONLINE_NOW',
    availabletoday: 'AVAILABLE_TODAY',
    available: 'AVAILABLE_TODAY',
    busy: 'BUSY',
    appointment: 'APPOINTMENT_ONLY',
    appointmentonly: 'APPOINTMENT_ONLY',
    traveling: 'TRAVELING',
    offline: 'OFFLINE'
  };
  return aliases[key] || 'OFFLINE';
}

function normalizeLocationMode(value: unknown): Profile['location_mode'] {
  const mode = text(value);
  if (['exact', 'postal_area', 'hidden', 'exact_hidden', 'approximate', 'city_only'].includes(mode)) return mode as Profile['location_mode'];
  return 'city_only';
}

function normalizeLocationVisibility(value: unknown): Profile['location_visibility'] {
  const mode = text(value);
  if (['exact', 'postal_area', 'city_only', 'hidden'].includes(mode)) return mode as Profile['location_visibility'];
  if (mode === 'exact_hidden') return 'hidden';
  if (mode === 'approximate') return 'postal_area';
  return 'postal_area';
}

function devReject(reason: string) {
  if (viteEnv.DEV) console.info('[public-profiles] rejected', { reason });
}
