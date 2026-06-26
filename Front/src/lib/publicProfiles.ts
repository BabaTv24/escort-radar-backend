import type { Profile, ProfileImage } from '../types';

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | boolean> }).env || {};
const API_URL = String(viteEnv.VITE_API_URL || 'http://localhost:4000');
const PUBLIC_PROFILES_PATH = '/api/profiles';

type ApiProfile = Record<string, unknown>;

export async function getPublicProfiles(params: URLSearchParams | string = ''): Promise<Profile[]> {
  const query = typeof params === 'string'
    ? params
    : params.toString() ? `?${params.toString()}` : '';
  const url = `${API_URL}${PUBLIC_PROFILES_PATH}${query}`;
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });

  if (viteEnv.DEV) {
    console.info('[public-profiles]', { url, status: response.status });
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(String(payload.error || 'Request failed'));
  }

  const payload = await response.json() as { profiles?: unknown[] };
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

  const city = text(raw.city ?? raw.work_city ?? raw.workCity) || 'unknown';
  const images = mapImages(raw);
  const availability = text(raw.availability_status ?? raw.availabilityStatus ?? raw.status);

  return {
    ...(raw as unknown as Profile),
    id,
    display_name: displayName,
    slug: text(raw.slug) || id,
    city,
    work_city: nullableText(raw.work_city ?? raw.workCity),
    area: nullableText(raw.area ?? raw.district),
    work_area: nullableText(raw.work_area ?? raw.workArea ?? raw.district),
    languages: stringArray(raw.languages),
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
    price_1h: numberValue(raw.price_1h ?? raw.hourly_rate ?? raw.price_per_hour),
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

function devReject(reason: string) {
  if (viteEnv.DEV) console.info('[public-profiles] rejected', { reason });
}
