export const funPageAdvertisementSettingKey = 'funpage_advertisement';
export const funPageAdvertisementStoragePrefix = 'funpage-advertisements/';
export const funPageAdvertisementAltMaxLength = 200;
export const funPageTickerTextMaxLength = 500;
export const defaultAdvertisementRotationSeconds = 6;
export const minAdvertisementRotationSeconds = 3;
export const maxAdvertisementRotationSeconds = 30;
export const maxFunPageAdvertisements = 100;

export type AdvertisementImage = { publicUrl: string; storagePath: string };
export type TickerSpeed = 'slow' | 'normal' | 'fast';

export type FunPageAdvertisement = {
  id: string;
  active: boolean;
  image: AdvertisementImage | null;
  targetUrl: string | null;
  altText: string;
  openInNewTab: boolean;
  startsAt: string | null;
  endsAt: string | null;
  position: number;
};

export type FunPageTicker = {
  active: boolean;
  text: string;
  speed: TickerSpeed;
  targetUrl: string | null;
  openInNewTab: boolean;
};

export type FunPageAdvertisementSettings = {
  version: 2;
  rotationIntervalSeconds: number;
  advertisements: FunPageAdvertisement[];
  ticker: FunPageTicker;
  updatedAt: string | null;
};

export type PublicFunPageAdvertisement = {
  id: string;
  imageUrl: string;
  targetUrl: string | null;
  altText: string;
  openInNewTab: boolean;
};

export type PublicFunPagePromotions = {
  advertisements: PublicFunPageAdvertisement[];
  rotationIntervalSeconds: number;
  ticker: FunPageTicker | null;
};

export const emptyFunPageTicker: FunPageTicker = {
  active: false,
  text: '',
  speed: 'normal',
  targetUrl: null,
  openInNewTab: false
};

export const emptyFunPageAdvertisementSettings: FunPageAdvertisementSettings = {
  version: 2,
  rotationIntervalSeconds: defaultAdvertisementRotationSeconds,
  advertisements: [],
  ticker: emptyFunPageTicker,
  updatedAt: null
};

export function normalizeFunPageAdvertisementSettings(value: unknown): FunPageAdvertisementSettings {
  if (!isRecord(value)) return cloneEmptySettings();
  if (Array.isArray(value.advertisements)) return normalizeVersionTwo(value);
  return normalizeLegacyAdvertisement(value);
}

export function normalizeLegacyAdvertisement(value: Record<string, unknown>): FunPageAdvertisementSettings {
  const desktopImage = normalizeImage(value.desktopImage);
  const mobileImage = normalizeImage(value.mobileImage);
  const image = desktopImage || mobileImage;
  const hasLegacyData = image || value.active === true || normalizeNullableString(value.targetUrl) || normalizeNullableString(value.altText);
  if (!hasLegacyData) return cloneEmptySettings();
  return {
    ...cloneEmptySettings(),
    advertisements: [{
      id: 'legacy-primary',
      active: value.active === true,
      image,
      targetUrl: safeStoredTargetUrl(value.targetUrl),
      altText: normalizeText(value.altText, funPageAdvertisementAltMaxLength),
      openInNewTab: value.openInNewTab === true,
      startsAt: normalizeStoredDate(value.startsAt),
      endsAt: normalizeStoredDate(value.endsAt),
      position: 0
    }],
    updatedAt: normalizeStoredDate(value.updatedAt)
  };
}

export function createEmptyFunPageAdvertisement(position: number, id = crypto.randomUUID()): FunPageAdvertisement {
  return {
    id,
    active: false,
    image: null,
    targetUrl: null,
    altText: '',
    openInNewTab: false,
    startsAt: null,
    endsAt: null,
    position
  };
}

