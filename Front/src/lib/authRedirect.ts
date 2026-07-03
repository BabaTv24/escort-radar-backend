import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

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

export async function waitForSupabaseSession(maxAttempts = 5, delayMs = 180): Promise<Session | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data } = await withTimeout(supabase.auth.getSession(), 2500, 'Session check timed out');
    if (data.session) return data.session;
    if (attempt < maxAttempts - 1) await wait(delayMs);
  }
  return null;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = 'Request timed out'
): Promise<T> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
