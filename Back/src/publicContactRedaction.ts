/**
 * Public-output safeguard (ER-V1-PUBLIC-PREVIEW-002).
 * Direct contact details typed into free text (phone numbers, e-mail, messenger handles and links) are masked in
 * anonymous/FREE payloads. The database keeps the original text; owners and admins read it unchanged, and
 * authorised Premium contact delivery stays on the protected /access endpoint.
 *
 * Precision over recall for ambiguous numbers: a bare digit run is masked only next to a contact word,
 * so prices, heights, times, dates and postal codes stay readable.
 */
export const CONTACT_MASK = '[…]';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CONTACT_LINK = /\b(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog|wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|instagram\.com|instagr\.am|snapchat\.com|onlyfans\.com|signal\.me|threema\.id|kik\.me|line\.me|viber\.click|m\.me)\/[^\s,;)]*/gi;
const AT_HANDLE = /(?<![\w.@])@[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,30}[A-Za-z0-9_])?/g;
const NAMED_HANDLE = /\b(telegram|tg|snapchat|snap|instagram|insta|signal|threema|kik|wickr|onlyfans|wechat|viber|skype|line)(\s*(?:id|name|nick)?\s*[:=]\s*)(?!\[…\])([A-Za-z0-9_.]{3,32})/gi;
const PREFIXED_PHONE = /(?<![\w+])(?:\+|00)\s?\d(?:[\s().\-\/]{0,3}\d){7,14}/g;
const LEADING_ZERO_PHONE = /(?<![\w+])0\d(?:[\s().\-\/]{0,3}\d){7,12}(?!\d)/g;
const BARE_DIGITS = /(?<![\w+])\d(?:[\s().\-\/]{0,3}\d){8,14}(?!\d)/g;
const CONTACT_WORD = /(tel\b|tel\.|telefon|phone|handy|mobil|mobile|nr\b|nr\.|numer|nummer|number|whats\s?app|\bwa\b|sms|call|anruf|zadzwo|dzwo|kontakt|contact|viber|signal|telegram)/i;
const DATE_LIKE = /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/;

const digitCount = (value: string) => (value.match(/\d/g) || []).length;

export function redactPublicContactText(input: unknown): { text: string; redactions: number } {
  if (typeof input !== 'string' || !input) return { text: typeof input === 'string' ? input : '', redactions: 0 };
  let redactions = 0;
  const mask = () => { redactions += 1; return CONTACT_MASK; };
  let text = input
    .replace(EMAIL, mask)
    .replace(CONTACT_LINK, mask)
    .replace(AT_HANDLE, mask)
    .replace(NAMED_HANDLE, (_m, keyword: string, separator: string) => { redactions += 1; return `${keyword}${separator}${CONTACT_MASK}`; });
  text = text.replace(PREFIXED_PHONE, (match) => {
    const digits = digitCount(match);
    return digits >= 8 && digits <= 15 ? mask() : match;
  });
  text = text.replace(LEADING_ZERO_PHONE, (match) => (DATE_LIKE.test(match) ? match : mask()));
  text = text.replace(BARE_DIGITS, (match, offset: number, whole: string) => {
    if (DATE_LIKE.test(match)) return match;
    const before = whole.slice(Math.max(0, offset - 40), offset);
    return CONTACT_WORD.test(before) ? mask() : match;
  });
  return { text, redactions };
}

/** Free-text fields of the public profile payload that may carry typed contact details. */
const PUBLIC_FREE_TEXT_FIELDS = ['description', 'availability_note', 'about', 'bio', 'tagline', 'headline', 'display_name'] as const;

export function redactPublicProfileText<T extends Record<string, any>>(profile: T): T {
  const result: Record<string, any> = { ...profile };
  for (const field of PUBLIC_FREE_TEXT_FIELDS) {
    if (typeof result[field] === 'string') result[field] = redactPublicContactText(result[field]).text;
  }
  if (Array.isArray(result.service_menu)) {
    result.service_menu = result.service_menu.map((item: any) => (item && typeof item === 'object'
      ? { ...item, ...(typeof item.note === 'string' ? { note: redactPublicContactText(item.note).text } : {}), ...(typeof item.name === 'string' ? { name: redactPublicContactText(item.name).text } : {}) }
      : item));
  }
  if (result.availability_hours && typeof result.availability_hours === 'object' && typeof result.availability_hours.note === 'string') {
    result.availability_hours = { ...result.availability_hours, note: redactPublicContactText(result.availability_hours.note).text };
  }
  return result as T;
}
