export const categoryOptions = ['ladies', 'men', 'gay', 'couples', 'trans', 'massage', 'home_hotel', 'live_cam', 'clubs_parties', 'bdsm', 'onlyfans', 'sex_phone', 'films', 'offers', 'other'] as const;

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
  men: 'men',
  man: 'men',
  male: 'men',
  panowie: 'men',
  gay: 'gay',
  gays: 'gay',
  gej_les: 'gay',
  gay_les: 'gay',
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
  bdsm: 'bdsm',
  onlyfans: 'onlyfans',
  only_fans: 'onlyfans',
  sex_phone: 'sex_phone',
  phone_show: 'sex_phone',
  pokazy_sex_telefon: 'sex_phone',
  films: 'films',
  filmy: 'films',
  videos: 'films',
  offers: 'offers',
  oferty: 'offers',
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
