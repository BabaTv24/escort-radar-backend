export const funPageAdvertisementSettingKey = 'funpage_advertisement';
export const funPageAdvertisementStoragePrefix = 'funpage-advertisements/';
export const funPageAdvertisementAltMaxLength = 200;

export type AdvertisementImage = { publicUrl: string; storagePath: string };

export type FunPageAdvertisement = {
  active: boolean;
  desktopImage: AdvertisementImage | null;
  mobileImage: AdvertisementImage | null;
  targetUrl: string | null;
  altText: string;
  openInNewTab: boolean;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string | null;
};

export type PublicFunPageAdvertisement = {
  desktopImageUrl: string;
  mobileImageUrl: string | null;
  targetUrl: string | null;
  altText: string;
  openInNewTab: boolean;
};

export const emptyFunPageAdvertisement: FunPageAdvertisement = {
  active: false,
  desktopImage: null,
  mobileImage: null,
  targetUrl: null,
  altText: '',
  openInNewTab: false,
  startsAt: null,
  endsAt: null,
  updatedAt: null
};

export function normalizeFunPageAdvertisement(value: unknown): FunPageAdvertisement {
  const input = isRecord(value) ? value : {};
  return {
    active: input.active === true,
    desktopImage: normalizeImage(input.desktopImage),
    mobileImage: normalizeImage(input.mobileImage),
    targetUrl: safeStoredTargetUrl(input.targetUrl),
    altText: typeof input.altText === 'string' ? input.altText.slice(0, funPageAdvertisementAltMaxLength) : '',
    openInNewTab: input.openInNewTab === true,
    startsAt: normalizeStoredDate(input.startsAt),
    endsAt: normalizeStoredDate(input.endsAt),
    updatedAt: normalizeStoredDate(input.updatedAt)
  };
}

export function validateFunPageAdvertisementInput(input: unknown):
  | { ok: true; value: Pick<FunPageAdvertisement, 'active' | 'targetUrl' | 'altText' | 'openInNewTab' | 'startsAt' | 'endsAt'> }
  | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: 'Advertisement settings must be an object' };
  if (typeof input.active !== 'boolean') return { ok: false, error: 'active must be a boolean' };
  if (typeof input.openInNewTab !== 'boolean') return { ok: false, error: 'openInNewTab must be a boolean' };
  if (typeof input.altText !== 'string') return { ok: false, error: 'altText must be a string' };
  if (input.targetUrl !== null && input.targetUrl !== undefined && typeof input.targetUrl !== 'string') {
    return { ok: false, error: 'targetUrl must be a string or null' };
  }
  if (input.startsAt !== null && input.startsAt !== undefined && typeof input.startsAt !== 'string') {
    return { ok: false, error: 'startsAt must be a string or null' };
  }
  if (input.endsAt !== null && input.endsAt !== undefined && typeof input.endsAt !== 'string') {
    return { ok: false, error: 'endsAt must be a string or null' };
  }
  const altText = input.altText.trim();
  if (altText.length > funPageAdvertisementAltMaxLength) return { ok: false, error: `altText must not exceed ${funPageAdvertisementAltMaxLength} characters` };

  const targetUrl = normalizeNullableString(input.targetUrl);
  if (targetUrl && targetUrl.length > 2048) return { ok: false, error: 'targetUrl must not exceed 2048 characters' };
  if (targetUrl && !isSafeAdvertisementUrl(targetUrl)) {
    return { ok: false, error: 'targetUrl must use https: or be an internal application path' };
  }
  const startsAt = parseInputDate(input.startsAt, 'startsAt');
  if ('error' in startsAt) return { ok: false, error: startsAt.error };
  const endsAt = parseInputDate(input.endsAt, 'endsAt');
  if ('error' in endsAt) return { ok: false, error: endsAt.error };
  if (startsAt.value && endsAt.value && startsAt.value > endsAt.value) return { ok: false, error: 'startsAt must be before endsAt' };

  return { ok: true, value: { active: input.active, targetUrl, altText, openInNewTab: input.openInNewTab, startsAt: startsAt.value, endsAt: endsAt.value } };
}

export function isSafeAdvertisementUrl(value: string) {
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function isFunPageAdvertisementLive(advertisement: FunPageAdvertisement, now = new Date()) {
  if (!advertisement.active || !advertisement.desktopImage) return false;
  const timestamp = now.getTime();
  if (advertisement.startsAt && timestamp < new Date(advertisement.startsAt).getTime()) return false;
  if (advertisement.endsAt && timestamp > new Date(advertisement.endsAt).getTime()) return false;
  return true;
}

export function toPublicFunPageAdvertisement(advertisement: FunPageAdvertisement, now = new Date()): PublicFunPageAdvertisement | null {
  if (!isFunPageAdvertisementLive(advertisement, now)) return null;
  return {
    desktopImageUrl: advertisement.desktopImage!.publicUrl,
    mobileImageUrl: advertisement.mobileImage?.publicUrl || null,
    targetUrl: advertisement.targetUrl,
    altText: advertisement.altText,
    openInNewTab: advertisement.openInNewTab
  };
}

export function isAdvertisementStoragePath(value: string) {
  return value.startsWith(funPageAdvertisementStoragePrefix) && !value.includes('..') && !value.includes('\\');
}

function normalizeImage(value: unknown): AdvertisementImage | null {
  if (!isRecord(value)) return null;
  const publicUrl = typeof value.publicUrl === 'string' ? value.publicUrl.trim() : '';
  const storagePath = typeof value.storagePath === 'string' ? value.storagePath.trim() : '';
  return publicUrl && isAdvertisementStoragePath(storagePath) ? { publicUrl, storagePath } : null;
}

function parseInputDate(value: unknown, field: string): { value: string | null } | { error: string } {
  const normalized = normalizeNullableString(value);
  if (!normalized) return { value: null };
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? { value: date.toISOString() } : { error: `${field} must be a valid date` };
}

function normalizeStoredDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeNullableString(value: unknown) {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeStoredTargetUrl(value: unknown) {
  const normalized = normalizeNullableString(value);
  return normalized && isSafeAdvertisementUrl(normalized) ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
