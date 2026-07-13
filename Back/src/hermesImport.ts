import { allowedServiceKeys } from './serviceCatalog.js';
import { normalizeProfileEthnicity, normalizeProfileGender, normalizeProfileOrientation } from './validation.js';

export type ImportedDetails = {
  gender?: string; orientation?: string; age?: number; height_cm?: number; weight_kg?: number;
  bust?: string; eyes?: string; hair?: string; travel?: string; travels?: boolean;
  visit_types?: string[]; languages?: string[]; ethnicity?: string; nationality?: string; zodiac_sign?: string;
  unknown_fields: Record<string, string>;
};

export type EscortClubProfile = ImportedDetails & {
  name: string; display_name: string; phone_id?: string; city?: string; city_label?: string; category: string;
  height?: number;
  services: string[]; raw_services: string[]; unmapped_tags: string[];
  prices: Record<string, number>; price_1h?: number; currency?: string; images: string[];
};

export type ImportedPrice = { amount: number; currency: 'EUR' | 'PLN' | 'USD' | 'GBP' | 'CHF' };

export function normalizeImportedCity(value: unknown) {
  return String(value || '').trim().toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[łŁ]/g, 'l')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}

export function normalizeImportedCurrency(value: unknown): ImportedPrice['currency'] | '' {
  const token = String(value || '').trim().toUpperCase();
  if (token === '€' || token === 'EUR' || token === '&EURO;') return 'EUR';
  if (token === 'ZŁ' || token === 'ZL' || token === 'PLN') return 'PLN';
  if (token === '$' || token === 'USD') return 'USD';
  if (token === '£' || token === 'GBP') return 'GBP';
  if (token === 'CHF') return 'CHF';
  return '';
}

export function parseImportedPrice(value: unknown): ImportedPrice | null {
  const decoded = decodeImportHtml(String(value || '')).replace(/\s+/g, ' ');
  const match = decoded.match(/(?:^|[^\d])([0-9]{1,6}(?:[.,][0-9]{1,2})?)\s*(EUR|€|PLN|zł|zl|USD|\$|GBP|£|CHF)(?:\b|$)/i);
  if (!match) return null;
  const amount = Number(match[1].replace(',', '.'));
  const currency = normalizeImportedCurrency(match[2]);
  return Number.isFinite(amount) && amount >= 0 && currency ? { amount, currency } : null;
}

