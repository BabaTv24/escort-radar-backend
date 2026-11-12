import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { API_URL } from './apiBase';
import { loadPlatformStatus } from './platformStatus';

/**
 * Privacy-conscious analytics: no cookies, no browser storage, no identifiers.
 * Runs only on the production site, never under automation, and respects Do Not Track / GPC.
 * The server applies the same rules again (origin, bots, opt-out), so the client checks are only an optimisation.
 */
const PRODUCTION_HOSTS = ['escort-radar.fun', 'www.escort-radar.fun'];

export type TrafficEventType = 'page_view' | 'radar_view' | 'city_search' | 'profile_view' | 'premium_cta_click' | 'advertiser_cta_click';

function trackingAllowed() {
  if (typeof window === 'undefined' || !PRODUCTION_HOSTS.includes(window.location.hostname)) return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.webdriver) return false;
  if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return false;
  return true;
}

export function trackEvent(type: TrafficEventType, data: { path?: string; city?: string; profile_ref?: string; source?: string } = {}) {
  if (!trackingAllowed()) return;
  // Nothing is sent unless the server reports analytics collection as enabled (off until the privacy review).
  void loadPlatformStatus().then((status) => {
    if (status.analytics_enabled) sendEvent(type, data);
  });
}

function sendEvent(type: TrafficEventType, data: { path?: string; city?: string; profile_ref?: string; source?: string }) {
  try {
    void fetch(`${API_URL}/api/analytics/collect`, {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ type, ...data })
    }).catch(() => undefined);
  } catch {
    // Analytics must never affect the page.
  }
}

/** Route template + parameters; query strings and ids other than profile/city are never sent. */
export function describeRoute(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  const segments = pathname.split('/').filter(Boolean);
  const [first, second] = segments;
  if (!first) return { path: '/', radar: true };
  if (first === 'city' && second) return { path: '/city/:city', city: decodeURIComponent(second).toLowerCase(), radar: true };
  if (first === 'profile' && second) return { path: '/profile/:id', profileRef: decodeURIComponent(second) };
  if (first === 'r' && second) return { path: '/r/:code' };
  if (first === 'legal' && second) return { path: '/legal/:page' };
  if (first === 'pricing') {
    const product = params.get('product');
    return { path: '/pricing', premiumIntent: product === 'client_activation', advertiserIntent: product === 'advertiser_30d' };
  }
  if (first === 'register') {
    const type = params.get('type');
    return { path: '/register', premiumIntent: type === 'client', advertiserIntent: type === 'escort' };
  }
  const known = ['dashboard', 'login', 'tokens', 'coins', 'app', 'install', 'contact', 'terms', 'privacy', 'refund-policy', 'content-rules', 'report-abuse', 'imprint', 'legal-notice'];
  return { path: known.includes(first) ? `/${first}` : '/other' };
}

let firstPageView = true;

function trafficSource(search: string) {
  if (!firstPageView) return 'internal';
  const utm = new URLSearchParams(search).get('utm_source');
  if (utm) return utm.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 80) || 'direct';
  try {
    const host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '';
    if (!host || PRODUCTION_HOSTS.includes(host)) return 'direct';
    return host.replace(/^www\./, '').slice(0, 80);
  } catch {
    return 'direct';
  }
}

/** Records one page view per route change (and Radar, profile, intent events derived from the route). */
export function usePageTracking() {
  const location = useLocation();
  // Filter changes rewrite the query string; only the path and the intent parameters define a new page view.
  const params = new URLSearchParams(location.search);
  const viewKey = `${location.pathname}|${params.get('product') || ''}|${params.get('type') || ''}`;
  useEffect(() => {
    if (location.pathname === '/admin' || location.pathname.startsWith('/admin/')) return;
    const route = describeRoute(location.pathname, location.search);
    const source = trafficSource(location.search);
    firstPageView = false;
    trackEvent('page_view', { path: route.path, city: route.city, source });
    if (route.radar) trackEvent('radar_view', { path: route.path, city: route.city });
    if (route.profileRef) trackEvent('profile_view', { path: route.path, profile_ref: route.profileRef });
    if (route.premiumIntent) trackEvent('premium_cta_click', { path: route.path });
    if (route.advertiserIntent) trackEvent('advertiser_cta_click', { path: route.path });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);
}
