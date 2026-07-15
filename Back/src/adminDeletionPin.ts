import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const deletionPinPattern = /^\d{6}$/;
export const deletionPinMaxAttempts = 5;
export const deletionPinLockMinutes = 15;

const scryptKeyLength = 64;
const scryptOptions = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };

export type AdminDeletionPinRecord = {
  admin_id: string;
  deletion_pin_hash: string;
  deletion_pin_updated_at: string;
  failed_attempts: number;
  attempt_window_started_at: string | null;
  locked_until: string | null;
};

export type AdminDeletionPinFailure = {
  failed_attempts: number;
  locked_until: string | null;
};

export interface AdminDeletionPinStore {
  get(adminId: string): Promise<AdminDeletionPinRecord | null>;
  save(adminId: string, hash: string, configured: boolean): Promise<AdminDeletionPinRecord>;
  recordFailure(adminId: string): Promise<AdminDeletionPinFailure>;
  resetFailures(adminId: string): Promise<void>;
}

export type AdminDeletionPinVerification =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 423 | 429; error: 'invalid_pin_format' | 'deletion_pin_not_configured' | 'invalid_deletion_pin' | 'deletion_pin_locked' | 'too_many_pin_attempts'; retryAfterMinutes?: number };

export function normalizeAdminId(value: string) {
  return String(value || '').trim().toLowerCase();
}

export function validateDeletionPin(value: unknown): value is string {
  return typeof value === 'string' && deletionPinPattern.test(value);
}

export async function hashDeletionPin(pin: string) {
  if (!validateDeletionPin(pin)) throw new Error('invalid_pin_format');
  const salt = randomBytes(16);
  const derived = await deriveScrypt(pin, salt);
  return `scrypt$v1$${scryptOptions.N}$${scryptOptions.r}$${scryptOptions.p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function compareDeletionPin(pin: string, storedHash: string) {
  if (!validateDeletionPin(pin)) return false;
  const [algorithm, version, n, r, p, saltValue, hashValue] = String(storedHash || '').split('$');
  if (algorithm !== 'scrypt' || version !== 'v1' || !saltValue || !hashValue) return false;
  const salt = Buffer.from(saltValue, 'base64');
  const expected = Buffer.from(hashValue, 'base64');
  if (!salt.length || expected.length !== scryptKeyLength) return false;
  const derived = await deriveScrypt(pin, salt, { N: Number(n), r: Number(r), p: Number(p), maxmem: scryptOptions.maxmem });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export async function verifyAdminDeletionPin(
  store: AdminDeletionPinStore,
  adminId: string,
  pin: unknown,
  now = new Date()
): Promise<AdminDeletionPinVerification> {
  if (!validateDeletionPin(pin)) return { ok: false, status: 400, error: 'invalid_pin_format' };
  const record = await store.get(normalizeAdminId(adminId));
  if (!record) return { ok: false, status: 403, error: 'deletion_pin_not_configured' };
  const lockedUntil = record.locked_until ? new Date(record.locked_until) : null;
  if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
    return { ok: false, status: 423, error: 'deletion_pin_locked', retryAfterMinutes: remainingMinutes(lockedUntil, now) };
  }
  if (!await compareDeletionPin(pin, record.deletion_pin_hash)) {
    const failure = await store.recordFailure(record.admin_id);
    const failureLockedUntil = failure.locked_until ? new Date(failure.locked_until) : null;
    if (failure.failed_attempts >= deletionPinMaxAttempts && failureLockedUntil) {
      return { ok: false, status: 429, error: 'too_many_pin_attempts', retryAfterMinutes: remainingMinutes(failureLockedUntil, now) };
    }
    return { ok: false, status: 403, error: 'invalid_deletion_pin' };
  }
  await store.resetFailures(record.admin_id);
  return { ok: true };
}

function deriveScrypt(pin: string, salt: Buffer, options = scryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(pin, salt, scryptKeyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function remainingMinutes(lockedUntil: Date, now: Date) {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
}
