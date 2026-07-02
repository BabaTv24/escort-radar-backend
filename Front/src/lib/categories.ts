export const categoryOptions = ['ladies', 'gay', 'couples', 'trans', 'massage', 'home_hotel', 'live_cam', 'clubs_parties', 'other'] as const;

export type CategoryKey = typeof categoryOptions[number];

const categoryAliasMap: Record<string, CategoryKey> = {
  ladies: 'ladies',
  lady: 'ladies',
  panie: 'ladies',
  women: 'ladies',
  woman: 'ladies',
  female: 'ladies',
  girl: 'ladies',
  girls: 'ladies',
  gay: 'gay',
  gays: 'gay',
  male: 'gay',
  men: 'gay',
  man: 'gay',
  homo: 'gay',
  couples: 'couples',
  couple: 'couples',
  pary: 'couples',
  trans: 'trans',
  transgender: 'trans',
  massage: 'massage',
  masaz: 'massage',
  home_hotel: 'home_hotel',
  house_hotel: 'home_hotel',
  dom_hotel: 'home_hotel',
  live_cam: 'live_cam',
  camera_live: 'live_cam',
  kamera_live: 'live_cam',
  clubs_parties: 'clubs_parties',
  kluby_imprezy: 'clubs_parties',
  other: 'other',
  inne: 'other'
};

export function normalizeCategoryKey(value: unknown): CategoryKey | '' {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return categoryAliasMap[key] || (categoryOptions.includes(key as CategoryKey) ? key as CategoryKey : '');
}

export function getCategoryAliases(key: unknown) {
  const normalized = normalizeCategoryKey(key);
  if (!normalized) return [];
  return Object.entries(categoryAliasMap)
    .filter(([, value]) => value === normalized)
    .map(([alias]) => alias);
}

export function getCategoryLabel(key: unknown, t: (key: string) => string) {
  const normalized = normalizeCategoryKey(key);
  return normalized ? t(`options.${normalized}`) : String(key || '');
}
