import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  advertiserDashboardSections,
  resolveAdvertiserDashboardSection
} from '../Front/src/components/advertiser-dashboard/AdvertiserDashboardShell';

test('advertiser dashboard exposes all stage-one sections', () => {
  assert.deepEqual(advertiserDashboardSections, [
    'overview',
    'profile',
    'location',
    'messages',
    'bookings',
    'wallet',
    'referrals',
    'settings'
  ]);
});

test('advertiser dashboard section follows URL query and existing app hashes', () => {
  assert.equal(resolveAdvertiserDashboardSection(null), 'overview');
  assert.equal(resolveAdvertiserDashboardSection('profile'), 'profile');
  assert.equal(resolveAdvertiserDashboardSection('settings'), 'settings');
  assert.equal(resolveAdvertiserDashboardSection('profile', '#messages'), 'messages');
  assert.equal(resolveAdvertiserDashboardSection(null, '#bookings'), 'bookings');
  assert.equal(resolveAdvertiserDashboardSection('unsupported'), 'overview');
});

test('existing advertiser profile form remains a single section and keeps save wiring', async () => {
  const source = await readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /function AdvertiserProfileSection/);
  assert.match(source, /<AdvertiserProfileSection \{\.\.\.props\} mode=\{activeSection\}/);
  assert.match(source, /void onSaveDraft\(profile/);
  assert.match(source, /api\.updateProfile\(token, savedProfile\.id, body\)/);
  assert.match(source, /api\.createProfile\(token, body\)/);
  assert.match(source, /api\.uploadImage\(token, form\)/);
  assert.match(source, /api\.setCoverImage\(token, imageId\)/);
  assert.match(source, /api\.deleteImage\(token, imageId\)/);
});

test('overview uses real profile fields and does not fall back to demo bookings', async () => {
  const [dashboard, shell] = await Promise.all([
    readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/components/advertiser-dashboard/AdvertiserDashboardShell.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(shell, /source\.operator_status/);
  assert.match(shell, /profile\.is_published/);
  assert.match(shell, /profile\.subscription_status/);
  assert.match(shell, /getAdvertiserProfileCompletion/);
  assert.doesNotMatch(dashboard, /demoBookingRequests/);
  assert.doesNotMatch(shell, /views|clients|conversations|balance_bc/);
});

test('unfinished sections are explicit placeholders without fake action controls', async () => {
  const [shell, dashboard] = await Promise.all([
    readFile(new URL('../Front/src/components/advertiser-dashboard/AdvertiserDashboardShell.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8')
  ]);
  const placeholder = shell.slice(shell.indexOf('export function DashboardSectionPlaceholder'), shell.indexOf('function getAdvertiserProfileCompletion'));
  assert.match(placeholder, /advertiserDashboard\.placeholder\.eyebrow/);
  assert.doesNotMatch(placeholder, /<button|onClick/);
  assert.match(dashboard, /!\['overview', 'profile', 'location', 'settings'\]\.includes\(activeSection\)/);
});