export function extractImportedProfileCity(html: string) {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const queue: unknown[] = [JSON.parse(decodeImportHtml(match[1]))];
      while (queue.length) {
        const item = queue.shift();
        if (Array.isArray(item)) { queue.push(...item); continue; }
        if (!item || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        const locality = String(record.addressLocality || '').trim();
        if (locality) return locality;
        queue.push(...Object.values(record));
      }
    } catch { /* malformed structured data is ignored */ }
  }
  const scoped = html.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1]
    || html.replace(/<(?:nav|aside|footer)\b[\s\S]*?<\/(?:nav|aside|footer)>/gi, '')
      .replace(/<[^>]+class=["'][^"']*(?:recommended|popular-cities)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, '');
  return decodeImportHtml(scoped.match(/<[^>]+class=["'][^"']*(?:content-location|profile-location|profile-city)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] || '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

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
    const catalogKey = value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const key = allowedServiceKeys.has(catalogKey) ? catalogKey : mappings.find(([pattern]) => pattern.test(value))?.[1];
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

export function parseEscortClubProfile(html: string, sourceUrl: string): EscortClubProfile | null {
  let parsedUrl: URL;
  try { parsedUrl = new URL(sourceUrl); } catch { return null; }
  const host = parsedUrl.hostname.toLowerCase();
  if (host !== 'escort.club' && !host.endsWith('.escort.club')) return null;

  const clean = (value: unknown) => decodeImportHtml(String(value || ''))
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const h1 = clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  const title = clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const seoName = title.replace(/\s+\d{2}\s+(?:lat|lata|years?|jahre?).*$/i, '').trim();
  const name = h1 || seoName;

  const aboutScope = html.match(/<div\b[^>]*class=["'][^"']*content-hours[^"']*["'][^>]*>([\s\S]*?)<div\b[^>]*class=["'][^"']*contant-prices/i)?.[1]
    || html.match(/Wi(?:ę|&#281;|&eogon;)cej o mnie[\s\S]*?<div\b[^>]*class=["'][^"']*stats-box[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1]
    || '';
  const pairs: Array<[string, string]> = [];
  for (const match of aboutScope.matchAll(/<div\b[^>]*class=["'][^"']*stat-elem[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>?/gi)) {
    const row = match[1];
    const label = clean(row.match(/class=["'][^"']*sub-label[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1]);
    const value = clean(row.match(/class=["'][^"']*sub-desc[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1]);
    if (label && value) pairs.push([label, value]);
  }
  // The language row contains additional nesting and can fall outside a shallow row match.
  for (const match of aboutScope.matchAll(/<div\b[^>]*class=["'][^"']*sub-label[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["'][^"']*sub-desc[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)) {
    const pair: [string, string] = [clean(match[1]), clean(match[2])];
    if (pair[0] && pair[1]) pairs.push(pair);
  }
  const details = normalizeImportedDetails(pairs);

  const priceScope = html.match(/<div\b[^>]*class=["'][^"']*contant-prices[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i)?.[1] || '';
  const priceText = clean(priceScope);
  const oneHourContext = priceText.match(/(?:^|\s)1\s*(?:godz|h|stunde|hour)[\s\S]{0,100}/i)?.[0]
    || priceText.match(/[\s\S]{0,100}(?:^|\s)1\s*(?:godz|h|stunde|hour)/i)?.[0];
  const importedPrice = parseImportedPrice(oneHourContext || priceText);
  const price1h = importedPrice?.amount;

  const infoScope = html.match(/<section\b[^>]*class=["'][^"']*anons-info-sec[^"']*["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] || '';
  const tagsScope = infoScope.match(/<div\b[^>]*class=["'][^"']*tags-box[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  const tagValues = [...tagsScope.matchAll(/<a\b[^>]*class=["'][^"']*\btag\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => clean(match[1])).filter(Boolean);
  const mapped = mapImportedServiceValues(tagValues);

  const galleryScope = html.match(/<ul\b[^>]*id=["']lightSlider["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || '';
  const imageValues: string[] = [];
  for (const match of galleryScope.matchAll(/<(?:a|img|li)\b[^>]*(?:href|src|data-thumb)=["']([^"']+)["'][^>]*>/gi)) {
    try {
      const absolute = new URL(decodeImportHtml(match[1]), sourceUrl).toString();
      if (/^https?:\/\//i.test(absolute) && /\/galleries\//i.test(absolute)) imageValues.push(absolute);
    } catch { /* ignore malformed gallery URL */ }
  }
  const phoneId = html.match(/data-phone-id=["'](\d+)["']/i)?.[1];
  const city = extractImportedProfileCity(html);

  return {
    name, display_name: name, phone_id: phoneId, city, city_label: city, category: 'ladies', ...details,
    height: details.height_cm,
    services: mapped.mapped, raw_services: mapped.raw, unmapped_tags: mapped.unmapped,
    prices: price1h ? { price_1h: price1h } : {}, price_1h: price1h, currency: importedPrice?.currency,
    images: [...new Set(imageValues)].slice(0, 12)
  };
}

function decodeImportHtml(value: string) {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", nbsp: ' ', eogon: 'ę', Eogon: 'Ę', lstrok: 'ł', Lstrok: 'Ł', oacute: 'ó', Oacute: 'Ó', sacute: 'ś', Sacute: 'Ś', zacute: 'ź', Zacute: 'Ź', zdot: 'ż', Zdot: 'Ż', cacute: 'ć', Cacute: 'Ć', nacute: 'ń', Nacute: 'Ń', aogon: 'ą', Aogon: 'Ą', euro: '€' };
  return value.replace(/&#(x?[0-9a-f]+);?/gi, (_match, code: string) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10)))
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name: string) => named[name] ?? match);
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
