import { allowedServiceKeys } from './serviceCatalog.js';
import { normalizeProfileEthnicity, normalizeProfileGender, normalizeProfileOrientation } from './validation.js';
import { isSupportedEscortClubProfileUrl } from './escortClubUrls.js';
import { resolvePolishCityCountryOverride } from './profileCountry.js';

export type ImportedDetails = {
  gender?: string; orientation?: string; age?: number; height_cm?: number; weight_kg?: number;
  bust?: string; eyes?: string; hair?: string; travel?: string; travels?: boolean;
  visit_types?: string[]; languages?: string[]; ethnicity?: string; nationality?: string; zodiac_sign?: string;
  unknown_fields: Record<string, string>;
};

export type EscortClubProfile = ImportedDetails & {
  name: string; display_name: string; phone_id?: string; city?: string; city_label?: string; country?: string; category: string;
  height?: number;
  description: string;
  opening_hours?: ImportedOpeningHours;
  admin_warnings: string[];
  services: string[]; raw_services: string[]; unmapped_tags: string[];
  prices: Record<string, number>;
  price_30min?: number; price_1h?: number; price_2h?: number; price_3h?: number; price_night?: number;
  currency?: string; images: string[];
};

export type ImportedOpeningHours = {
  version: 1;
  timezone: string;
  weekly: Record<ImportedDayKey, { enabled: boolean; start: string | null; end: string | null }>;
};

type ImportedDayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
type ImportHtmlNode = { tag: string; attrs: string; children: Array<ImportHtmlNode | string>; parent?: ImportHtmlNode };

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
  const decoded = decodeImportHtml(String(value || '')).replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/(?:do uzgodnienia|zapytaj|negocjacj|negotiable|auf anfrage)/i.test(normalizeImportKey(decoded))) return null;
  const match = decoded.match(/(?:^|[^\d])([0-9][0-9\s.,]{0,14}?)\s*(EUR|€|PLN|zł|zl|USD|\$|GBP|£|CHF)(?:\b|$)/i);
  if (!match) return null;
  const amount = parseImportedAmount(match[1]);
  const currency = normalizeImportedCurrency(match[2]);
  return Number.isFinite(amount) && amount > 0 && currency ? { amount, currency } : null;
}

