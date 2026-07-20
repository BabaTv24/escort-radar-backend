export const adminSessionStorageKey = 'escort-radar-admin-token';

type AdminTokenPayload = {
  exp?: number;
  type?: string;
  role?: string;
  admin?: boolean;
};

export const adminSession = {
  read(storage: Storage = window.localStorage) {
    const token = storage.getItem(adminSessionStorageKey)?.trim() || '';
    if (!token) return '';

    try {
      const payload = readPayload(token);
      const expired = !payload.exp || payload.exp <= Math.floor(Date.now() / 1000);
      const invalid = payload.type !== 'admin_session' || payload.role !== 'admin' || payload.admin !== true;
      if (expired || invalid) {
        storage.removeItem(adminSessionStorageKey);
        return '';
      }
      return token;
    } catch {
      storage.removeItem(adminSessionStorageKey);
      return '';
    }
  },

  write(token: string, storage: Storage = window.localStorage) {
    storage.setItem(adminSessionStorageKey, token);
  },

  clear(storage: Storage = window.localStorage) {
    storage.removeItem(adminSessionStorageKey);
  }
};

function readPayload(token: string): AdminTokenPayload {
  const encodedPayload = token.split('.')[1];
  if (!encodedPayload) throw new Error('Invalid admin token');
  const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return JSON.parse(globalThis.atob(padded)) as AdminTokenPayload;
}
