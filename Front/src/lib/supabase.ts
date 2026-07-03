import { createClient } from '@supabase/supabase-js';

const viteEnv = import.meta.env || {};
const nodeFallbackUrl = typeof window === 'undefined' ? 'https://example.supabase.co' : '';
const nodeFallbackAnonKey = typeof window === 'undefined' ? 'test-anon-key' : '';

export const supabase = createClient(
  viteEnv.VITE_SUPABASE_URL || nodeFallbackUrl,
  viteEnv.VITE_SUPABASE_ANON_KEY || nodeFallbackAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined
    }
  }
);
