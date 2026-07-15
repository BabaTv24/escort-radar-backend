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
  declared_count: number | null;
  found_count: number;
  profile_urls: string[];
  warnings: string[];
};

type DiscoveryHtmlNode = {
  tag: string;
  attrs: string;
  children: Array<DiscoveryHtmlNode | string>;
  parent?: DiscoveryHtmlNode;
};

export type EscortClubListingExtraction = {
  declared_count: number | null;
  found_count: number;
  profile_urls: string[];
  warnings: string[];
  pagination_urls: string[];
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
  return extractEscortClubListing(html, listingUrl, maxProfiles).profile_urls;
}

export function extractEscortClubListing(html: string, listingUrl: string, maxProfiles: unknown = DEFAULT_PROFILE_LIMIT): EscortClubListingExtraction {
  const limit = normalizeCityImportLimit(maxProfiles);
  const base = new URL(listingUrl);
  const expectedCity = cityFromListingUrl(base);
  const root = parseDiscoveryHtml(html);
  const nodes = walkDiscoveryNodes(root);
  const declaredCount = extractDeclaredResultCount(html);
  const mainContainer = findMainResultsContainer(nodes, expectedCity);
  const warnings: string[] = [];
  if (!mainContainer) {
    return { declared_count: declaredCount, found_count: 0, profile_urls: [], warnings: ['main_results_container_not_found'], pagination_urls: [] };
  }
  if (!mainContainer.reliable) warnings.push('main_results_container_uncertain');

  const externalIds = new Set<string>();
  const normalizedUrls = new Set<string>();
  for (const card of findResultCards(mainContainer.node)) {
    const city = extractCardCity(card);
    if (city && city !== expectedCity) continue;
    const href = profileHrefFromCard(card);
    if (!href) continue;
    let candidate: URL;
    try {
      candidate = new URL(href, base);
    } catch {
      continue;
    }
    if (!isEscortClubProfileUrl(candidate)) continue;
    const externalId = candidate.pathname.match(/^\/anons\/(\d+)[.]html$/i)?.[1];
    if (!externalId || externalIds.has(externalId)) continue;
    const normalizedUrl = normalizeProfileSourceUrl(candidate.toString());
    if (normalizedUrls.has(normalizedUrl)) continue;
    externalIds.add(externalId);
    normalizedUrls.add(normalizedUrl);
  }

  const allUrls = [...normalizedUrls];
  if (declaredCount !== null && allUrls.length > declaredCount) warnings.push('found_more_than_declared');
  if (declaredCount !== null && allUrls.length < declaredCount) warnings.push('found_less_than_declared');
  if (allUrls.length > limit) warnings.push('profile_limit_reached');
  return {
    declared_count: declaredCount,
    found_count: allUrls.length,
    profile_urls: allUrls.slice(0, limit),
    warnings,
    pagination_urls: extractPaginationUrls(nodes, base)
  };
}

