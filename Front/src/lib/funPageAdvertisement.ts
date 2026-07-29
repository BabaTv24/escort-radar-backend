export function safeAdvertisementHref(value: string | null) {
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

export function shouldRotateAdvertisements(count: number) {
  return count > 1;
}

export function advertisementRotationDelayMs(seconds: number) {
  const normalized = Number.isFinite(seconds) ? Math.min(30, Math.max(3, Math.round(seconds))) : 6;
  return normalized * 1000;
}

export function nextAdvertisementIndex(current: number, count: number) {
  return count > 1 ? (current + 1) % count : 0;
}
