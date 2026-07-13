import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export function validatePublicImportUrl(value: string) {
  if (!value || value.length > 2000) return 'Valid public URL is required';
  let parsed: URL;
  try { parsed = new URL(value); } catch { return 'Valid public URL is required'; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return 'Only HTTP/HTTPS public URLs are supported';
  if (parsed.username || parsed.password) return 'URLs containing credentials are not supported';
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')
    || hostname === 'metadata.google.internal' || hostname.includes('..') || isPrivateImportAddress(hostname)) return 'Only public pages are supported';
  return null;
}

export async function fetchPublicImportResource(value: string, init: RequestInit, redirects = 0): Promise<Response> {
  const safetyError = validatePublicImportUrl(value);
  if (safetyError) throw new Error(safetyError);
  await assertPublicImportDns(value);
  const response = await fetch(value, { ...init, redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    if (redirects >= 3) throw new Error('Too many redirects');
    const location = response.headers.get('location');
    if (!location) throw new Error('Redirect did not include a location');
    const next = new URL(location, value).toString();
    const redirectSafetyError = validatePublicImportUrl(next);
    if (redirectSafetyError) throw new Error(`Unsafe redirect blocked: ${redirectSafetyError}`);
    return fetchPublicImportResource(next, init, redirects + 1);
  }
  return response;
}

export async function readImportResponseLimited(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error(`Response is larger than ${maxBytes} bytes`);
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel().catch(() => undefined); throw new Error(`Response is larger than ${maxBytes} bytes`); }
    chunks.push(value);
  }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function assertPublicImportDns(value: string) {
  const hostname = new URL(value).hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname)) { if (isPrivateImportAddress(hostname)) throw new Error('Only public pages are supported'); return; }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateImportAddress(address))) throw new Error('Source hostname resolves to a non-public address');
}

function isPrivateImportAddress(address: string): boolean {
  const value = address.toLowerCase();
  if (value.startsWith('::ffff:')) return isPrivateImportAddress(value.slice(7));
  return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')
    || value.startsWith('127.') || value.startsWith('10.') || value.startsWith('192.168.') || value.startsWith('169.254.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(value) || value === '0.0.0.0';
}
