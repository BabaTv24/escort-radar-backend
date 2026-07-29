import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import {
  createEmptyFunPageAdvertisement,
  normalizeFunPageAdvertisementSettings,
  reorderAdvertisements,
  toPublicFunPagePromotions,
  validateAdvertisementInput,
  validatePromotionsConfiguration,
  type FunPageAdvertisement,
  type FunPageAdvertisementSettings
} from '../Back/src/funPageAdvertisement.ts';
import {
  advertisementRotationDelayMs,
  nextAdvertisementIndex,
  safeAdvertisementHref,
  shouldRotateAdvertisements
} from '../Front/src/lib/funPageAdvertisement.ts';

const image = (name: string) => ({
  publicUrl: `https://cdn.example.test/${name}.webp`,
  storagePath: `funpage-advertisements/${name}/${name}.webp`
});

function advertisement(id: string, position: number, patch: Partial<FunPageAdvertisement> = {}): FunPageAdvertisement {
  return {
    id,
    active: true,
    image: image(id),
    targetUrl: 'https://example.test/offer',
    altText: `Advertisement ${id}`,
    openInNewTab: true,
    startsAt: null,
    endsAt: null,
    position,
    ...patch
  };
}

function settings(advertisements: FunPageAdvertisement[]): FunPageAdvertisementSettings {
  return {
    version: 2,
    rotationIntervalSeconds: 6,
    advertisements,
    ticker: { active: false, text: '', speed: 'normal', targetUrl: null, openInNewTab: false },
    updatedAt: null
  };
}

test('legacy single advertisement is converted without data loss and desktop becomes the shared image', () => {
  const normalized = normalizeFunPageAdvertisementSettings({
    active: true,
    desktopImage: image('legacy-desktop'),
    mobileImage: image('legacy-mobile'),
    targetUrl: 'https://example.test/babatv',
    altText: 'BabaTV',
    openInNewTab: true,
    startsAt: '2026-07-01T00:00:00.000Z',
    endsAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z'
  });
  assert.equal(normalized.version, 2);
  assert.equal(normalized.advertisements.length, 1);
  assert.equal(normalized.advertisements[0].id, 'legacy-primary');
  assert.deepEqual(normalized.advertisements[0].image, image('legacy-desktop'));
  assert.equal(normalized.advertisements[0].targetUrl, 'https://example.test/babatv');
  assert.equal(normalized.advertisements[0].altText, 'BabaTV');
  assert.equal(normalized.advertisements[0].openInNewTab, true);
  assert.equal(normalized.advertisements[0].active, true);
});

test('legacy mobile image is used only when the desktop image is missing', () => {
  const normalized = normalizeFunPageAdvertisementSettings({ active: true, desktopImage: null, mobileImage: image('legacy-mobile') });
  assert.deepEqual(normalized.advertisements[0].image, image('legacy-mobile'));
});

test('administrator can create second and later advertisements with stable unique IDs', () => {
  const first = createEmptyFunPageAdvertisement(0);
  const second = createEmptyFunPageAdvertisement(1);
  const fiftieth = createEmptyFunPageAdvertisement(49);
  assert.notEqual(first.id, second.id);
  assert.notEqual(second.id, fiftieth.id);
  assert.deepEqual([first.position, second.position, fiftieth.position], [0, 1, 49]);
  const normalized = normalizeFunPageAdvertisementSettings({ version: 2, rotationIntervalSeconds: 6, advertisements: Array.from({ length: 50 }, (_, index) => advertisement(`ad-${index}`, index)), ticker: {} });
  assert.equal(normalized.advertisements.length, 50);
});

test('administrator can reorder advertisements without changing IDs or data', () => {
  const current = settings([advertisement('a', 0), advertisement('b', 1), advertisement('c', 2)]);
  const result = reorderAdvertisements(current, ['c', 'a', 'b']);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.map((item) => [item.id, item.position]), [['c', 0], ['a', 1], ['b', 2]]);
  assert.equal(result.value[0].altText, 'Advertisement c');
});

test('selected advertisement can be disabled or removed without changing the others', () => {
  const current = settings([advertisement('a', 0), advertisement('b', 1), advertisement('c', 2)]);
  const disabled = current.advertisements.map((item) => item.id === 'b' ? { ...item, active: false } : item);
  const removed = disabled.filter((item) => item.id !== 'b').map((item, position) => ({ ...item, position }));
  assert.deepEqual(disabled.map((item) => [item.id, item.active]), [['a', true], ['b', false], ['c', true]]);
  assert.deepEqual(removed.map((item) => [item.id, item.position]), [['a', 0], ['c', 1]]);
});