export function validateAdvertisementInput(input: unknown):
  | { ok: true; value: Omit<FunPageAdvertisement, 'id' | 'image' | 'position'> }
  | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: 'Advertisement settings must be an object' };
  if (typeof input.active !== 'boolean') return { ok: false, error: 'active must be a boolean' };
  if (typeof input.openInNewTab !== 'boolean') return { ok: false, error: 'openInNewTab must be a boolean' };
  if (typeof input.altText !== 'string') return { ok: false, error: 'altText must be a string' };
  if (!isNullableString(input.targetUrl)) return { ok: false, error: 'targetUrl must be a string or null' };
  if (!isNullableString(input.startsAt)) return { ok: false, error: 'startsAt must be a string or null' };
  if (!isNullableString(input.endsAt)) return { ok: false, error: 'endsAt must be a string or null' };

  const altText = input.altText.trim();
  if (altText.length > funPageAdvertisementAltMaxLength) return { ok: false, error: `altText must not exceed ${funPageAdvertisementAltMaxLength} characters` };
  const targetUrl = normalizeNullableString(input.targetUrl);
  if (targetUrl && targetUrl.length > 2048) return { ok: false, error: 'targetUrl must not exceed 2048 characters' };
  if (targetUrl && !isSafeAdvertisementUrl(targetUrl)) return { ok: false, error: 'targetUrl must use https: or be an internal application path' };
  const startsAt = parseInputDate(input.startsAt, 'startsAt');
  if ('error' in startsAt) return { ok: false, error: startsAt.error };
  const endsAt = parseInputDate(input.endsAt, 'endsAt');
  if ('error' in endsAt) return { ok: false, error: endsAt.error };
  if (startsAt.value && endsAt.value && startsAt.value > endsAt.value) return { ok: false, error: 'startsAt must be before endsAt' };
  return { ok: true, value: { active: input.active, targetUrl, altText, openInNewTab: input.openInNewTab, startsAt: startsAt.value, endsAt: endsAt.value } };
}

export function validatePromotionsConfiguration(input: unknown):
  | { ok: true; value: Pick<FunPageAdvertisementSettings, 'rotationIntervalSeconds' | 'ticker'> }
  | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: 'Configuration must be an object' };
  const rotationIntervalSeconds = Number(input.rotationIntervalSeconds);
  if (!Number.isInteger(rotationIntervalSeconds) || rotationIntervalSeconds < minAdvertisementRotationSeconds || rotationIntervalSeconds > maxAdvertisementRotationSeconds) {
    return { ok: false, error: `rotationIntervalSeconds must be an integer from ${minAdvertisementRotationSeconds} to ${maxAdvertisementRotationSeconds}` };
  }
  if (!isRecord(input.ticker)) return { ok: false, error: 'ticker must be an object' };
  if (typeof input.ticker.active !== 'boolean') return { ok: false, error: 'ticker.active must be a boolean' };
  if (typeof input.ticker.text !== 'string') return { ok: false, error: 'ticker.text must be a string' };
  if (typeof input.ticker.openInNewTab !== 'boolean') return { ok: false, error: 'ticker.openInNewTab must be a boolean' };
  if (!isNullableString(input.ticker.targetUrl)) return { ok: false, error: 'ticker.targetUrl must be a string or null' };
  if (!['slow', 'normal', 'fast'].includes(String(input.ticker.speed))) return { ok: false, error: 'ticker.speed must be slow, normal, or fast' };
  const text = input.ticker.text.trim();
  if (text.length > funPageTickerTextMaxLength) return { ok: false, error: `ticker.text must not exceed ${funPageTickerTextMaxLength} characters` };
  const targetUrl = normalizeNullableString(input.ticker.targetUrl);
  if (targetUrl && targetUrl.length > 2048) return { ok: false, error: 'ticker.targetUrl must not exceed 2048 characters' };
  if (targetUrl && !isSafeAdvertisementUrl(targetUrl)) return { ok: false, error: 'ticker.targetUrl must use https: or be an internal application path' };
  return {
    ok: true,
    value: {
      rotationIntervalSeconds,
      ticker: { active: input.ticker.active, text, speed: input.ticker.speed as TickerSpeed, targetUrl, openInNewTab: input.ticker.openInNewTab }
    }
  };
}

