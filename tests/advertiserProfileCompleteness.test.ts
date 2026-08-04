import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { Profile } from '../Front/src/types';
import {
  advertiserProfileCompletionCriteria,
  getAdvertiserProfileCompleteness
} from '../Front/src/lib/advertiserProfileCompleteness';

const completeProfile: Partial<Profile> = {
  display_name: 'Anna',
  description: 'Profile description',
  profile_images: [{ id: 'photo-1', storage_path: 'profiles/photo.jpg', is_primary: true, is_blurred: false }],
  work_city: 'Berlin',
  services: ['massage'],
  price_1h: 200,
  primary_phone: '+49123456789',
  opening_hours: { monday: ['10:00', '20:00'] }
};

test('profile completeness exposes the exact eight criteria from one definition', () => {
  assert.deepEqual(advertiserProfileCompletionCriteria.map(({ id, section }) => ({ id, section })), [
    { id: 'displayName', section: 'profile' },
    { id: 'description', section: 'profile' },
    { id: 'photo', section: 'profile' },
    { id: 'location', section: 'location' },
    { id: 'services', section: 'profile' },
    { id: 'pricing', section: 'profile' },
    { id: 'contact', section: 'profile' },
    { id: 'availability', section: 'profile' }
  ]);
});

test('7/8 reports the exact missing criterion and cannot be complete', () => {
  const result = getAdvertiserProfileCompleteness({ ...completeProfile, description: '' });

  assert.equal(result.completed, 7);
  assert.equal(result.total, 8);
  assert.equal(result.percent, 88);
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing.map((item) => item.id), ['description']);
  assert.equal(result.items.find((item) => item.id === 'description')?.complete, false);
});

test('8/8 reports 100 percent and no missing criteria', () => {
  const result = getAdvertiserProfileCompleteness(completeProfile);

  assert.equal(result.completed, 8);
  assert.equal(result.total, 8);
  assert.equal(result.percent, 100);
  assert.equal(result.complete, true);
  assert.deepEqual(result.missing, []);
});

test('counter percentage and missing list are derived from the same item results', () => {
  const result = getAdvertiserProfileCompleteness({ ...completeProfile, services: [], primary_phone: null });
  const completedFromItems = result.items.filter((item) => item.complete).length;
  const missingFromItems = result.items.filter((item) => !item.complete);

  assert.equal(result.completed, completedFromItems);
  assert.equal(result.percent, Math.round((completedFromItems / result.total) * 100));
  assert.deepEqual(result.missing, missingFromItems);
});

test('overview gates the complete message with the shared result and locales name every criterion', async () => {
  const shell = await readFile(new URL('../Front/src/components/advertiser-dashboard/AdvertiserDashboardShell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /completion\.complete[\s\S]*advertiserDashboard\.overview\.ready/);
  assert.doesNotMatch(shell, /getAdvertiserProfileWarnings|getAdvertiserProfileCompletion\(/);

  const expectedKeys = [
    'advertiserDashboard.overview.ready',
    'advertiserDashboard.overview.missingTitleOne',
    'advertiserDashboard.overview.missingTitleMany',
    'advertiserDashboard.completeness.completeAction',
    ...advertiserProfileCompletionCriteria.map((criterion) => criterion.labelKey)
  ];
  for (const language of ['pl', 'de', 'en']) {
    const messages = JSON.parse(await readFile(new URL(`../Front/src/locales/${language}.json`, import.meta.url), 'utf8'));
    for (const key of expectedKeys) assert.equal(typeof messages[key], 'string', `${language}:${key}`);
  }
});
