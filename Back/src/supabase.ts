import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export const supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});

export const supabaseAnon = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: false },
  global: { fetch: normalizeLocalSignupResponse }
});

export function publicStorageUrl(url: string): string {
  const browserBase = process.env.SUPABASE_PUBLIC_URL?.replace(/\/+$/, '');
  const internalBase = config.supabaseUrl.replace(/\/+$/, '');
  return browserBase && url.startsWith(`${internalBase}/`)
    ? `${browserBase}${url.slice(internalBase.length)}`
    : url;
}

async function normalizeLocalSignupResponse(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (!response.ok || init?.method !== 'POST' || !String(input).split('?')[0].endsWith('/auth/v1/signup')) return response;

  const body = await response.clone().json();
  if (!body?.id || body.user || body.access_token) return response;

  // Local GoTrue returns the unconfirmed user at the top level. auth-js expects { user }.
  return new Response(JSON.stringify({ user: body, session: null }), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}
