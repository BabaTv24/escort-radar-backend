import { useEffect, useState } from 'react';
import { API_URL } from './apiBase';

export type PlatformStatus = {
  mode: 'public_preview' | 'commercial';
  commercial_operations_enabled: boolean;
  advertiser_registration_open: boolean;
  purchases_enabled: boolean;
  analytics_enabled: boolean;
};

/** Until the server answers, the UI assumes the public preview (the server default). Enforcement is server-side. */
export const PUBLIC_PREVIEW_STATUS: PlatformStatus = {
  mode: 'public_preview',
  commercial_operations_enabled: false,
  advertiser_registration_open: false,
  purchases_enabled: false,
  analytics_enabled: false
};

let pending: Promise<PlatformStatus> | null = null;

export function loadPlatformStatus() {
  pending ||= fetch(`${API_URL}/api/platform/status`, { credentials: 'omit' })
    .then((response) => (response.ok ? response.json() : PUBLIC_PREVIEW_STATUS))
    .then((value: PlatformStatus) => ({ ...PUBLIC_PREVIEW_STATUS, ...value }))
    .catch(() => {
      pending = null;
      return PUBLIC_PREVIEW_STATUS;
    });
  return pending;
}

export function usePlatformStatus() {
  const [status, setStatus] = useState<PlatformStatus & { loaded: boolean }>({ ...PUBLIC_PREVIEW_STATUS, loaded: false });
  useEffect(() => {
    let active = true;
    loadPlatformStatus().then((value) => { if (active) setStatus({ ...value, loaded: true }); });
    return () => { active = false; };
  }, []);
  return status;
}