export function isEscortClubProfileUrl(value: string | URL) {
  let parsed: URL;
  try {
    parsed = value instanceof URL ? value : new URL(String(value || '').trim());
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return false;
  if (!isEscortClubHost(parsed.hostname.toLowerCase())) return false;
  const pathname = parsed.pathname.toLowerCase().replace(/\/{2,}/g, '/');
  return /^\/anons\/\d+[.]html$/.test(pathname);
}

export async function discoverCityProfiles(
  input: { listing_url: string; max_profiles?: unknown },
  dependencies: DiscoveryDependencies = {}
): Promise<CityImportDiscoveryResult> {
  const listingUrl = normalizeCityListingUrl(input.listing_url);
  const limit = normalizeCityImportLimit(input.max_profiles);
  const fetchResource = dependencies.fetchResource || fetchCityListingResource;
  const fetchListingHtml = async (url: string) => {
    let response: Response;
    try {
      response = await fetchResource(url, {
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
    return html;
  };

  const firstExtraction = extractEscortClubListing(await fetchListingHtml(listingUrl), listingUrl, limit);
  if (!firstExtraction.profile_urls.length) {
    throw new CityImportDiscoveryError('no_profiles_found', 'No public profile links were found on this city listing');
  }
  const profileUrls: string[] = [];
  const externalIds = new Set<string>();
  const warningSet = new Set(firstExtraction.warnings.filter((warning) => !/^found_(?:more|less)_than_declared$/.test(warning)));
  const pendingPages = [...firstExtraction.pagination_urls];
  const visitedPages = new Set([listingUrl]);
  const addProfiles = (urls: string[]) => {
    for (const url of urls) {
      const externalId = profileExternalId(url);
      if (!externalId || externalIds.has(externalId) || profileUrls.length >= limit) continue;
      externalIds.add(externalId);
      profileUrls.push(url);
    }
  };
  addProfiles(firstExtraction.profile_urls);

  while (pendingPages.length && profileUrls.length < limit
    && (firstExtraction.declared_count === null || profileUrls.length < firstExtraction.declared_count)) {
    const pageUrl = pendingPages.shift()!;
    if (visitedPages.has(pageUrl)) continue;
    visitedPages.add(pageUrl);
    const extraction = extractEscortClubListing(await fetchListingHtml(pageUrl), listingUrl, limit);
    addProfiles(extraction.profile_urls);
    extraction.warnings.filter((warning) => !/^found_(?:more|less)_than_declared$/.test(warning)).forEach((warning) => warningSet.add(warning));
    extraction.pagination_urls.forEach((url) => { if (!visitedPages.has(url)) pendingPages.push(url); });
  }

  const declaredCount = firstExtraction.declared_count;
  if (declaredCount !== null && profileUrls.length > declaredCount) warningSet.add('found_more_than_declared');
  if (declaredCount !== null && profileUrls.length < declaredCount && profileUrls.length < limit) warningSet.add('found_less_than_declared');
  const hasMoreValidResults = firstExtraction.warnings.includes('profile_limit_reached')
    || pendingPages.some((url) => !visitedPages.has(url))
    || (declaredCount !== null && declaredCount > profileUrls.length);
  if (profileUrls.length >= limit && hasMoreValidResults) warningSet.add('profile_limit_reached');
  return {
    listing_url: listingUrl,
    declared_count: declaredCount,
    found_count: profileUrls.length,
    profile_urls: profileUrls,
    warnings: [...warningSet]
  };
}

function parseDiscoveryHtml(html: string) {
  const safeHtml = html.replace(/<(?:script|style|noscript|template)\b[\s\S]*?<\/(?:script|style|noscript|template)>/gi, ' ');
  const root: DiscoveryHtmlNode = { tag: 'root', attrs: '', children: [] };
  const stack = [root];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const token of safeHtml.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[^>]+>|[^<]+/g) || []) {
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
      const node: DiscoveryHtmlNode = { tag: match[1].toLowerCase(), attrs: match[2] || '', children: [], parent };
      parent.children.push(node);
      if (!voidTags.has(node.tag) && !/\/\s*>$/.test(token)) stack.push(node);
      continue;
    }
    stack[stack.length - 1].children.push(token);
  }
  return root;
}

function walkDiscoveryNodes(root: DiscoveryHtmlNode) {
  const nodes: DiscoveryHtmlNode[] = [];
  const visit = (node: DiscoveryHtmlNode) => {
    nodes.push(node);
    for (const child of node.children) if (typeof child !== 'string') visit(child);
  };
  visit(root);
  return nodes;
}

function discoveryNodeText(node: DiscoveryHtmlNode): string {
  return node.children.map((child) => typeof child === 'string' ? decodeHtmlAttribute(child) : discoveryNodeText(child))
    .join(' ').replace(/\s+/g, ' ').trim();
}

function discoveryAttribute(node: DiscoveryHtmlNode, name: string) {
  const pattern = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = node.attrs.match(pattern);
  return decodeHtmlAttribute(match?.[1] || match?.[2] || match?.[3] || '').trim();
}

function hasDiscoveryClass(node: DiscoveryHtmlNode, value: string) {
  return discoveryAttribute(node, 'class').split(/\s+/).includes(value);
}

function cityFromListingUrl(url: URL) {
  const segment = url.pathname.split('/').filter(Boolean).at(-1) || '';
  try {
    return normalizeDiscoveryCity(decodeURIComponent(segment));
  } catch {
    return normalizeDiscoveryCity(segment);
  }
}

function normalizeDiscoveryCity(value: unknown) {
  return String(value || '').trim().toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '');
}

function findMainResultsContainer(nodes: DiscoveryHtmlNode[], expectedCity: string) {
  const headings = nodes.filter((node) => /^h[1-3]$/.test(node.tag) && headingMatchesListingCity(discoveryNodeText(node), expectedCity));
  for (const heading of headings) {
    let current = heading.parent;
    while (current && current.tag !== 'root') {
      if (['section', 'main', 'article'].includes(current.tag) && findResultCards(current).length) {
        const reliableClass = hasDiscoveryClass(current, 'content-sec') || hasDiscoveryClass(current, 'results') || hasDiscoveryClass(current, 'listing-results');
        return { node: current, reliable: reliableClass || current.tag === 'section' || current.tag === 'main' };
      }
      current = current.parent;
    }
  }

  const structural = nodes.find((node) => ['section', 'main'].includes(node.tag)
    && (hasDiscoveryClass(node, 'content-sec') || hasDiscoveryClass(node, 'listing-results'))
    && findResultCards(node).length);
  return structural ? { node: structural, reliable: false } : null;
}

