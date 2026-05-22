export const categoryOptions = ['ladies', 'gay', 'couples', 'trans', 'massage', 'house_hotel', 'live_cam', 'clubs_parties', 'other'];
export const orientationOptions = ['straight', 'bisexual', 'queer-friendly'];
export const audienceOptions = ['men', 'women', 'couples'];
export const visitTypeOptions = ['incall', 'outcall', 'hotel', 'private'];
export const serviceTagOptions = [
  'dinner-date',
  'social-time',
  'wellness',
  'conversation',
  'vip-companion',
  'events',
  'nightlife',
  'late-night',
  'private-meeting',
  'discreet'
];
export const paymentMethodOptions = ['cash', 'card', 'bank-transfer'];
export const bodyTypeOptions = ['slim', 'athletic', 'curvy', 'classic', 'plus'];
export const hairColorOptions = ['black', 'brown', 'blonde', 'red', 'dark-blonde', 'other'];
export const originOptions = ['local', 'european', 'latin', 'asian', 'mixed', 'international'];
export const experienceTypeOptions = ['newcomer', 'independent', 'premium', 'vip', 'studio'];
export const defaultServiceMenuNames = [
  'dinner-date',
  'social-time',
  'hotel',
  'outcall',
  'private-meeting',
  'events',
  'late-night',
  'wellness'
];
export const radiusOptions = [5, 10, 15, 20, 25, 50, 100];
export const availabilityStatusOptions = ['available', 'busy', 'unavailable'] as const;
export const accountTypeOptions = ['private', 'agency', 'massage_salon', 'club_party', 'live_cam'];

export function toggleArrayValue(values: string[] = [], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function labelize(value: string) {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
