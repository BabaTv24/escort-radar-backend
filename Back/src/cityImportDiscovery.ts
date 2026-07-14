import {
  assertPublicImportDns,
  readImportResponseLimited,
  validatePublicImportUrl
} from './publicImportSecurity.js';

export type CityImportDiscoveryErrorCode =
  | 'invalid_url'
  | 'unsupported_host'
  | 'unsupported_listing'
  | 'blocked_address'
  | 'fetch_timeout'
  | 'fetch_failed'
  | 'captcha_or_protection_detected'
  | 'no_profiles_found'
  | 'html_too_large';

export class CityImportDiscoveryError extends Error {
  constructor(public readonly code: CityImportDiscoveryErrorCode, message: string) {
    super(message);
    this.name = 'CityImportDiscoveryError';
  }
}

export type CityImportDiscoveryResult = {
  listing_url: string;
  found_count: number;
  profile_urls: string[];
  warnings: string[];
};

type DiscoveryDependencies = {
  fetchResource?: (value: string, init: RequestInit) => Promise<Response>;
};

const DEFAULT_PROFILE_LIMIT = 30;
const MAX_PROFILE_LIMIT = 50;
const MAX_HTML_BYTES = 1024 * 1024;
const TRACKING_PARAMETERS = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid', 'ref', 'referrer', 'source', 'campaign'
]);

export function normalizeCityImportLimit(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_PROFILE_LIMIT;
  return Math.min(MAX_PROFILE_LIMIT, Math.max(1, Math.floor(numeric)));
}

export function normalizeCityListingUrl(value: string) {
  const raw = String(value || '').trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CityImportDiscoveryError('invalid_url', 'A valid HTTP or HTTPS listing URL is required');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new CityImportDiscoveryError('invalid_url', 'Only HTTP/HTTPS URLs without credentials are supported');
  }

  const publicUrlError = validatePublicImportUrl(parsed.toString());
  if (publicUrlError) {
    throw new CityImportDiscoveryError('blocked_address', publicUrlError);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!isEscortClubHost(hostname)) {
    throw new CityImportDiscoveryError('unsupported_host', 'Only public escort.club city listings are supported');
  }

  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  if (pathSegments[0]?.toLowerCase() !== 'anonse' || pathSegments.length < 3) {
    throw new CityImportDiscoveryError('unsupported_listing', 'The URL must point to an escort.club city listing');
  }

  parsed.hash = '';
  removeTrackingParameters(parsed);
  parsed.pathname = normalizePath(parsed.pathname, true);
  return parsed.toString();
}

export function normalizeProfileSourceUrl(value: string) {
  const raw = String(value || '').trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CityImportDiscoveryError('invalid_url', 'A valid HTTP or HTTPS profile URL is required');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new CityImportDiscoveryError('invalid_url', 'Only HTTP/HTTPS profile URLs without credentials are supported');
  }
  parsed.hash = '';
  removeTrackingParameters(parsed);
  parsed.pathname = normalizePath(parsed.pathname, false);
  return parsed.toString();
}

export function isSourceUrlDuplicateError(error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined) {
  if (error?.code !== '23505') return false;
  return /source_url_normalized|profiles_source_url_normalized_unique_idx/i.test([
    error.message,
    error.details,
    error.hint
  ].filter(Boolean).join(' '));
}

export function extractEscortClubProfileUrls(html: string, listingUrl: string, maxProfiles: unknown = DEFAULT_PROFILE_LIMIT) {
  const limit = normalizeCityImportLimit(maxProfiles);
  const base = new URL(listingUrl);
  const unique = new Set<string>();
  const linkPattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) && unique.size < limit) {
    const href = decodeHtmlAttribute(match[1] || match[2] || match[3] || '').trim();
    if (!href) continue;
    let candidate: URL;
    try {
      candidate = new URL(href, base);
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(candidate.protocol) || candidate.username || candidate.password) continue;
    if (!isEscortClubHost(candidate.hostname.toLowerCase())) continue;
    if (!isEscortClubProfilePath(candidate.pathname)) continue;

    unique.add(normalizeProfileSourceUrl(candidate.toString()));
  }

  return [...unique];
}

