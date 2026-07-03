const defaultNextPath = '/dashboard';

export function getSafeNextPath(searchParams: URLSearchParams): string {
  const rawNext = searchParams.get('next');
  if (!rawNext) return defaultNextPath;

  let next = rawNext.trim();
  try {
    next = decodeURIComponent(next);
  } catch {
    return defaultNextPath;
  }

  const lowerNext = next.toLowerCase();
  if (
    !next
    || !next.startsWith('/')
    || next.startsWith('//')
    || lowerNext.startsWith('http://')
    || lowerNext.startsWith('https://')
  ) {
    return defaultNextPath;
  }
  return next;
}
