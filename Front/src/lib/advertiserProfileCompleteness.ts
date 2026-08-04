import type { Profile } from '../types';

export const advertiserProfileCompletionCriteria = [
  {
    id: 'displayName',
    labelKey: 'advertiserDashboard.completeness.criteria.displayName',
    section: 'profile',
    isComplete: (profile: Partial<Profile>) => Boolean(profile.display_name?.trim())
  },
  {
    id: 'description',
    labelKey: 'advertiserDashboard.completeness.criteria.description',
    section: 'profile',
    isComplete: (profile: Partial<Profile>) => Boolean(profile.description?.trim())
  },
  {
    id: 'photo',
    labelKey: 'advertiserDashboard.completeness.criteria.photo',
    section: 'profile',
    isComplete: (profile: Partial<Profile>) => Boolean(profile.profile_images?.length)
  },
  {
    id: 'location',
    labelKey: 'advertiserDashboard.completeness.criteria.location',
    section: 'location',
    isComplete: (profile: Partial<Profile>) => Boolean(profile.work_city || profile.city)
  },
  {
    id: 'services',
    labelKey: 'advertiserDashboard.completeness.criteria.services',
    section: 'profile',
    isComplete: (profile: Partial<Profile>) => Boolean(profile.services?.length)
  },
  {
    id: 'pricing',
    labelKey: 'advertiserDashboard.completeness.criteria.pricing',
    section: 'profile',
    isComplete: (profile: Partial<Profile>) => Boolean(profile.price_1h || profile.price_30min)
  },
  {
    id: 'contact',
    labelKey: 'advertiserDashboard.completeness.criteria.contact',
    section: 'profile',
    isComplete: (profile: Partial<Profile>) => Boolean(profile.primary_phone || profile.phone || profile.whatsapp || profile.telegram)
  },
  {
    id: 'availability',
    labelKey: 'advertiserDashboard.completeness.criteria.availability',
    section: 'profile',
    isComplete: (profile: Partial<Profile>) => Boolean(profile.opening_hours || profile.working_24_7 || profile.working_today_start)
  }
] as const;

export type AdvertiserProfileCompletionSection = typeof advertiserProfileCompletionCriteria[number]['section'];

export function getAdvertiserProfileCompleteness(profile: Partial<Profile> | null | undefined) {
  const source = profile || {};
  const items = advertiserProfileCompletionCriteria.map((criterion) => ({
    id: criterion.id,
    labelKey: criterion.labelKey,
    section: criterion.section,
    complete: criterion.isComplete(source)
  }));
  const missing = items.filter((item) => !item.complete);
  const completed = items.length - missing.length;

  return {
    items,
    missing,
    completed,
    total: items.length,
    percent: Math.round((completed / items.length) * 100),
    complete: missing.length === 0
  };
}