export async function discoverCityProfiles(
  input: { listing_url: string; max_profiles?: unknown },
  dependencies: DiscoveryDependencies = {}
): Promise<CityImportDiscoveryResult> {
  const listingUrl = normalizeCityListingUrl(input.listing_url);
  const limit = normalizeCityImportLimit(input.max_profiles);
  const fetchResource = dependencies.fetchResource || fetchCityListingResource;
  let response: Response;

  try {
    response = await fetchResource(listingUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'accept-language': 'pl-PL,pl;q=0.9,de;q=0.7,en;q=0.6',
        'user-agent': 'EscortRadar-CityDiscovery/1.0 (+https://escort-radar.fun)'
      },
      signal: AbortSignal.timeout(10_000)
    });
  } catch (error) {
    if (error instanceof CityImportDiscoveryError) throw error;
    const message = error instanceof Error ? error.message : 'Could not fetch city listing';
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new CityImportDiscoveryError('fetch_timeout', 'City listing request timed out');
    }
    if (/abort|timeout/i.test(message)) throw new CityImportDiscoveryError('fetch_timeout', 'City listing request timed out');
    if (/non-public|public pages|unsafe redirect/i.test(message)) throw new CityImportDiscoveryError('blocked_address', message);
    throw new CityImportDiscoveryError('fetch_failed', message);
  }

  if (!response.ok) {
    if ([403, 429, 503].includes(response.status)) {
      throw new CityImportDiscoveryError('captcha_or_protection_detected', `Listing access was blocked with HTTP ${response.status}`);
    }
    throw new CityImportDiscoveryError('fetch_failed', `City listing returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    throw new CityImportDiscoveryError('unsupported_listing', 'The listing did not return public HTML');
  }

  let html: string;
  try {
    html = new TextDecoder().decode(await readImportResponseLimited(response, MAX_HTML_BYTES));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read city listing';
    if (/larger than/i.test(message)) throw new CityImportDiscoveryError('html_too_large', message);
    throw new CityImportDiscoveryError('fetch_failed', message);
  }

  if (detectAccessProtection(html)) {
    throw new CityImportDiscoveryError('captcha_or_protection_detected', 'The public page requires CAPTCHA or anti-bot verification');
  }

  const profileUrls = extractEscortClubProfileUrls(html, listingUrl, limit);
  if (!profileUrls.length) {
    throw new CityImportDiscoveryError('no_profiles_found', 'No public profile links were found on this city listing');
  }

  const warnings = profileUrls.length >= limit ? ['profile_limit_reached'] : [];
  return {
    listing_url: listingUrl,
    found_count: profileUrls.length,
    profile_urls: profileUrls,
    warnings
  };
}

function isEscortClubHost(hostname: string) {
  return hostname === 'escort.club' || hostname.endsWith('.escort.club');
}

async function fetchCityListingResource(value: string, init: RequestInit, redirects = 0): Promise<Response> {
  const safetyError = validatePublicImportUrl(value);
  if (safetyError) throw new Error(safetyError);
  const parsed = new URL(value);
  if (!isEscortClubHost(parsed.hostname.toLowerCase())) {
    throw new CityImportDiscoveryError('unsupported_host', 'City listing redirect left the supported escort.club host');
  }
  await assertPublicImportDns(value);
  const response = await fetch(value, { ...init, redirect: 'manual' });
  if (response.status < 300 || response.status >= 400) return response;
  if (redirects >= 3) throw new Error('Too many redirects');
  const location = response.headers.get('location');
  if (!location) throw new Error('Redirect did not include a location');
  const next = new URL(location, value).toString();
  return fetchCityListingResource(next, init, redirects + 1);
}

function isEscortClubProfilePath(pathname: string) {
  const normalized = pathname.toLowerCase().replace(/\/{2,}/g, '/');
  return /^\/anons\/[^/]+(?:\.html)?\/?$/.test(normalized);
}

function normalizePath(pathname: string, trailingSlash: boolean) {
  const collapsed = pathname.replace(/\/{2,}/g, '/');
  const withoutTrailing = collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed;
  return trailingSlash ? `${withoutTrailing}/` : withoutTrailing;
}

function removeTrackingParameters(url: URL) {
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMETERS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
}

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x2f;/gi, '/')
    .replace(/&#47;/g, '/');
}

function detectAccessProtection(html: string) {
  const sample = html.slice(0, 250_000).toLowerCase();
  return [
    'cf-chl-',
    'cloudflare challenge',
    'captcha',
    'verify you are human',
    'sprawdź, czy jesteś człowiekiem',
    'access denied',
    'too many requests'
  ].some((marker) => sample.includes(marker));
}
