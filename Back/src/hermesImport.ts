import { allowedServiceKeys } from './serviceCatalog.js';
import { normalizeProfileEthnicity, normalizeProfileGender, normalizeProfileOrientation } from './validation.js';

export type ImportedDetails = {
  gender?: string; orientation?: string; age?: number; height_cm?: number; weight_kg?: number;
  bust?: string; eyes?: string; hair?: string; travel?: string; travels?: boolean;
  visit_types?: string[]; languages?: string[]; ethnicity?: string; nationality?: string; zodiac_sign?: string;
  unknown_fields: Record<string, string>;
};

export function canLinkExistingImportedUser(user: { app_metadata?: Record<string, unknown> }, marker: string) {
  return user.app_metadata?.created_by === marker;
}

const labelAliases: Record<string, keyof Omit<ImportedDetails, 'unknown_fields'>> = {
  plec: 'gender', geschlecht: 'gender', gender: 'gender',
  orientacja: 'orientation', orientierung: 'orientation', orientation: 'orientation',
  wiek: 'age', alter: 'age', age: 'age',
  wzrost: 'height_cm', grosse: 'height_cm', groesse: 'height_cm', height: 'height_cm',
  waga: 'weight_kg', gewicht: 'weight_kg', weight: 'weight_kg',
  biust: 'bust', brust: 'bust', bust: 'bust',
  oczy: 'eyes', augen: 'eyes', eyes: 'eyes', augenfarbe: 'eyes',
  wlosy: 'hair', haare: 'hair', hair: 'hair', haarfarbe: 'hair',
  wyjazdy: 'travel', besuche: 'travel', travel: 'travel', outcall: 'travel',
  jezyki: 'languages', sprachen: 'languages', languages: 'languages',
  etnicznosc: 'ethnicity', ethnizitat: 'ethnicity', ethnicity: 'ethnicity',
  narodowosc: 'nationality', nationalitat: 'nationality', nationality: 'nationality',
  'znak zodiaku': 'zodiac_sign', sternzeichen: 'zodiac_sign', zodiac: 'zodiac_sign'
};

export function normalizeImportedPhone(value: unknown) {
  let decoded = String(value || '');
  try { decoded = decodeURIComponent(decoded); } catch { /* keep malformed visible input */ }
  const raw = decoded.trim().replace(/^tel:/i, '').split(/[?;]/)[0];
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  const normalized = hasPlus ? `+${digits}` : digits.startsWith('00') ? `+${digits.slice(2)}` : digits;
  const count = normalized.replace(/\D/g, '').length;
  return count >= 7 && count <= 15 ? normalized : '';
}

export function normalizeImportKey(value: unknown) {
  return String(value || '').replace(/:$/, '').trim().toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/ß/g, 'ss').replace(/\s+/g, ' ');
}

export function extractPublicPhone(html: string, visibleText: string) {
  const scope = html.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1] || html.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  const tel = scope.match(/<a\b[^>]*href=["']tel:([^"']+)["'][^>]*>/i)?.[1];
  const labelled = scope.match(/(?:telefon|phone|telefonnummer|mobil)[^<\d+]{0,40}(?:<[^>]+>\s*)*([+]?[\d][\d\s()./-]{6,}\d)/i)?.[1];
  let structured = '';
  for (const match of scope.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const values = Array.isArray(JSON.parse(match[1])) ? JSON.parse(match[1]) : [JSON.parse(match[1])];
      structured = values.map((item: any) => item?.telephone || item?.contactPoint?.telephone || '').find(Boolean) || '';
      if (structured) break;
    } catch { /* malformed public structured data is ignored */ }
  }
  const textPhone = visibleText.match(/(?:telefon|phone|telefonnummer|mobil)\s*:?\s*([+]?\d[\d\s()./-]{6,}\d)/i)?.[1]
    || visibleText.match(/(?:^|\n)([+]?\d[\d\s()./-]{7,}\d)(?:\n|$)/)?.[1];
  return [tel, labelled, structured, textPhone].map(normalizeImportedPhone).find(Boolean) || '';
}

