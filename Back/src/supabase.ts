import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export const supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});

export const supabaseAnon = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: false }
});

export function publicStorageUrl(url: string): string {
  const browserBase = process.env.SUPABASE_PUBLIC_URL?.replace(/\/+$/, '');
  const internalBase = config.supabaseUrl.replace(/\/+$/, '');
  return browserBase && url.startsWith(`${internalBase}/`)
    ? `${browserBase}${url.slice(internalBase.length)}`
    : url;
}
