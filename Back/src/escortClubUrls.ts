const ESCORT_CLUB_HOSTS = new Set(['pl.escort.club', 'pol.escort.club', 'de.escort.club']);
const POLISH_ESCORT_CLUB_HOSTS = new Set(['pl.escort.club', 'pol.escort.club']);

export function isSupportedEscortClubHost(hostname: string) {
  return ESCORT_CLUB_HOSTS.has(String(hostname || '').trim().toLowerCase());
}

export function isSupportedEscortClubListingUrl(value: string | URL) {
  const parsed = parseEscortClubUrl(value);
  if (!parsed) return false;
  const pathname = normalizeEscortClubPath(parsed.pathname);
  if (POLISH_ESCORT_CLUB_HOSTS.has(parsed.hostname.toLowerCase())) {
    return /^\/anonse\/towarzyskie\/[^/]+\/?$/i.test(pathname);
  }
  return /^\/erotikanzeigen\/(?!\d+[.]html\/?$)[^/]+\/?$/i.test(pathname);
}

export function escortClubProfileId(value: string | URL) {
  const parsed = parseEscortClubUrl(value);
  if (!parsed) return null;
  const pathname = normalizeEscortClubPath(parsed.pathname).replace(/\/+$/, '');
  const pattern = POLISH_ESCORT_CLUB_HOSTS.has(parsed.hostname.toLowerCase())
    ? /^\/anons\/(\d+)[.]html$/i
    : /^\/erotikanzeigen\/(\d+)[.]html$/i;
  return pathname.match(pattern)?.[1] || null;
}

export function isSupportedEscortClubProfileUrl(value: string | URL) {
  return escortClubProfileId(value) !== null;
}

function parseEscortClubUrl(value: string | URL) {
  let parsed: URL;
  try {
    parsed = value instanceof URL ? value : new URL(String(value || '').trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
  return isSupportedEscortClubHost(parsed.hostname) ? parsed : null;
}

function normalizeEscortClubPath(pathname: string) {
  return pathname.replace(/\/{2,}/g, '/');
}
