import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import {
  isFunPageAdvertisementLive,
  toPublicFunPageAdvertisement,
  validateFunPageAdvertisementInput,
  type FunPageAdvertisement
} from '../Back/src/funPageAdvertisement.ts';
import { advertisementMobileImage, safeAdvertisementHref } from '../Front/src/lib/funPageAdvertisement.ts';

const baseAdvertisement: FunPageAdvertisement = {
  active: true,
  desktopImage: {
    publicUrl: 'https://cdn.example.test/desktop.webp',
    storagePath: 'funpage-advertisements/desktop/desktop.webp'
  },
  mobileImage: {
    publicUrl: 'https://cdn.example.test/mobile.webp',
    storagePath: 'funpage-advertisements/mobile/mobile.webp'
  },
  targetUrl: 'https://example.test/offer',
  altText: 'Premium offer',
  openInNewTab: true,
  startsAt: null,
  endsAt: null,
  updatedAt: '2026-07-29T12:00:00.000Z'
};

test('administrator is authorized and a valid advertisement payload can be saved', async () => {
  const result = validateFunPageAdvertisementInput({
    active: true,
    targetUrl: 'https://example.test/offer',
    altText: 'Premium offer',
    openInNewTab: true,
    startsAt: '2026-07-01T00:00:00.000Z',
    endsAt: '2026-08-01T00:00:00.000Z'
  });
  assert.equal(result.ok, true);

  const { requireAdmin } = await loadAdminMiddleware();
  let nextCalled = false;
  requireAdmin(
    { user: { id: 'admin', app_metadata: { role: 'admin' } } } as Request,
    {} as Response,
    (() => { nextCalled = true; }) as NextFunction
  );
  assert.equal(nextCalled, true);
});

test('a non-admin cannot change advertisement settings', async () => {
  const { requireAdmin } = await loadAdminMiddleware();
  let status = 0;
  let payload: unknown;
  const response = {
    status(value: number) { status = value; return this; },
    json(value: unknown) { payload = value; return this; }
  } as unknown as Response;
  requireAdmin({ user: { id: 'client', app_metadata: { role: 'client' } } } as Request, response, (() => undefined) as NextFunction);
  assert.equal(status, 403);
  assert.deepEqual(payload, { error: 'Admin access required' });
});

test('public advertisement response contains only render-safe fields', () => {
  const response = toPublicFunPageAdvertisement(baseAdvertisement, new Date('2026-07-29T12:00:00.000Z'));
  assert.deepEqual(response, {
    desktopImageUrl: 'https://cdn.example.test/desktop.webp',
    mobileImageUrl: 'https://cdn.example.test/mobile.webp',
    targetUrl: 'https://example.test/offer',
    altText: 'Premium offer',
    openInNewTab: true
  });
  assert.equal(JSON.stringify(response).includes('storagePath'), false);
  assert.equal(JSON.stringify(response).includes('updatedAt'), false);
});

test('active advertisement is visible and disabled advertisement is hidden', () => {
  assert.equal(isFunPageAdvertisementLive(baseAdvertisement, new Date('2026-07-29T12:00:00.000Z')), true);
  assert.equal(isFunPageAdvertisementLive({ ...baseAdvertisement, active: false }, new Date('2026-07-29T12:00:00.000Z')), false);
});

test('advertisement before its start and after its end is hidden', () => {
  const scheduled = { ...baseAdvertisement, startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-08-31T23:59:59.000Z' };
  assert.equal(isFunPageAdvertisementLive(scheduled, new Date('2026-07-29T12:00:00.000Z')), false);
  assert.equal(isFunPageAdvertisementLive(scheduled, new Date('2026-09-01T00:00:00.000Z')), false);
});

test('mobile uses its dedicated image and falls back to desktop', () => {
  const publicAdvertisement = toPublicFunPageAdvertisement(baseAdvertisement)!;
  assert.equal(advertisementMobileImage(publicAdvertisement), 'https://cdn.example.test/mobile.webp');
  assert.equal(advertisementMobileImage({ ...publicAdvertisement, mobileImageUrl: null }), 'https://cdn.example.test/desktop.webp');
});

test('unsafe target URLs are rejected on backend and frontend', () => {
  const result = validateFunPageAdvertisementInput({
    active: true,
    targetUrl: 'javascript:alert(1)',
    altText: '',
    openInNewTab: false,
    startsAt: null,
    endsAt: null
  });
  assert.deepEqual(result, { ok: false, error: 'targetUrl must use https: or be an internal application path' });
  assert.equal(safeAdvertisementHref('javascript:alert(1)'), null);
  assert.equal(safeAdvertisementHref('/profile/123'), '/profile/123');
});

test('legacy Studio-Infrastruktur section is no longer rendered on FunPage', async () => {
  const source = await readFile(new URL('../Front/src/pages/HomePage.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes('footerSlides'), false);
  assert.equal(source.includes("t('baba.homeTitle')"), false);
  assert.equal(source.includes('Studio-Infrastruktur'), false);
});

async function loadAdminMiddleware() {
  process.env.SUPABASE_URL ||= 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';
  process.env.SUPABASE_ANON_KEY ||= 'test-anon-key';
  return import('../Back/src/middleware/auth.ts');
}
