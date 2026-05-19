export const categoryOptions = ['private', 'studio', 'nightlife', 'vip'];
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

export function toggleArrayValue(values: string[] = [], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function labelize(value: string) {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
