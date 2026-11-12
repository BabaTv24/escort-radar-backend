import { createHash, randomBytes } from 'node:crypto';

/**
 * Privacy-conscious traffic analytics (ER-V1-PUBLIC-PREVIEW-001).
 * No cookies or browser storage; no IP, user agent, account or e-mail is stored.
 * The visitor hash uses a random salt per Berlin day that is destroyed after the next day.
 */
export const TRAFFIC_EVENT_TYPES = ['page_view', 'radar_view', 'city_search', 'profile_view', 'premium_cta_click', 'advertiser_cta_click'] as const;
export type TrafficEventType = typeof TRAFFIC_EVENT_TYPES[number];

export type TrafficEventRow = {
  event_type: TrafficEventType;
  path: string | null;
  city: string | null;
  profile_ref: string | null;
  source: string | null;
  device: 'mobile' | 'tablet' | 'desktop';
  country: string | null;
  visitor_hash: string;
};

export type CollectDecision = { accepted: true; row: Omit<TrafficEventRow, 'visitor_hash'> } | { accepted: false; reason: string };

const BOT_PATTERN = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|headless|phantomjs|selenium|webdriver|playwright|puppeteer|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python-requests|python-urllib|aiohttp|httpx|go-http-client|java\/|okhttp|node-fetch|axios|undici|postman|insomnia|libwww|scrapy/i;

export function isAutomatedUserAgent(userAgent: string | undefined) {
  const value = String(userAgent || '').trim();
  return !value || value.length < 20 || BOT_PATTERN.test(value);
}

export function deviceFromUserAgent(userAgent: string): 'mobile' | 'tablet' | 'desktop' {
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(userAgent)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|IEMobile|Opera Mini/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

/** Country only from an edge header (no GeoIP lookup, no IP stored). */
export function countryFromHeaders(headers: Record<string, string | string[] | undefined>) {
  for (const name of ['cf-ipcountry', 'x-vercel-ip-country', 'cloudfront-viewer-country', 'x-country-code']) {
    const raw = headers[name];
    const value = String(Array.isArray(raw) ? raw[0] : raw || '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(value) && !['XX', 'T1', 'ZZ'].includes(value)) return value;
  }
  return null;
}

/**
 * Client address used only as hash/limit input, never stored.
 * X-Forwarded-For entries left of the trusted proxies are supplied by the client and can be forged, so the address
 * is read at the position written by the nearest trusted proxy (hops from the right). An edge header such as
 * cf-connecting-ip is used only when explicitly configured.
 */
export function clientAddressFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  socketAddress: string | undefined,
  options: { trustedProxyHops?: number; clientIpHeader?: string } = {}
) {
  const header = (options.clientIpHeader || '').toLowerCase();
  if (header) {
    const raw = headers[header];
    const value = String(Array.isArray(raw) ? raw[0] : raw || '').trim();
    if (value) return value;
  }
  const hops = Math.max(0, Math.trunc(options.trustedProxyHops ?? 1));
  if (hops === 0) return socketAddress || '';
  const chain = String(headers['x-forwarded-for'] || '').split(',').map((item) => item.trim()).filter(Boolean);
  // With N trusted proxies, the N-th entry from the right was appended by our own edge and cannot be forged.
  return chain.length >= hops ? chain[chain.length - hops] : (socketAddress || '');
}

const PATH_PATTERN = /^\/[a-z0-9\-/:]{0,119}$/;
const CITY_PATTERN = /^[a-z0-9-]{2,80}$/;
const PROFILE_REF_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const SOURCE_PATTERN = /^[a-z0-9._-]{1,80}$/;

function cleanText(value: unknown, pattern: RegExp, lower = false) {
  if (typeof value !== 'string') return null;
  const text = (lower ? value.toLowerCase() : value).trim();
  return pattern.test(text) ? text : null;
}

/** Validates an event payload. Anything unexpected is dropped rather than stored. */
export function validateTrafficEvent(body: unknown, userAgent: string): CollectDecision {
  if (!body || typeof body !== 'object') return { accepted: false, reason: 'invalid_body' };
  const input = body as Record<string, unknown>;
  if (input.wd === true) return { accepted: false, reason: 'automation' };
  const type = String(input.type || '') as TrafficEventType;
  if (!TRAFFIC_EVENT_TYPES.includes(type)) return { accepted: false, reason: 'invalid_type' };
  const path = cleanText(input.path, PATH_PATTERN);
  // A supplied but malformed path (query strings, ids, anything unexpected) drops the whole event.
  if (input.path !== undefined && input.path !== null && !path) return { accepted: false, reason: 'invalid_path' };
  if (path && (path === '/admin' || path.startsWith('/admin/'))) return { accepted: false, reason: 'admin_path' };
  const city = cleanText(input.city, CITY_PATTERN, true);
  const profileRef = cleanText(input.profile_ref, PROFILE_REF_PATTERN);
  if (type === 'profile_view' && !profileRef) return { accepted: false, reason: 'missing_profile' };
  if (type === 'city_search' && !city) return { accepted: false, reason: 'missing_city' };
  return {
    accepted: true,
    row: {
      event_type: type,
      path,
      city,
      profile_ref: type === 'profile_view' ? profileRef : null,
      source: cleanText(input.source, SOURCE_PATTERN, true),
      device: deviceFromUserAgent(userAgent),
      country: null
    }
  };
}

export function berlinDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function newDailySalt() {
  return randomBytes(32).toString('hex');
}

export function visitorHash(salt: string, address: string, userAgent: string) {
  return createHash('sha256').update(`${salt}\u0000${address}\u0000${userAgent}`).digest('hex').slice(0, 32);
}

/** Raw event retention in days (covers the 30-day view and its previous 30-day comparison). */
export const TRAFFIC_RETENTION_DAYS = 60;

/**
 * Caps how many different pseudonymous visitors one network address can produce per day, so rotating the
 * User-Agent cannot inflate unique visitors. Kept in memory only, keyed by a salted digest of the address.
 */
export class DistinctVisitorCap {
  private readonly seen = new Map<string, Set<string>>();
  private day = '';
  constructor(private readonly maxPerAddress = 5) {}

  allow(day: string, addressKey: string, visitor: string) {
    if (day !== this.day) { this.seen.clear(); this.day = day; }
    let visitors = this.seen.get(addressKey);
    if (!visitors) { visitors = new Set(); this.seen.set(addressKey, visitors); }
    if (visitors.has(visitor)) return true;
    if (visitors.size >= this.maxPerAddress) return false;
    visitors.add(visitor);
    return true;
  }
}

/** Simple in-memory limiter so a single client cannot inflate the numbers. */
export class TrafficRateLimiter {
  private readonly buckets = new Map<string, { windowStart: number; count: number }>();
  constructor(private readonly limit = 120, private readonly windowMs = 10 * 60 * 1000) {}

  allow(key: string, now = Date.now()) {
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      this.buckets.set(key, { windowStart: now, count: 1 });
      if (this.buckets.size > 50_000) this.prune(now);
      return true;
    }
    bucket.count += 1;
    return bucket.count <= this.limit;
  }

  private prune(now: number) {
    for (const [key, bucket] of this.buckets) if (now - bucket.windowStart >= this.windowMs) this.buckets.delete(key);
  }
}
