import { normalizeProfileCategory } from './validation.js';
import { isPublicProfile } from './publicProfiles.js';
import { getCountryAliases, normalizeCity, normalizeCountry } from './locations.js';

export type VisibilityContext = {
  country?: unknown;
  city?: unknown;
  category?: unknown;
};

export type ProfileVisibilityExplanation = {
  isPublicVisible: boolean;
  isVisibleInCurrentSearch: boolean;
  reasons: string[];
  checks: {
    published: boolean;
    moderationApproved: boolean;
    notSuspended: boolean;
    notShadowbanned: boolean;
    subscriptionActiveOrTrialOrSeed: boolean;
    cityMatches: boolean;
    countryCompatible: boolean;
    categoryMatches: boolean;
    hasRadarLocation: boolean;
  };
  normalized: {
    country: string | null;
    city: string | null;
    category: string | null;
  };
};

export function explainProfileVisibility(profile: Record<string, any>, context: VisibilityContext = {}): ProfileVisibilityExplanation {
  const country = normalizeCountry(context.country) || null;
  const city = normalizeCity(context.city) || null;
  const category = normalizeProfileCategory(context.category) || null;
  const normalizedProfileCategory = normalizeProfileCategory(profile.category) || null;

  const checks = {
    published: profile.is_published !== false,
    moderationApproved: profile.moderation_status === 'approved',
    notSuspended: profile.status === 'active' && profile.moderation_status !== 'suspended',
    notShadowbanned: profile.shadowbanned !== true,
    subscriptionActiveOrTrialOrSeed: isSubscriptionActiveOrTrialOrSeed(profile),
    cityMatches: !city || profileMatchesCity(profile, city),
    countryCompatible: !country || profileMatchesCountry(profile, country) || Boolean(city && profileMatchesCity(profile, city)),
    categoryMatches: !category || normalizedProfileCategory === category,
    hasRadarLocation: hasRadarLocation(profile)
  };

  const isPublicVisible = isPublicProfile(profile);
  const isVisibleInCurrentSearch = isPublicVisible && checks.cityMatches && checks.countryCompatible && checks.categoryMatches;
  const reasons = buildVisibilityReasons(checks, isPublicVisible);

  return {
    isPublicVisible,
    isVisibleInCurrentSearch,
    reasons,
    checks,
    normalized: {
      country,
      city,
      category
    }
  };
}

export function profileMatchesSearch(profile: Record<string, any>, context: VisibilityContext = {}) {
  return explainProfileVisibility(profile, context).isVisibleInCurrentSearch;
}

function buildVisibilityReasons(checks: ProfileVisibilityExplanation['checks'], isPublicVisible: boolean) {
  const reasons: string[] = [];
  if (!checks.published) reasons.push('unpublished');
  if (!checks.moderationApproved) reasons.push('moderation_not_approved');
  if (!checks.notSuspended) reasons.push('suspended_or_inactive');
  if (!checks.notShadowbanned) reasons.push('shadowbanned');
  if (!checks.subscriptionActiveOrTrialOrSeed) reasons.push('subscription_inactive');
  if (!checks.cityMatches) reasons.push('city_mismatch');
  if (!checks.countryCompatible) reasons.push('country_mismatch');
  if (!checks.categoryMatches) reasons.push('category_mismatch');
  if (!checks.hasRadarLocation) reasons.push('missing_radar_location');
  if (!reasons.length) reasons.push(isPublicVisible ? 'visible' : 'hidden');
  return reasons;
}

function isSubscriptionActiveOrTrialOrSeed(profile: Record<string, any>) {
  const status = String(profile.subscription_status || '').toLowerCase();
  return ['active', 'trial', 'test'].includes(status) || profile.is_seed_profile === true || profile.is_sponsored === true;
}

function profileMatchesCountry(profile: Record<string, any>, country: string) {
  const aliases = getCountryAliases(country).map((item) => item.toLowerCase());
  const values = [profile.work_country, profile.country, profile.country_code]
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
  if (!values.length && country === 'DE') return true;
  return values.some((value) => aliases.some((alias) => value === alias || value.includes(alias)));
}

function profileMatchesCity(profile: Record<string, any>, city: string) {
  const wanted = normalizeCity(city);
  return [profile.city, profile.work_city, profile.travel_city, profile.area, profile.work_area]
    .some((value) => {
      const normalizedValue = normalizeCity(value);
      return normalizedValue === wanted || normalizedValue.includes(wanted);
    });
}

function hasRadarLocation(profile: Record<string, any>) {
  const lat = Number(profile.latitude);
  const lng = Number(profile.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return true;
  return Boolean(profile.postal_code || profile.work_city || profile.city || profile.area || profile.work_area);
}
