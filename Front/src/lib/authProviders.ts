import { useEffect, useState } from 'react';

type ProviderState = 'checking' | 'enabled' | 'disabled';

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
let settingsRequest: Promise<Record<string, boolean>> | null = null;

/**
 * Reads the public Supabase Auth settings once per page load. signInWithOAuth redirects the browser
 * straight to GoTrue, which answers a disabled provider with a raw 400 JSON page; checking first keeps
 * visitors on the app and shows a clear unavailable state instead.
 */
function loadExternalProviders() {
  if (!settingsRequest) {
    const url = String(viteEnv.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
    const anonKey = String(viteEnv.VITE_SUPABASE_ANON_KEY || '');
    settingsRequest = url && anonKey
      ? fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } })
        .then((response) => (response.ok ? response.json() : {}))
        .then((body: { external?: Record<string, boolean> }) => body.external || {})
        .catch(() => ({}))
      : Promise.resolve({});
  }
  return settingsRequest;
}

export function useOAuthProvider(provider: 'google'): ProviderState {
  const [state, setState] = useState<ProviderState>('checking');
  useEffect(() => {
    let active = true;
    loadExternalProviders().then((external) => {
      if (active) setState(external[provider] === true ? 'enabled' : 'disabled');
    });
    return () => { active = false; };
  }, [provider]);
  return state;
}

/** Set after a customer registers; the dashboard sends a not-yet-activated customer to the Premium checkout once. */
export const PREMIUM_CHECKOUT_INTENT_KEY = 'escortRadar.premiumCheckoutIntent';