function headingMatchesListingCity(value: string, expectedCity: string) {
  const heading = normalizeDiscoveryText(value);
  return heading.includes(expectedCity) && /(?:anonse|ogloszenia|anzeigen|personalads|escort|sexads)/.test(heading);
}

function normalizeDiscoveryText(value: unknown) {
  return String(value || '').trim().toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '');
}

function findResultCards(container: DiscoveryHtmlNode) {
  return walkDiscoveryNodes(container).filter((node) => {
    if (!['div', 'article', 'li'].includes(node.tag)) return false;
    const links = profileLinksInNode(node);
    if (new Set(links.map((link) => profileExternalId(link))).size !== 1) return false;
    const className = discoveryAttribute(node, 'class');
    if (/\b(?:item-col|listing-card|profile-card|result-card)\b/i.test(className)) return true;
    const descendants = walkDiscoveryNodes(node);
    return descendants.some((child) => /\bitem-info\b/i.test(discoveryAttribute(child, 'class')))
      && descendants.some((child) => child.tag === 'img');
  });
}

function profileLinksInNode(node: DiscoveryHtmlNode) {
  return walkDiscoveryNodes(node)
    .filter((child) => child.tag === 'a')
    .map((child) => discoveryAttribute(child, 'href'))
    .filter((href) => /(?:^|\/)anons\/\d+[.]html(?:[?#]|$)/i.test(href));
}

function profileExternalId(value: string) {
  return value.match(/(?:^|\/)anons\/(\d+)[.]html(?:[?#]|$)/i)?.[1] || '';
}

function profileHrefFromCard(card: DiscoveryHtmlNode) {
  return profileLinksInNode(card)[0] || '';
}

function extractCardCity(card: DiscoveryHtmlNode) {
  const dataCity = discoveryAttribute(card, 'data-city');
  if (dataCity) return normalizeDiscoveryCity(dataCity);
  const descendants = walkDiscoveryNodes(card);
  const stats = descendants.find((node) => /\b(?:item-stats|profile-city|card-city|location)\b/i.test(discoveryAttribute(node, 'class')));
  if (stats) return normalizeDiscoveryCity(discoveryNodeText(stats).split(',')[0]);
  const image = descendants.find((node) => node.tag === 'img' && /\bescort\b/i.test(discoveryAttribute(node, 'alt')));
  const altCity = discoveryAttribute(image || card, 'alt').match(/\bescort\s+([^|,]+)$/i)?.[1];
  return altCity ? normalizeDiscoveryCity(altCity) : '';
}

function extractDeclaredResultCount(html: string) {
  const text = decodeHtmlAttribute(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const patterns = [
    /lista\s+wynik[oó]w\s*:\s*(\d+)/i,
    /(?:ergebnisliste|suchergebnisse|ergebnisse)\s*:\s*(\d+)/i,
    /(?:results list|search results|results)\s*:\s*(\d+)/i
  ];
  for (const pattern of patterns) {
    const count = Number(text.match(pattern)?.[1]);
    if (Number.isInteger(count) && count >= 0) return count;
  }
  return null;
}

function extractPaginationUrls(nodes: DiscoveryHtmlNode[], base: URL) {
  const paginationContainers = nodes.filter((node) => {
    const className = discoveryAttribute(node, 'class');
    return ['nav', 'div', 'ul', 'ol'].includes(node.tag) && /\b(?:pagination|pager|paging)\b/i.test(className);
  });
  const links = paginationContainers.flatMap((container) => walkDiscoveryNodes(container))
    .filter((node) => node.tag === 'a')
    .map((node) => discoveryAttribute(node, 'href'));
  const unique = new Set<string>();
  for (const href of links) {
    if (!href) continue;
    try {
      const page = new URL(href, base);
      if (page.origin !== base.origin || normalizePath(page.pathname, true) !== normalizePath(base.pathname, true)) continue;
      if (![...page.searchParams.keys()].some((key) => /^(?:page|p)$/i.test(key))) continue;
      unique.add(normalizeCityListingUrl(page.toString()));
    } catch {
      // Ignore malformed and unsupported pagination links.
    }
  }
  unique.delete(normalizeCityListingUrl(base.toString()));
  return [...unique];
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
