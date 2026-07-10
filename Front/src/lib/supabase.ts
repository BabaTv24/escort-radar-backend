import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';

const viteEnv = import.meta.env || {};
const nodeFallbackUrl = typeof window === 'undefined' ? 'https://example.supabase.co' : '';
const nodeFallbackAnonKey = typeof window === 'undefined' ? 'test-anon-key' : '';
const LOGIN_HANDOFF_KEY = 'escortRadar:loginSessionHandoff';
const loginHandoffMaxAgeMs = 120_000;

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

type LoginSessionHandoff = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  email?: string | null;
  expires_at?: number | null;
  created_at: number;
};

export function saveLoginSessionHandoff(session: Session) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      LOGIN_HANDOFF_KEY,
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user_id: session.user.id,
        email: session.user.email,
        expires_at: session.expires_at ?? null,
        created_at: Date.now()
      } satisfies LoginSessionHandoff)
    );
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[Login] failed to save session handoff', error);
    }
  }
}

export function clearLoginSessionHandoff() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(LOGIN_HANDOFF_KEY);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[Auth] failed to clear session handoff', error);
    }
  }
}

export async function restoreLoginSessionHandoff(): Promise<Session | null> {
  if (typeof window === 'undefined') return null;

  let handoff: LoginSessionHandoff | null = null;
  try {
    const raw = window.sessionStorage.getItem(LOGIN_HANDOFF_KEY);
    if (!raw) return null;
    handoff = JSON.parse(raw) as LoginSessionHandoff;
  } catch (error) {
    clearLoginSessionHandoff();
    if (import.meta.env.DEV) {
      console.warn('[Auth] failed to read session handoff', error);
    }
    return null;
  }

  if (
    !handoff?.access_token
    || !handoff.refresh_token
    || !handoff.user_id
    || !Number.isFinite(handoff.created_at)
    || Date.now() - handoff.created_at > loginHandoffMaxAgeMs
  ) {
    clearLoginSessionHandoff();
    return null;
  }

  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: handoff.access_token,
      refresh_token: handoff.refresh_token
    });
    if (error || !data.session || data.session.user.id !== handoff.user_id) {
      if (import.meta.env.DEV) {
        console.warn('[Auth] failed to restore session handoff', { hasSession: Boolean(data.session), error: error?.message || null });
      }
      return null;
    }
    return data.session;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[Auth] failed to restore session handoff', error);
    }
    return null;
  }
}
