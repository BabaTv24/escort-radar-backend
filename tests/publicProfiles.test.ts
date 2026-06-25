import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { isPublicProfile } from '../Back/src/publicProfiles.ts';
import { mapApiProfileToPublicProfile } from '../Front/src/lib/publicProfiles.ts';

test('published admin profile is public without premium, GPS, prices, or photos', () => {
  assert.equal(isPublicProfile({
    status: 'active',
    is_published: true,
    moderation_status: 'approved',
    shadowbanned: false
  }), true);
});

test('profile without a photo remains mappable and visible', () => {
  const profile = mapApiProfileToPublicProfile({
    id: 'admin-profile',
    display_name: 'Real profile',
    city: 'berlin',
    status: 'active',
    is_published: true,
    moderation_status: 'approved'
  });
  assert.ok(profile);
  assert.deepEqual(profile.profile_images, []);
});

test('hidden and unpublished profiles are not public', () => {
  assert.equal(isPublicProfile({ status: 'active', is_published: true, moderation_status: 'approved', shadowbanned: true }), false);
  assert.equal(isPublicProfile({ status: 'suspended', is_published: true, moderation_status: 'approved', shadowbanned: false }), false);
  assert.equal(isPublicProfile({ status: 'active', is_published: false, moderation_status: 'approved', shadowbanned: false }), false);
  assert.equal(isPublicProfile({ status: 'active', is_published: true, moderation_status: 'pending', shadowbanned: false }), false);
});

test('mapper supports alternate API field and image formats', () => {
  const profile = mapApiProfileToPublicProfile({
    id: 'mapped-profile',
    name: 'Mapped profile',
    work_city: 'Berlin',
    hourly_rate: '220',
    photos: ['https://cdn.example/one.jpg'],
    avatar_url: 'https://cdn.example/avatar.jpg',
    availableNow: true
  });
  assert.ok(profile);
  assert.equal(profile.display_name, 'Mapped profile');
  assert.equal(profile.city, 'Berlin');
  assert.equal(profile.price_1h, 220);
  assert.equal(profile.profile_images?.length, 2);
});

test('production pages use the shared public profile source and no demo fallback', async () => {
  const files = await Promise.all([
    readFile(new URL('../Front/src/pages/HomePage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/pages/CityPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/pages/ProfilePage.tsx', import.meta.url), 'utf8')
  ]);
  for (const source of files) {
    assert.match(source, /getPublicProfiles|mapApiProfileToPublicProfile/);
    assert.doesNotMatch(source, /demoProfiles|getDemoProfiles|getDemoProfile|mockProfiles|fallbackProfiles/);
  }
});

test('API failure path cannot enable mock profiles', async () => {
  const source = await readFile(new URL('../Front/src/lib/publicProfiles.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /mockProfiles|demoProfiles|sampleProfiles|fallbackProfiles/);
  assert.match(source, /throw new Error/);
});
