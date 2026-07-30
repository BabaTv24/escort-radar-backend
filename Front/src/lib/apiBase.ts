const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | boolean> }).env || {};

function isLocalFrontendHost() {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export const API_URL = isLocalFrontendHost()
  ? ''
  : String(viteEnv.VITE_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
