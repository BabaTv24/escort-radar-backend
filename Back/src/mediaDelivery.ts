import crypto from 'crypto';
import type { Request, Response } from 'express';
import { config } from './config.js';
import { publicStorageUrl, supabaseAdmin } from './supabase.js';

/**
 * Authorized delivery of profile-images objects.
 *
 * With MEDIA_SIGNED_DELIVERY=true the backend never hands out permanent public Storage URLs. Every image
 * URL is a backend link carrying an HMAC over the storage path and an expiry, issued only by the code path
 * that already decided the caller may see that image (public cover, Premium gallery, owner, admin). The
 * link redirects to a short-lived Supabase signed URL, so the bucket can be private and the old public
 * object URLs stop working. With the flag off the legacy public URL is returned unchanged.
 */
export type MediaAccess = 'public' | 'protected';

const PUBLIC_TTL_SECONDS = 7 * 24 * 3600;
const PUBLIC_WINDOW_SECONDS = 24 * 3600;
const PROTECTED_TTL_SECONDS = 3600;
const PROTECTED_WINDOW_SECONDS = 15 * 60;
const SIGNED_URL_SECONDS = 3600;
const SIGNED_URL_REUSE_SECONDS = 3000;
const MEDIA_ROUTE = '/api/media/image';

export function mediaSignedDeliveryEnabled() {
  return process.env.MEDIA_SIGNED_DELIVERY === 'true';
}

function mediaSecret() {
  return process.env.MEDIA_URL_SECRET || '';
}

function mediaApiBase() {
  const explicit = process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || '';
  if (explicit) return explicit.replace(/\/+$/, '');
  return config.nodeEnv === 'production' ? '' : `http://127.0.0.1:${process.env.PORT || 4000}`;
}

/** Fails the boot when signed delivery is requested without the settings it needs (fail closed, no silent fallback). */
export function assertMediaDeliveryConfig() {
  if (!mediaSignedDeliveryEnabled()) return;
  if (mediaSecret().length < 32) throw new Error('MEDIA_SIGNED_DELIVERY=true requires MEDIA_URL_SECRET with at least 32 characters');
  if (!mediaApiBase()) throw new Error('MEDIA_SIGNED_DELIVERY=true requires PUBLIC_API_URL (or RENDER_EXTERNAL_URL)');
}

function signature(storagePath: string, expiresAt: number) {
  return crypto.createHmac('sha256', mediaSecret()).update(`${config.storageBucket}\n${storagePath}\n${expiresAt}`).digest('base64url');
}

function legacyPublicUrl(storagePath: string) {
  const { data } = supabaseAdmin.storage.from(config.storageBucket).getPublicUrl(storagePath);
  return publicStorageUrl(data.publicUrl);
}

/** URL for one storage object. Callers must only pass paths the current viewer is allowed to see. */
export function storageImageUrl(storagePath: string | null | undefined, access: MediaAccess = 'protected', now = Date.now()): string {
  const path = String(storagePath || '');
  if (!path) return '';
  if (!mediaSignedDeliveryEnabled()) return legacyPublicUrl(path);
  const ttl = access === 'public' ? PUBLIC_TTL_SECONDS : PROTECTED_TTL_SECONDS;
  const window = access === 'public' ? PUBLIC_WINDOW_SECONDS : PROTECTED_WINDOW_SECONDS;
  // Rounded expiry keeps the URL stable inside a window, so browsers and CDNs can cache it.
  const expiresAt = Math.ceil((Math.floor(now / 1000) + ttl) / window) * window;
  const query = new URLSearchParams({ p: path, e: String(expiresAt), s: signature(path, expiresAt) });
  return `${mediaApiBase()}${MEDIA_ROUTE}?${query.toString()}`;
}

/** Maps a stored legacy public object URL of the profile bucket to an authorized URL; other URLs are returned unchanged. */
export function deliverableStorageUrl(url: string | null | undefined, access: MediaAccess = 'protected'): string | null {
  if (!url) return url ?? null;
  const marker = `/storage/v1/object/public/${config.storageBucket}/`;
  const index = url.indexOf(marker);
  if (index < 0 || !mediaSignedDeliveryEnabled()) return url;
  const path = decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
  return storageImageUrl(path, access);
}

export function verifyMediaSignature(storagePath: string, expiresAt: number, provided: string, now = Date.now()) {
  if (!storagePath || !Number.isFinite(expiresAt) || expiresAt * 1000 <= now || !provided) return false;
  const expected = Buffer.from(signature(storagePath, expiresAt));
  const actual = Buffer.from(provided);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const signedUrlCache = new Map<string, { url: string; reuseUntil: number }>();

async function supabaseSignedUrl(storagePath: string) {
  const cached = signedUrlCache.get(storagePath);
  if (cached && cached.reuseUntil > Date.now()) return cached.url;
  const { data, error } = await supabaseAdmin.storage.from(config.storageBucket).createSignedUrl(storagePath, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  const url = publicStorageUrl(data.signedUrl);
  if (signedUrlCache.size > 20000) signedUrlCache.clear();
  signedUrlCache.set(storagePath, { url, reuseUntil: Date.now() + SIGNED_URL_REUSE_SECONDS * 1000 });
  return url;
}

export async function mediaImageHandler(req: Request, res: Response) {
  res.set('Referrer-Policy', 'no-referrer');
  // helmet defaults to same-origin; the frontend runs on another origin and embeds these images.
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  if (!mediaSignedDeliveryEnabled()) return res.status(404).json({ error: 'Not found' });
  const storagePath = typeof req.query.p === 'string' ? req.query.p : '';
  const expiresAt = Number(req.query.e);
  const provided = typeof req.query.s === 'string' ? req.query.s : '';
  if (!verifyMediaSignature(storagePath, expiresAt, provided)) return res.status(403).json({ error: 'Media link invalid or expired' });
  const target = await supabaseSignedUrl(storagePath);
  if (!target) return res.status(404).json({ error: 'Image not found' });
  const remaining = expiresAt - Math.floor(Date.now() / 1000);
  res.set('Cache-Control', `private, max-age=${Math.max(0, Math.min(300, remaining))}`);
  return res.redirect(302, target);
}