function parseImportedAmount(value: string) {
  const compact = value.replace(/\s+/g, '');
  const separator = Math.max(compact.lastIndexOf(','), compact.lastIndexOf('.'));
  if (separator < 0) return Number(compact);
  const decimals = compact.length - separator - 1;
  if (decimals >= 1 && decimals <= 2) {
    return Number(`${compact.slice(0, separator).replace(/[.,]/g, '')}.${compact.slice(separator + 1)}`);
  }
  return Number(compact.replace(/[.,]/g, ''));
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
  const listingCities = [...scoped.matchAll(/<a\b[^>]*href=["'][^"']*\/(?:anonse\/towarzyskie|erotikanzeigen)\/[^/"']+\/["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => decodeImportHtml(match[1]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (listingCities.length) return listingCities.at(-1) || '';
  return decodeImportHtml(scoped.match(/<[^>]+class=["'][^"']*(?:content-location|profile-location|profile-city)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] || '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractImportedProfileCountry(html: string) {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const queue: unknown[] = [JSON.parse(decodeImportHtml(match[1]))];
      while (queue.length) {
        const item = queue.shift();
        if (Array.isArray(item)) { queue.push(...item); continue; }
        if (!item || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        const country = typeof record.addressCountry === 'object'
          ? String((record.addressCountry as Record<string, unknown>).addressCountry || (record.addressCountry as Record<string, unknown>).name || '')
          : String(record.addressCountry || '');
        const normalized = normalizeImportedCountry(country);
        if (normalized) return normalized;
        queue.push(...Object.values(record));
      }
    } catch { /* malformed structured data is ignored */ }
  }
  const breadcrumb = html.match(/<(?:nav|ol|ul|div)\b[^>]*class=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/(?:nav|ol|ul|div)>/i)?.[1] || '';
  for (const match of breadcrumb.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const normalized = normalizeImportedCountry(decodeImportHtml(match[1]).replace(/<[^>]+>/g, ' '));
    if (normalized) return normalized;
  }
  return '';
}

export function normalizeImportedCountry(value: unknown) {
  const key = normalizeImportKey(value);
  const aliases: Record<string, string> = {
    de: 'DE', germany: 'DE', deutschland: 'DE', niemcy: 'DE',
    pl: 'PL', poland: 'PL', polska: 'PL',
    cz: 'CZ', czechia: 'CZ', 'czech republic': 'CZ', czechy: 'CZ', 'republika czeska': 'CZ',
    nl: 'NL', netherlands: 'NL', nederland: 'NL', holandia: 'NL',
    at: 'AT', austria: 'AT', osterreich: 'AT'
  };
  return aliases[key] || '';
}

export function resolveImportedCountry(country: unknown, city: unknown) {
  const controlledOverride = resolvePolishCityCountryOverride(city);
  if (controlledOverride) return controlledOverride;
  const explicit = normalizeImportedCountry(country);
  if (explicit) return explicit;
  const cityKey = normalizeImportKey(city);
  if (cityKey === 'bonn') return 'DE';
  if (['prag', 'praga', 'praha', 'prague'].includes(cityKey)) return 'CZ';
  return '';
}

export function canLinkExistingImportedUser(user: { app_metadata?: Record<string, unknown> }, marker: string) {
  return user.app_metadata?.created_by === marker;
}

const labelAliases: Record<string, keyof Omit<ImportedDetails, 'unknown_fields'>> = {
  plec: 'gender', sex: 'gender', geschlecht: 'gender', gender: 'gender',
  orientacja: 'orientation', orientierung: 'orientation', orientation: 'orientation',
  wiek: 'age', alter: 'age', age: 'age',
  wzrost: 'height_cm', hohe: 'height_cm', grosse: 'height_cm', groesse: 'height_cm', height: 'height_cm',
  waga: 'weight_kg', 'das gewicht': 'weight_kg', gewicht: 'weight_kg', weight: 'weight_kg',
  biust: 'bust', buste: 'bust', brust: 'bust', bust: 'bust',
  oczy: 'eyes', augen: 'eyes', eyes: 'eyes', augenfarbe: 'eyes',
  wlosy: 'hair', haare: 'hair', hair: 'hair', haarfarbe: 'hair',
  wyjazdy: 'travel', reisen: 'travel', besuche: 'travel', travel: 'travel', outcall: 'travel',
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
  if (!isSupportedEscortClubProfileUrl(parsedUrl)) return null;

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
  const dom = parseImportHtml(html);
  const descriptionCandidate = extractEscortClubAbout(dom);
  const fallbackDescription = extractImportMetaDescription(html);
  const descriptionRejected = isEscortClubSeoBoilerplate(descriptionCandidate || fallbackDescription);
  const description = descriptionRejected ? '' : descriptionCandidate;
  const openingHours = extractEscortClubOpeningHours(dom, parsedUrl, city);
  const priceResult = extractEscortClubPrices(dom);

  return {
    name, display_name: name, phone_id: phoneId, city, city_label: city, category: 'ladies', ...details,
    height: details.height_cm,
    description,
    ...(openingHours ? { opening_hours: openingHours } : {}),
    admin_warnings: [...(descriptionRejected ? ['description_boilerplate_rejected'] : []), ...priceResult.warnings],
    services: mapped.mapped, raw_services: mapped.raw, unmapped_tags: mapped.unmapped,
    prices: priceResult.prices,
    price_30min: priceResult.prices.price_30min,
    price_1h: priceResult.prices.price_1h,
    price_2h: priceResult.prices.price_2h,
    price_3h: priceResult.prices.price_3h,
    price_night: priceResult.prices.price_night,
    currency: priceResult.currency,
    images: [...new Set(imageValues)].slice(0, 12)
  };
}

export function isEscortClubSeoBoilerplate(value: unknown) {
  const text = normalizeImportKey(value);
  return [
    'jezeli szukasz prywatnych anonsow',
    'najlepsze darmowe ogloszenia',
    'najlepsze anonse erotyczne',
    'escort club to serwis',
    'znajdz anonse erotyczne'
  ].some((phrase) => text.includes(phrase));
}

function parseImportHtml(html: string) {
  const root: ImportHtmlNode = { tag: 'root', attrs: '', children: [] };
  const stack = [root];
  const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for (const token of html.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('<!--') || /^<!/i.test(token)) continue;
    if (token.startsWith('</')) {
      const tag = token.match(/^<\/\s*([a-z0-9:-]+)/i)?.[1]?.toLowerCase();
      if (!tag) continue;
      const index = stack.map((node) => node.tag).lastIndexOf(tag);
      if (index > 0) stack.length = index;
      continue;
    }
    if (token.startsWith('<')) {
      const match = token.match(/^<\s*([a-z0-9:-]+)([\s\S]*?)\/?\s*>$/i);
      if (!match) continue;
      const parent = stack[stack.length - 1];
      const node: ImportHtmlNode = { tag: match[1].toLowerCase(), attrs: match[2] || '', children: [], parent };
      parent.children.push(node);
      if (!voidTags.has(node.tag) && !/\/\s*>$/.test(token)) stack.push(node);
      continue;
    }
    stack[stack.length - 1].children.push(token);
  }
  return root;
}

function importNodeText(node: ImportHtmlNode, preserveLines = false): string {
  if (['script','style','noscript','template'].includes(node.tag)) return '';
  const block = /^(?:address|article|aside|blockquote|div|dl|dt|dd|fieldset|figcaption|figure|footer|form|h[1-6]|header|li|main|nav|ol|p|section|table|tr|ul)$/.test(node.tag);
  const content = node.children.map((child) => typeof child === 'string' ? decodeImportHtml(child) : child.tag === 'br' ? '\n' : importNodeText(child, true)).join('');
  const rendered = block ? `\n${content}\n` : content;
  if (preserveLines) return rendered;
  return rendered.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

function importNodeKey(node: ImportHtmlNode) {
  return normalizeImportKey(importNodeText(node));
}

function isSemanticLabelNode(node: ImportHtmlNode) {
  return /^h[1-6]$/.test(node.tag) || /\b(?:heading|headline|label|title)\b/i.test(node.attrs);
}

function walkImportNodes(root: ImportHtmlNode) {
  const nodes: ImportHtmlNode[] = [];
  const visit = (node: ImportHtmlNode) => {
    nodes.push(node);
    for (const child of node.children) if (typeof child !== 'string') visit(child);
  };
  visit(root);
  return nodes;
}

type ImportedPriceKey = 'price_30min' | 'price_1h' | 'price_2h' | 'price_3h' | 'price_night';

function extractEscortClubPrices(root: ImportHtmlNode) {
  const nodes = walkImportNodes(root);
  const classScope = nodes.find((node) => /\b(?:contant-prices|content-prices|profile-prices|pricing)\b/i.test(node.attrs));
  const priceLabels = new Set(['ceny', 'cennik', 'prices', 'preise']);
  const heading = nodes.find((node) => isSemanticLabelNode(node) && priceLabels.has(importNodeKey(node)));
  const scope = classScope || heading?.parent;
  const prices: Partial<Record<ImportedPriceKey, number>> = {};
  const currencies: ImportedPrice['currency'][] = [];
  if (!scope) return { prices: prices as Record<string, number>, currency: undefined, warnings: [] as string[] };

  const rows = walkImportNodes(scope).filter((node) => node !== scope && (
    /\b(?:stat-elem|price-row|price-item)\b/i.test(node.attrs) || ['tr', 'li', 'p'].includes(node.tag)
  ));
  for (const row of rows) {
    const descendants = walkImportNodes(row);
    const labelNode = descendants.find((node) => /\b(?:sub-label|price-label|duration|label)\b/i.test(node.attrs));
    const valueNode = descendants.find((node) => /\b(?:sub-desc|price-value|amount|value)\b/i.test(node.attrs));
    const label = labelNode ? importNodeText(labelNode) : importNodeText(row);
    const key = importedPriceKeyForLabel(label);
    if (!key || prices[key] !== undefined) continue;
    const parsed = parseImportedPrice(valueNode ? importNodeText(valueNode) : importNodeText(row));
    if (!parsed) continue;
    prices[key] = parsed.amount;
    currencies.push(parsed.currency);
  }

  const currencyCounts = new Map<ImportedPrice['currency'], number>();
  for (const currency of currencies) currencyCounts.set(currency, (currencyCounts.get(currency) || 0) + 1);
  const currency = [...currencyCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  const warnings = currencyCounts.size > 1 ? ['mixed_price_currencies'] : [];
  return { prices: prices as Record<string, number>, currency, warnings };
}

function importedPriceKeyForLabel(value: string): ImportedPriceKey | null {
  const label = normalizeImportKey(value);
  if (/(?:^|\s)(?:30\s*(?:min|minut)|0[,.]5\s*(?:godz|h\b|hour|stund))/.test(label)) return 'price_30min';
  if (/(?:^|\s)(?:60\s*(?:min|minut)|1\s*(?:godz|godzina|h\b|hour|stund))/.test(label)) return 'price_1h';
  if (/(?:^|\s)(?:120\s*(?:min|minut)|2\s*(?:godz|godziny|h\b|hours?|stunden?))/.test(label)) return 'price_2h';
  if (/(?:^|\s)(?:180\s*(?:min|minut)|3\s*(?:godz|godziny|h\b|hours?|stunden?))/.test(label)) return 'price_3h';
  if (/(?:noc|cala noc|nacht|overnight|night|ubernachtung)/.test(label)) return 'price_night';
  return null;
}

const aboutLabels = new Set(['o mnie', 'about me', 'uber mich']);
const sectionBoundaryLabels = new Set([
  'wiecej informacji', 'dodatkowe informacje', 'more information', 'additional information', 'mehr informationen', 'zusatzliche information',
  'godziny dostepnosci', 'availability hours', 'opening hours', 'offnungszeiten', 'arbeitsstunden',
  'opinie', 'reviews', 'bewertungen', 'uslugi', 'services', 'leistungen'
]);

function extractEscortClubAbout(root: ImportHtmlNode) {
  const heading = walkImportNodes(root).find((node) => isSemanticLabelNode(node) && aboutLabels.has(importNodeKey(node)));
  if (!heading) return '';
  let anchor = heading;
  for (let depth = 0; depth < 4 && anchor.parent; depth += 1) {
    const siblings = anchor.parent.children;
    const index = siblings.indexOf(anchor);
    const fragments: string[] = [];
    for (const sibling of siblings.slice(index + 1)) {
      if (typeof sibling === 'string') {
        const text = decodeImportHtml(sibling).replace(/\s+/g, ' ').trim();
        if (text) fragments.push(text);
        continue;
      }
      if (containsSectionBoundary(sibling)) break;
      const text = importNodeText(sibling);
      if (text) fragments.push(text);
    }
    const description = cleanImportedParagraphs(fragments.join('\n'));
    if (description) return description;
    anchor = anchor.parent;
  }
  return '';
}

function containsSectionBoundary(node: ImportHtmlNode) {
  return walkImportNodes(node).some((candidate) => isSemanticLabelNode(candidate) && sectionBoundaryLabels.has(importNodeKey(candidate)));
}

function cleanImportedParagraphs(value: string) {
  return value.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && !aboutLabels.has(normalizeImportKey(line)))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractImportMetaDescription(html: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const field = tag.match(/\b(?:name|property)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (field !== 'description' && field !== 'og:description') continue;
    const content = tag.match(/\bcontent=["']([^"']*)["']/i)?.[1];
    if (content) return decodeImportHtml(content).replace(/\s+/g, ' ').trim();
  }
  return '';
}

const importedDayAliases: Array<[ImportedDayKey, string[]]> = [
  ['monday', ['poniedzialek','pon','monday','mon','montag','mo']],
  ['tuesday', ['wtorek','wt','tuesday','tue','tues','dienstag','di']],
  ['wednesday', ['sroda','sr','wednesday','wed','mittwoch','mi']],
  ['thursday', ['czwartek','czw','thursday','thu','thurs','donnerstag','do']],
  ['friday', ['piatek','pt','friday','fri','freitag','fr']],
  ['saturday', ['sobota','sob','saturday','sat','samstag','sa']],
  ['sunday', ['niedziela','niedz','nd','sunday','sun','sonntag','so']]
];

function extractEscortClubOpeningHours(root: ImportHtmlNode, sourceUrl: URL, city: string): ImportedOpeningHours | undefined {
  const openingLabels = new Set(['godziny dostepnosci','availability hours','opening hours','offnungszeiten','arbeitsstunden']);
  const heading = walkImportNodes(root).find((node) => isSemanticLabelNode(node) && openingLabels.has(importNodeKey(node)));
  if (!heading) return undefined;
  let anchor = heading;
  let parsed: Partial<Record<ImportedDayKey, { enabled: boolean; start: string | null; end: string | null }>> = {};
  for (let depth = 0; depth < 4 && anchor.parent && !Object.keys(parsed).length; depth += 1) {
    const siblings = anchor.parent.children;
    const index = siblings.indexOf(anchor);
    parsed = parseOpeningHourLines(siblings.slice(index + 1).map((item) => typeof item === 'string' ? decodeImportHtml(item) : importNodeText(item)).join('\n'));
    anchor = anchor.parent;
  }
  if (!Object.keys(parsed).length) return undefined;
  const inactive = () => ({ enabled: false, start: null, end: null });
  const weekly = Object.fromEntries(importedDayAliases.map(([day]) => [day, parsed[day] || inactive()])) as ImportedOpeningHours['weekly'];
  return { version: 1, timezone: escortClubTimezone(sourceUrl, city), weekly };
}

function parseOpeningHourLines(value: string) {
  const result: Partial<Record<ImportedDayKey, { enabled: boolean; start: string | null; end: string | null }>> = {};
  const lines = value.split(/\r?\n/).map((line) => normalizeImportKey(line).replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];
    if (!line) continue;
    if (importedDayAliases.some(([, aliases]) => aliases.includes(line.replace(/[.,:]$/, ''))) && lines[index + 1]) {
      line = `${line} ${lines[index + 1]}`;
      index += 1;
    }
    let matchedDay = false;
    for (const [day, aliases] of importedDayAliases) {
      const dayMatch = line.match(new RegExp(`^(?:${aliases.join('|')})(?:[.,:]\\s*|\\s+|$)`));
      if (!dayMatch) continue;
      matchedDay = true;
      const rest = line.slice(dayMatch[0].length).replace(/^\s+/, '');
      if (/^(?:nieczynne|zamkniete|niedostepna|niedostepny|closed|unavailable|geschlossen)\b/.test(rest)) {
        result[day] = { enabled: false, start: null, end: null };
        break;
      }
      if (isImportedAllDay(rest)) {
        result[day] = { enabled: true, start: '00:00', end: '00:00' };
        break;
      }
      const range = rest.match(/^(?:(?:od|von|from)\s+)?((?:[01]\d|2[0-3]):[0-5]\d)\s*(?:do|bis|to|-|–|—)\s*((?:[01]\d|2[0-3]):[0-5]\d)\b/);
      if (range) result[day] = { enabled: true, start: range[1], end: range[2] };
      break;
    }
    if (!matchedDay && isImportedAllDay(line)) {
      for (const [day] of importedDayAliases) result[day] = { enabled: true, start: '00:00', end: '00:00' };
    }
  }
  return result;
}

function isImportedAllDay(value: string) {
  const normalized = normalizeImportKey(value).replace(/\s+/g, ' ').trim();
  return /^(?:caly czas|cala dobe|24\s*h|24\s*\/\s*7|all day|全天|die ganze zeit|ganztagig|rund um die uhr)\b/.test(normalized);
}

function escortClubTimezone(sourceUrl: URL, city: string) {
  if (sourceUrl.hostname.toLowerCase().startsWith('pl.')) return 'Europe/Warsaw';
  if (sourceUrl.hostname.toLowerCase().startsWith('de.')) return 'Europe/Berlin';
  return /^(?:torun|warszawa|krakow|wroclaw|poznan|gdansk|lodz|szczecin|bydgoszcz|lublin)$/i.test(normalizeImportedCity(city))
    ? 'Europe/Warsaw'
    : 'Europe/Berlin';
}

function decodeImportHtml(value: string) {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", nbsp: ' ', eogon: 'ę', Eogon: 'Ę', lstrok: 'ł', Lstrok: 'Ł', oacute: 'ó', Oacute: 'Ó', sacute: 'ś', Sacute: 'Ś', zacute: 'ź', Zacute: 'Ź', zdot: 'ż', Zdot: 'Ż', cacute: 'ć', Cacute: 'Ć', nacute: 'ń', Nacute: 'Ń', aogon: 'ą', Aogon: 'Ą', auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', szlig: 'ß', euro: '€' };
  return value.replace(/&#(x?[0-9a-f]+);?/gi, (_match, code: string) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10)))
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name: string) => named[name] ?? match);
}

function normalizeOrientation(value: string) {
  const key = normalizeImportKey(value);
  if (/hetero|heterosexuell|straight/.test(key)) return 'hetero';
  if (/homo|homosexuell|gay/.test(key)) return 'homo';
  if (/^bi$|bisexuell|bisexual/.test(key)) return 'bi';
  return value;
}

function normalizeLanguages(value: string) {
  const aliases: Record<string, string> = { angielski: 'en', englisch: 'en', english: 'en', niemiecki: 'de', deutsch: 'de', german: 'de', polski: 'pl', polnisch: 'pl', polish: 'pl', franzosisch: 'fr', spanisch: 'es', italienisch: 'it', portugiesisch: 'pt', russisch: 'ru' };
  return [...new Set(value.split(/[,;/|]/).map((item) => aliases[normalizeImportKey(item)] || normalizeImportKey(item)).filter(Boolean))].slice(0, 8);
}

function normalizeTravel(value: string) {
  const key = normalizeImportKey(value);
  if (/tylko hotel|nur hotel|hotel only/.test(key)) return { travel: value, travels: false, visit_types: ['hotel'] };
  if (/nie|nein|no outcall/.test(key)) return { travel: value, travels: false };
  if (/tak|ja|yes|outcall|mobil/.test(key)) return { travel: value, travels: true };
  return { travel: value };
}