test('a non-admin cannot change advertisement settings and admin routes remain protected', async () => {
  const { requireAdmin } = await loadAdminMiddleware();
  let status = 0;
  const response = {
    status(value: number) { status = value; return this; },
    json() { return this; }
  } as unknown as Response;
  requireAdmin({ user: { id: 'client', app_metadata: { role: 'client' } } } as Request, response, (() => undefined) as NextFunction);
  assert.equal(status, 403);
  const adminSource = await readFile(new URL('../Back/src/routes/admin.ts', import.meta.url), 'utf8');
  assert.ok(adminSource.indexOf('verifyAdminJwt, requireAdmin') < adminSource.indexOf("use('/funpage-advertisement'"));
});

test('public response exposes only active scheduled render fields in saved order', () => {
  const current = settings([
    advertisement('later', 2),
    advertisement('disabled', 1, { active: false }),
    advertisement('first', 0),
    advertisement('future', 3, { startsAt: '2026-08-01T00:00:00.000Z' }),
    advertisement('expired', 4, { endsAt: '2026-07-01T00:00:00.000Z' })
  ]);
  current.ticker = { active: true, text: 'Plain text', speed: 'fast', targetUrl: '/pricing', openInNewTab: false };
  const response = toPublicFunPagePromotions(current, new Date('2026-07-29T12:00:00.000Z'));
  assert.deepEqual(response.advertisements.map((item) => item.id), ['first', 'later']);
  assert.equal(JSON.stringify(response).includes('storagePath'), false);
  assert.equal(JSON.stringify(response).includes('updatedAt'), false);
  assert.deepEqual(response.ticker, current.ticker);
});

test('one active advertisement does not rotate and several rotate at the configured interval', () => {
  assert.equal(shouldRotateAdvertisements(0), false);
  assert.equal(shouldRotateAdvertisements(1), false);
  assert.equal(shouldRotateAdvertisements(2), true);
  assert.equal(advertisementRotationDelayMs(6), 6000);
  assert.deepEqual([nextAdvertisementIndex(0, 3), nextAdvertisementIndex(1, 3), nextAdvertisementIndex(2, 3)], [1, 2, 0]);
});

test('rotation intervals outside 3 to 30 seconds are rejected', () => {
  const ticker = { active: false, text: '', speed: 'normal', targetUrl: null, openInNewTab: false };
  assert.equal(validatePromotionsConfiguration({ rotationIntervalSeconds: 2, ticker }).ok, false);
  assert.equal(validatePromotionsConfiguration({ rotationIntervalSeconds: 31, ticker }).ok, false);
  assert.equal(validatePromotionsConfiguration({ rotationIntervalSeconds: 3, ticker }).ok, true);
  assert.equal(validatePromotionsConfiguration({ rotationIntervalSeconds: 30, ticker }).ok, true);
});

test('unsafe advertisement and ticker URLs are rejected', () => {
  assert.equal(validateAdvertisementInput({ active: true, targetUrl: 'javascript:alert(1)', altText: '', openInNewTab: false, startsAt: null, endsAt: null }).ok, false);
  assert.equal(validatePromotionsConfiguration({
    rotationIntervalSeconds: 6,
    ticker: { active: true, text: 'Safe text', speed: 'normal', targetUrl: 'data:text/html,bad', openInNewTab: false }
  }).ok, false);
  assert.equal(safeAdvertisementHref('javascript:alert(1)'), null);
  assert.equal(safeAdvertisementHref('/pricing'), '/pricing');
});

test('empty promotions render no space and ticker HTML is rendered only as text', async () => {
  const homeSource = await readFile(new URL('../Front/src/pages/HomePage.tsx', import.meta.url), 'utf8');
  assert.ok(homeSource.includes("if (!advertisements.length && !ticker) return null"));
  assert.equal(homeSource.includes('dangerouslySetInnerHTML'), false);
  assert.ok(homeSource.includes('{ticker.text}'));
});

test('ticker moves right-to-left and reduced motion disables forced animation', async () => {
  const styles = await readFile(new URL('../Front/src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /funpage-ticker-scroll[\s\S]*translateX\(-50%\)/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*funpage-ticker-track[\s\S]*animation:\s*none/);
  assert.match(styles, /funpage-ticker:hover[\s\S]*animation-play-state:\s*paused/);
});

test('admin has one advertisement image field and no desktop or mobile image fields', async () => {
  const source = await readFile(new URL('../Front/src/components/AdminFunPagePromotions.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes("t('admin.advertisement.image')"));
  assert.equal(source.includes('desktopImage'), false);
  assert.equal(source.includes('mobileImage'), false);
  assert.equal(source.includes('mobile image'), false);
});

test('legacy technology section does not return to FunPage', async () => {
  const source = await readFile(new URL('../Front/src/pages/HomePage.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes("t('baba.homeTitle')"), false);
  assert.equal(source.includes('Studio-Infrastruktur'), false);
  assert.equal(source.includes('TECHNOLOGY BY BABA AI'), false);
});

async function loadAdminMiddleware() {
  process.env.SUPABASE_URL ||= 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';
  process.env.SUPABASE_ANON_KEY ||= 'test-anon-key';
  return import('../Back/src/middleware/auth.ts');
}