export function extractImportPairs(html: string, visibleText = '') {
  const pairs: Array<[string, string]> = [];
  const push = (label: unknown, value: unknown) => {
    const key = String(label || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const item = String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (key && item && key.length <= 80 && item.length <= 300) pairs.push([key, item]);
  };
  for (const match of html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) push(match[1], match[2]);
  for (const match of html.matchAll(/<tr\b[^>]*>[\s\S]*?<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>[\s\S]*?<td\b[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi)) push(match[1], match[2]);
  for (const match of html.matchAll(/<(?:li|div|p)\b[^>]*>([^<>:\n]{2,80})\s*:\s*([^<>\n]{1,300})<\/(?:li|div|p)>/gi)) push(match[1], match[2]);
  for (const line of visibleText.split(/\n+/)) {
    const match = line.match(/^([^:]{2,80}):\s*(.{1,300})$/); if (match) push(match[1], match[2]);
  }
  return [...new Map(pairs.map(([key, value]) => [`${normalizeImportKey(key)}:${value}`, [key, value] as [string, string]])).values()];
}

export function normalizeImportedDetails(pairs: Array<[string, string]>): ImportedDetails {
  const result: ImportedDetails = { unknown_fields: {} };
  for (const [label, rawValue] of pairs) {
    const field = labelAliases[normalizeImportKey(label)];
    const value = rawValue.trim();
    if (!field) { result.unknown_fields[label.replace(/:$/, '').trim()] = value; continue; }
    if (field === 'age' || field === 'height_cm' || field === 'weight_kg') {
      const number = Number(value.match(/\d{2,3}/)?.[0]);
      if (Number.isFinite(number)) (result as any)[field] = number;
    } else if (field === 'gender') result.gender = normalizeProfileGender(value) || value;
    else if (field === 'orientation') result.orientation = normalizeProfileOrientation(value) || normalizeOrientation(value);
    else if (field === 'languages') result.languages = normalizeLanguages(value);
    else if (field === 'ethnicity') result.ethnicity = normalizeProfileEthnicity(value.split('(')[0].trim()) || value;
    else if (field === 'travel') Object.assign(result, normalizeTravel(value));
    else (result as any)[field] = value;
  }
  return result;
}

export function mapImportedServiceValues(values: unknown[]) {
  const mappings: Array<[RegExp, string]> = [
    [/erotische massage|massage/i, 'masaz'], [/girlfriend|gfe/i, 'klimat_gfe'],
    [/abendbegleitung|dinner|partybegleitung/i, 'wspolne_wyjscia'], [/reisebegleitung/i, 'wspolne_wyjazdy'],
    [/oralverkehr|oral/i, 'seks_oralny'], [/handjob/i, 'handjob'], [/striptease|striptiz/i, 'striptiz'],
    [/zungenk[uü]sse|kuss|poca[lł]unki/i, 'namietne_pocalunki'], [/kuscheln|przytulanie/i, 'przytulanie'],
    [/vaginal|klassisch/i, 'seks_klasyczny'], [/analverkehr|anal/i, 'seks_analny'], [/facesitting/i, 'facesitting'],
    [/deepthroat|deep throat/i, 'deep_throat'], [/rimming/i, 'rimming'], [/highheels/i, 'szpilki'],
    [/strapse|reizw[aä]sche|bielizna/i, 'seksowna_bielizna'], [/natursekt|pissing/i, 'pissing']
  ];
  const raw = [...new Set(values.map((item) => String(item || '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
  const mapped: string[] = [], unmapped: string[] = [];
  for (const value of raw) {
    const key = mappings.find(([pattern]) => pattern.test(value))?.[1];
    if (key && allowedServiceKeys.has(key)) mapped.push(key); else unmapped.push(value);
  }
  return { mapped: [...new Set(mapped)], raw, unmapped };
}

export function extractServiceTagCandidates(html: string) {
  const scope = html.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1] || '';
  const values: string[] = [];
  for (const match of scope.matchAll(/<[^>]+class=["'][^"']*(?:service|leistung|angebot|tag|badge|chip)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi)) {
    const text = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length >= 2 && text.length <= 80 && !/(navigation|menu|stadt|city|empfohlen|recommended)/i.test(text)) values.push(text);
  }
  return [...new Set(values)];
}

function normalizeOrientation(value: string) {
  const key = normalizeImportKey(value);
  if (/hetero|heterosexuell|straight/.test(key)) return 'heterosexual';
  if (/homo|homosexuell|gay/.test(key)) return 'homosexual';
  if (/^bi$|bisexuell|bisexual/.test(key)) return 'bisexual';
  return value;
}

function normalizeLanguages(value: string) {
  const aliases: Record<string, string> = { angielski: 'en', englisch: 'en', english: 'en', niemiecki: 'de', deutsch: 'de', german: 'de', polski: 'pl', polnisch: 'pl', polish: 'pl' };
  return [...new Set(value.split(/[,;/|]/).map((item) => aliases[normalizeImportKey(item)] || normalizeImportKey(item)).filter(Boolean))].slice(0, 8);
}

function normalizeTravel(value: string) {
  const key = normalizeImportKey(value);
  if (/tylko hotel|nur hotel|hotel only/.test(key)) return { travel: value, travels: false, visit_types: ['hotel'] };
  if (/nie|nein|no outcall/.test(key)) return { travel: value, travels: false };
  if (/tak|ja|yes|outcall|mobil/.test(key)) return { travel: value, travels: true };
  return { travel: value };
}
