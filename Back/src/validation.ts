import type { Request, Response, NextFunction } from 'express';

export const allowedCities = ['berlin', 'hamburg', 'hannover', 'koeln', 'muenchen', 'warszawa'];
export const allowedCategories = ['ladies', 'gay', 'couples', 'trans', 'massage', 'house_hotel', 'live_cam', 'clubs_parties', 'other'];
export const allowedAccountTypes = ['private', 'agency', 'massage_salon', 'club_party', 'live_cam'];
export const allowedStatuses = ['pending', 'active', 'rejected', 'suspended'];
export const allowedReportStatuses = ['open', 'reviewing', 'resolved', 'dismissed'];
export const allowedVerificationStatuses = ['pending', 'verified', 'rejected', 'changes_requested'];
export const allowedModerationStatuses = ['clean', 'review', 'suspended', 'blocked'];
export const allowedAdminReportStatuses = ['open', 'investigating', 'resolved', 'escalated'];

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
      account_type: normalizeAccountType(body.account_type),
      primary_phone: optionalText(body.primary_phone, 40),
      additional_phones: optionalArray(body.additional_phones, 8),
      phone_owner_identity_label: optionalText(body.phone_owner_identity_label, 120),
      phone_rule_confirmed: Boolean(body.phone_rule_confirmed),
      referred_by_code: optionalText(body.referred_by_code, 40),
      city,
      area: optionalText(body.area, 80),
      category: normalizeCategory(body.category),
      description: optionalText(body.description, 2000),
      languages: Array.isArray(body.languages)
        ? body.languages.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
        : [],
      age: optionalNumber(body.age, 18, 99),
      height: optionalNumber(body.height, 120, 230),
      body_type: optionalText(body.body_type, 80),
      body_features: optionalArray(body.body_features, 12),
      hair_color: optionalText(body.hair_color, 80),
      origin: optionalText(body.origin, 80),
      experience_type: optionalText(body.experience_type, 80),
      orientation: optionalText(body.orientation, 60),
      audience: optionalArray(body.audience, 6),
      visit_types: optionalArray(body.visit_types, 8),
      service_tags: optionalArray(body.service_tags, 16),
      tag_ids: optionalArray(body.tag_ids, 60),
      payment_methods: optionalArray(body.payment_methods, 8),
      availability_note: optionalText(body.availability_note, 500),
      price_30min: optionalMoney(body.price_30min),
      price_1h: optionalMoney(body.price_1h),
      price_2h: optionalMoney(body.price_2h),
      price_night: optionalMoney(body.price_night),
      outcall_fee: optionalMoney(body.outcall_fee),
      currency: optionalText(body.currency, 8) || 'EUR',
      service_menu: optionalServiceMenu(body.service_menu),
      listing_plan: optionalText(body.listing_plan, 80) || 'premium_monthly',
      listing_price: optionalMoney(body.listing_price) || 49.99,
      listing_currency: optionalText(body.listing_currency, 8) || 'EUR',
      max_photos: optionalNumber(body.max_photos, 1, 6) || 6,
      availability_status: normalizeAvailabilityStatus(body.availability_status),
      service_radius_km: optionalNumber(body.service_radius_km, 5, 100) || 25,
      approximate_location_area: optionalText(body.approximate_location_area, 120),
      latitude: optionalCoordinate(body.latitude, -90, 90),
      longitude: optionalCoordinate(body.longitude, -180, 180),
      distance_km: optionalMoney(body.distance_km),
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

function optionalArray(value: unknown, max: number) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, max)
    : [];
}

function optionalNumber(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(Math.max(Math.round(number), min), max);
}

function optionalMoney(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100) / 100;
}

function optionalServiceMenu(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).map((item) => {
    const service = item as Record<string, unknown>;
    return {
      name: String(service.name || '').trim().slice(0, 120),
      enabled: Boolean(service.enabled),
      included: Boolean(service.included),
      extra_price: optionalMoney(service.extra_price),
      note: optionalText(service.note, 300)
    };
  }).filter((service) => service.name);
}

function normalizeAvailabilityStatus(value: unknown) {
  const status = String(value || 'unavailable');
  return ['available', 'busy', 'unavailable'].includes(status) ? status : 'unavailable';
}

function normalizeCategory(value: unknown) {
  const category = String(value || 'other');
  return allowedCategories.includes(category) ? category : 'other';
}

function normalizeAccountType(value: unknown) {
  const accountType = String(value || 'private');
  return allowedAccountTypes.includes(accountType) ? accountType : 'private';
}

function optionalCoordinate(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(Math.max(number, min), max);
}
