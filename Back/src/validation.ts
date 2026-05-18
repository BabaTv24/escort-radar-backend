import type { Request, Response, NextFunction } from 'express';

export const allowedCities = ['berlin', 'hamburg', 'hannover', 'koeln', 'muenchen', 'warszawa'];
export const allowedStatuses = ['pending', 'active', 'rejected', 'suspended'];
export const allowedReportStatuses = ['open', 'reviewing', 'resolved', 'dismissed'];

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 70);
}

export function parseBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

export function validateProfileInput(body: Record<string, unknown>) {
  const displayName = String(body.display_name || '').trim();
  const city = String(body.city || '').trim().toLowerCase();

  if (displayName.length < 2 || displayName.length > 80) {
    return { error: 'display_name must be between 2 and 80 characters' };
  }

  if (!allowedCities.includes(city)) {
    return { error: 'Unsupported city' };
  }

  return {
    data: {
      display_name: displayName,
      city,
      area: optionalText(body.area, 80),
      category: optionalText(body.category, 60),
      description: optionalText(body.description, 2000),
      languages: Array.isArray(body.languages)
        ? body.languages.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
        : [],
      available_now: Boolean(body.available_now),
      mobile_service: Boolean(body.mobile_service),
      private_studio: Boolean(body.private_studio)
    }
  };
}

export function optionalText(value: unknown, max: number) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
}
