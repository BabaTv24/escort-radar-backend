import type { PublicFunPageAdvertisement } from './api';

export function safeAdvertisementHref(value: string | null) {
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

export function advertisementMobileImage(advertisement: PublicFunPageAdvertisement) {
  return advertisement.mobileImageUrl || advertisement.desktopImageUrl;
}
