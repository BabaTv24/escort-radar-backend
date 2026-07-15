export type AdminWindowBounds = { x: number; y: number; width: number; height: number };
export type AdminWindowViewport = { left: number; top: number; width: number; height: number };

export const adminWindowLayoutVersion = 1;
export const adminWindowLayoutResetEvent = 'er-admin-window-layout-reset';
export const profileControlWindowStorageKey = 'er.admin.window.profileControl.v1';
export const profileReviewWindowStorageKey = 'er.admin.window.profileReview.v1';

export function constrainAdminWindowBounds(
  bounds: AdminWindowBounds,
  viewport: AdminWindowViewport,
  minWidth = 420,
  minHeight = 280,
  _titlebarVisible = 56
): AdminWindowBounds {
  const safeWidth = Math.max(1, viewport.width);
  const safeHeight = Math.max(1, viewport.height);
  const width = clamp(bounds.width, Math.min(minWidth, safeWidth), safeWidth);
  const height = clamp(bounds.height, Math.min(minHeight, safeHeight), safeHeight);
  const minX = viewport.left;
  const maxX = viewport.left + safeWidth - width;
  const minY = viewport.top;
  const maxY = viewport.top + safeHeight - height;
  return {
    x: clamp(bounds.x, minX, maxX),
    y: clamp(bounds.y, minY, maxY),
    width,
    height
  };
}

export function parseAdminWindowBounds(value: string | null): AdminWindowBounds | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.version !== adminWindowLayoutVersion) return null;
    if (![parsed.x, parsed.y, parsed.width, parsed.height].every((item) => typeof item === 'number' && Number.isFinite(item))) return null;
    const bounds = { x: parsed.x as number, y: parsed.y as number, width: parsed.width as number, height: parsed.height as number };
    if (bounds.width < 100 || bounds.height < 80 || Object.values(bounds).some((item) => Math.abs(item) > 100_000)) return null;
    return bounds;
  } catch {
    return null;
  }
}

export function readAdminWindowBounds(storage: Pick<Storage, 'getItem'>, key: string) {
  try {
    return parseAdminWindowBounds(storage.getItem(key));
  } catch {
    return null;
  }
}

export function writeAdminWindowBounds(storage: Pick<Storage, 'setItem'>, key: string, bounds: AdminWindowBounds) {
  try {
    storage.setItem(key, JSON.stringify({ version: adminWindowLayoutVersion, ...bounds }));
  } catch {
    // UI layout persistence must never block window interaction.
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