export function reorderAdvertisements(settings: FunPageAdvertisementSettings, ids: unknown):
  | { ok: true; value: FunPageAdvertisement[] }
  | { ok: false; error: string } {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) return { ok: false, error: 'advertisement_ids must be an array of strings' };
  const existingIds = settings.advertisements.map((advertisement) => advertisement.id);
  if (ids.length !== existingIds.length || new Set(ids).size !== ids.length || ids.some((id) => !existingIds.includes(id))) {
    return { ok: false, error: 'advertisement_ids must contain every advertisement exactly once' };
  }
  const byId = new Map(settings.advertisements.map((advertisement) => [advertisement.id, advertisement]));
  return { ok: true, value: ids.map((id, position) => ({ ...byId.get(id)!, position })) };
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
  if (!advertisement.active || !advertisement.image) return false;
  const timestamp = now.getTime();
  if (advertisement.startsAt && timestamp < new Date(advertisement.startsAt).getTime()) return false;
  if (advertisement.endsAt && timestamp > new Date(advertisement.endsAt).getTime()) return false;
  return true;
}

export function toPublicFunPagePromotions(settings: FunPageAdvertisementSettings, now = new Date()): PublicFunPagePromotions {
  return {
    advertisements: [...settings.advertisements]
      .sort((a, b) => a.position - b.position)
      .filter((advertisement) => isFunPageAdvertisementLive(advertisement, now))
      .map((advertisement) => ({
        id: advertisement.id,
        imageUrl: advertisement.image!.publicUrl,
        targetUrl: advertisement.targetUrl,
        altText: advertisement.altText,
        openInNewTab: advertisement.openInNewTab
      })),
    rotationIntervalSeconds: settings.rotationIntervalSeconds,
    ticker: settings.ticker.active && settings.ticker.text ? { ...settings.ticker } : null
  };
}

export function isAdvertisementStoragePath(value: string) {
  return value.startsWith(funPageAdvertisementStoragePrefix) && !value.includes('..') && !value.includes('\\');
}

function normalizeVersionTwo(input: Record<string, unknown>): FunPageAdvertisementSettings {
  const seen = new Set<string>();
  const advertisements = (input.advertisements as unknown[]).slice(0, maxFunPageAdvertisements).map((value, index) => {
    const row = isRecord(value) ? value : {};
    let id = normalizeId(row.id) || `advertisement-${index + 1}`;
    while (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    return {
      id,
      active: row.active === true,
      image: normalizeImage(row.image),
      targetUrl: safeStoredTargetUrl(row.targetUrl),
      altText: normalizeText(row.altText, funPageAdvertisementAltMaxLength),
      openInNewTab: row.openInNewTab === true,
      startsAt: normalizeStoredDate(row.startsAt),
      endsAt: normalizeStoredDate(row.endsAt),
      position: Number.isInteger(row.position) ? Number(row.position) : index
    };
  }).sort((a, b) => a.position - b.position).map((advertisement, position) => ({ ...advertisement, position }));
  const interval = Number(input.rotationIntervalSeconds);
  const tickerInput = isRecord(input.ticker) ? input.ticker : {};
  const speed = ['slow', 'normal', 'fast'].includes(String(tickerInput.speed)) ? tickerInput.speed as TickerSpeed : 'normal';
  return {
    version: 2,
    rotationIntervalSeconds: Number.isInteger(interval) && interval >= minAdvertisementRotationSeconds && interval <= maxAdvertisementRotationSeconds ? interval : defaultAdvertisementRotationSeconds,
    advertisements,
    ticker: {
      active: tickerInput.active === true,
      text: normalizeText(tickerInput.text, funPageTickerTextMaxLength),
      speed,
      targetUrl: safeStoredTargetUrl(tickerInput.targetUrl),
      openInNewTab: tickerInput.openInNewTab === true
    },
    updatedAt: normalizeStoredDate(input.updatedAt)
  };
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

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeId(value: unknown) {
  const id = typeof value === 'string' ? value.trim() : '';
  return /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : '';
}

function isNullableString(value: unknown) {
  return value === null || value === undefined || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneEmptySettings(): FunPageAdvertisementSettings {
  return { ...emptyFunPageAdvertisementSettings, advertisements: [], ticker: { ...emptyFunPageTicker } };
}
