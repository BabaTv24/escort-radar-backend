import type { Profile } from '../types';

export const profileGenderOptions = ['female', 'male'] as const;
export const profileOrientationOptions = ['hetero', 'homo', 'bi'] as const;
export const profileEthnicityOptions = ['european', 'asian', 'latina', 'black', 'arabic', 'slavic', 'mixed', 'other'] as const;

type TFunction = (key: string, vars?: Record<string, string | number>) => string;

function normalizeKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function normalizeProfileGender(value: unknown) {
  const key = normalizeKey(value);
  if (!key) return '';
  if (['female', 'woman', 'kobieta', 'frau', 'f'].includes(key)) return 'female';
  if (['male', 'man', 'mezczyzna', 'mann', 'm'].includes(key)) return 'male';
  return profileGenderOptions.includes(key as any) ? key : '';
}

export function normalizeProfileOrientation(value: unknown) {
  const key = normalizeKey(value);
  if (!key) return '';
  if (['hetero', 'straight', 'heterosexual'].includes(key)) return 'hetero';
  if (['homo', 'gay', 'homosexual'].includes(key)) return 'homo';
  if (['bi', 'bisexual', 'biseksualna', 'biseksualny'].includes(key)) return 'bi';
  return profileOrientationOptions.includes(key as any) ? key : '';
}

export function normalizeProfileEthnicity(value: unknown) {
  const key = normalizeKey(value);
  if (!key) return '';
  const aliases: Record<string, string> = {
    europejska: 'european',
    european: 'european',
    europaisch: 'european',
    asian: 'asian',
    azjatycka: 'asian',
    azjatka: 'asian',
    asiatisch: 'asian',
    latina: 'latina',
    latynoska: 'latina',
    black: 'black',
    czarna: 'black',
    schwarz: 'black',
    arabic: 'arabic',
    arabska: 'arabic',
    arabisch: 'arabic',
    slavic: 'slavic',
    slowianska: 'slavic',
    slawisch: 'slavic',
    mixed: 'mixed',
    mieszana: 'mixed',
    gemischt: 'mixed',
    other: 'other',
    inna: 'other',
    andere: 'other'
  };
  return aliases[key] || (profileEthnicityOptions.includes(key as any) ? key : '');
}

export function normalizeProfileTravels(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const key = normalizeKey(value);
  if (!key) return null;
  if (['true', '1', 'yes', 'tak', 'ja'].includes(key)) return true;
  if (['false', '0', 'no', 'nie', 'nein'].includes(key)) return false;
  return null;
}

export function showMaleProfileFields(profile: Partial<Profile>) {
  const hasLength = profile.penis_length_cm !== null && profile.penis_length_cm !== undefined && String(profile.penis_length_cm).trim() !== '';
  const hasDiameter = profile.penis_diameter_cm !== null && profile.penis_diameter_cm !== undefined && String(profile.penis_diameter_cm).trim() !== '';
  return normalizeProfileGender(profile.gender) === 'male'
    || hasLength
    || hasDiameter;
}

export function profileTravelsLabel(value: boolean | null | undefined, t: TFunction) {
  if (value === true) return t('profileDetails.yes');
  if (value === false) return t('profileDetails.no');
  return '';
}

export function profileDetailRows(profile: Profile, t: TFunction) {
  const gender = normalizeProfileGender(profile.gender);
  const orientation = normalizeProfileOrientation(profile.orientation);
  const ethnicity = normalizeProfileEthnicity(profile.ethnicity || profile.origin);
  const travels = normalizeProfileTravels(profile.travels ?? profile.travel);
  const rawGender = String(profile.gender || '').trim();
  const rawOrientation = String(profile.orientation || '').trim();
  const rawEthnicity = String(profile.ethnicity || profile.origin || '').trim();
  const rows = [
    gender || rawGender ? [t('profileDetails.gender'), gender ? t(`profileDetails.${gender}`) : rawGender] : null,
    orientation || rawOrientation ? [t('profileDetails.orientation'), orientation ? t(`profileDetails.${orientation}`) : rawOrientation] : null,
    travels !== null ? [t('profileDetails.travels'), profileTravelsLabel(travels, t)] : null,
    ethnicity || rawEthnicity ? [t('profileDetails.ethnicity'), ethnicity ? t(`profileDetails.${ethnicity}`) : rawEthnicity] : null,
    showMaleProfileFields(profile) && profile.penis_length_cm ? [t('profileDetails.penisLengthCm'), `${profile.penis_length_cm} cm`] : null,
    showMaleProfileFields(profile) && profile.penis_diameter_cm ? [t('profileDetails.penisDiameterCm'), `${profile.penis_diameter_cm} cm`] : null
  ];
  return rows
    .filter((row): row is string[] => Boolean(row))
    .map(([label, value]) => ({ label, value }));
}
