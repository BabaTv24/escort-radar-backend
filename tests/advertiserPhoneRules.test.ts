import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { evaluatePhoneRules } from '../Back/src/phoneRules.js';
import { normalizePhone } from '../Back/src/utils/identity.js';
import { validateProfileInput } from '../Back/src/validation.js';

const baseProfileInput = {
  display_name: 'Anna',
  city: 'berlin',
  account_type: 'private'
};

test('a single valid phone number with empty WhatsApp/Telegram saves for a private account', () => {
  const result = evaluatePhoneRules({
    accountType: 'private',
    primaryPhone: '+49 153 33555506',
    additionalPhones: [],
    ownerLabel: 'Anna',
    phoneRuleConfirmed: false,
    conflictingProfiles: []
  });

  assert.ok('data' in result, 'expected a successful save, not a blocked confirmation');
  if ('data' in result) {
    assert.equal(result.data.primary_phone, '+4915333555506');
    assert.equal(result.data.phone_conflict_status, 'clear');
  }
});

test('the same number in different formats normalizes to one identical value', () => {
  const formats = ['+49 153 33555506', '004915333555506', '+4915333555506'];
  const normalized = formats.map((phone) => normalizePhone(phone));
  assert.deepEqual(new Set(normalized), new Set(['+4915333555506']));

  for (const phone of formats) {
    const result = evaluatePhoneRules({
      accountType: 'private',
      primaryPhone: phone,
      additionalPhones: [],
      ownerLabel: 'Anna',
      phoneRuleConfirmed: false,
      conflictingProfiles: []
    });
    assert.ok('data' in result, `format ${phone} must be allowed to save`);
    if ('data' in result) assert.equal(result.data.primary_phone, '+4915333555506');
  }
});

test('changing an old number to a different new number is not auto-blocked', () => {
  const result = evaluatePhoneRules({
    accountType: 'private',
    primaryPhone: '+4915300000001',
    additionalPhones: [],
    ownerLabel: 'Anna',
    phoneRuleConfirmed: false,
    conflictingProfiles: [] // the profile's own prior number is never compared against
  });

  assert.ok('data' in result);
  if ('data' in result) assert.equal(result.data.primary_phone, '+4915300000001');
});

test('the same number already used on another profile is a diagnostic signal, never an auto-block', () => {
  const result = evaluatePhoneRules({
    accountType: 'private',
    primaryPhone: '+4915333555506',
    additionalPhones: [],
    ownerLabel: 'Anna',
    phoneRuleConfirmed: false,
    conflictingProfiles: [{ phone_owner_identity_label: 'Someone Else' }]
  });

  assert.ok('data' in result, 'a shared number must save, not hard-block, even when the other profile has a different owner label');
  if ('data' in result) assert.equal(result.data.phone_conflict_status, 'warning');
});

test('a regular profile sharing a number with a sponsored/admin profile is never auto-blocked', () => {
  for (const accountType of ['private', 'admin_sponsored', 'agency']) {
    const result = evaluatePhoneRules({
      accountType,
      primaryPhone: '+4915333555506',
      additionalPhones: [],
      ownerLabel: 'Anna',
      phoneRuleConfirmed: false,
      conflictingProfiles: [{ phone_owner_identity_label: 'Admin Sponsored Listing' }]
    });
    assert.ok('data' in result, `${accountType} profiles must not be auto-blocked by a shared number`);
    if ('data' in result) assert.equal(result.data.phone_conflict_status, 'warning');
  }
});

test('phone_owner_identity_label and display_name differences never gate the save decision', () => {
  // No ownerLabel at all (matches the profiles.ts route, which no longer falls back to
  // display_name) still must not trigger a conflict, even against a labeled match.
  const result = evaluatePhoneRules({
    accountType: 'private',
    primaryPhone: '+4915333555506',
    additionalPhones: [],
    ownerLabel: undefined,
    phoneRuleConfirmed: false,
    conflictingProfiles: [{ phone_owner_identity_label: 'Some Other Advertiser' }]
  });
  assert.ok('data' in result);
  if ('data' in result) {
    assert.equal(result.data.phone_conflict_status, 'warning');
    assert.equal(result.data.phone_owner_identity_label, null);
  }
});

test('multiple distinct numbers on one private profile require explicit confirmation', () => {
  const unconfirmed = evaluatePhoneRules({
    accountType: 'private',
    primaryPhone: '+4915333555506',
    additionalPhones: ['+4915300000002'],
    ownerLabel: 'Anna',
    phoneRuleConfirmed: false,
    conflictingProfiles: []
  });
  assert.ok('error' in unconfirmed);
  if ('error' in unconfirmed) assert.equal(unconfirmed.code, 'phone_owner_confirmation_required');

  const confirmed = evaluatePhoneRules({
    accountType: 'private',
    primaryPhone: '+4915333555506',
    additionalPhones: ['+4915300000002'],
    ownerLabel: 'Anna',
    phoneRuleConfirmed: true,
    conflictingProfiles: []
  });
  assert.ok('data' in confirmed);
});

test('agency accounts keep sharing numbers across listings without the private confirmation gate', () => {
  const result = evaluatePhoneRules({
    accountType: 'agency',
    primaryPhone: '+4915333555506',
    additionalPhones: ['+4915300000002'],
    ownerLabel: 'Studio Agency',
    phoneRuleConfirmed: false,
    conflictingProfiles: [{ phone_owner_identity_label: 'Some Other Listing' }]
  });

  assert.ok('data' in result, 'agency accounts must not be blocked by the private-only owner rules');
  if ('data' in result) assert.equal(result.data.phone_conflict_status, 'warning');
});

test('empty phone never triggers confirmation or conflict checks', () => {
  const result = evaluatePhoneRules({
    accountType: 'private',
    primaryPhone: '',
    additionalPhones: [],
    ownerLabel: 'Anna',
    phoneRuleConfirmed: false,
    conflictingProfiles: []
  });

  assert.ok('data' in result);
  if ('data' in result) {
    assert.equal(result.data.primary_phone, null);
    assert.equal(result.data.phone_conflict_status, 'clear');
  }
});

test('empty WhatsApp and Telegram never block profile input validation', () => {
  const result = validateProfileInput({
    ...baseProfileInput,
    primary_phone: '+49 153 33555506',
    whatsapp: '',
    telegram: ''
  });
  assert.ok('data' in result, 'empty WhatsApp/Telegram must not fail validation');
  const data = (result as { data: { whatsapp: unknown; telegram: unknown; primary_phone: unknown } }).data;
  assert.equal(data.whatsapp, null);
  assert.equal(data.telegram, null);
  assert.equal(data.primary_phone, '+49 153 33555506');
});

test('the profiles route no longer falls back to display_name for the owner label', async () => {
  const source = await readFile(new URL('../Back/src/routes/profiles.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /ownerLabel:\s*data\.phone_owner_identity_label\s*\|\|\s*data\.display_name/);
  assert.match(source, /ownerLabel:\s*data\.phone_owner_identity_label/);
});

test('the admin profiles table still exposes contact data', async () => {
  const source = await readFile(new URL('../Front/src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /'primary_phone'/);
  assert.match(source, /'phone_conflict_status'/);
});

test('the sponsored profile claim flow is not wired to the phone conflict rules', async () => {
  const source = await readFile(new URL('../Back/src/routes/sponsoredProfiles.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /evaluatePhoneRules|phone_number_owner_conflict/);
});

test('backend route wires the shared decision helper and returns a code with the 400', async () => {
  const source = await readFile(new URL('../Back/src/routes/profiles.ts', import.meta.url), 'utf8');
  assert.match(source, /evaluatePhoneRules/);
  assert.match(source, /res\.status\(400\)\.json\(\{ error: phoneValidation\.error, code: phoneValidation\.code \}\)/);
});

test('the dashboard never renders raw ApiError text for known phone error codes', async () => {
  const source = await readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /phone_owner_confirmation_required['"]?:\s*['"]phone\.errors\.ownerConfirmationRequired['"]/);
  assert.match(source, /translateProfileSaveError\(error, t\)/);

  for (const language of ['pl', 'de', 'en']) {
    const messages = JSON.parse(await readFile(new URL(`../Front/src/locales/${language}.json`, import.meta.url), 'utf8'));
    assert.equal(typeof messages['phone.errors.ownerConfirmationRequired'], 'string', `${language} missing ownerConfirmationRequired`);
  }
});

test('the retired ownerConflict mapping and translation key are gone (no longer a real backend code)', async () => {
  const source = await readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /phone_number_owner_conflict/);
  assert.doesNotMatch(source, /phone\.errors\.ownerConflict/);

  for (const language of ['pl', 'de', 'en']) {
    const messages = JSON.parse(await readFile(new URL(`../Front/src/locales/${language}.json`, import.meta.url), 'utf8'));
    assert.equal(messages['phone.errors.ownerConflict'], undefined, `${language} still has the retired ownerConflict key`);
  }
});

test('the reachable account settings panel exposes the phone confirmation checkbox outside dead code', async () => {
  const source = await readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
  const accountPanelMatch = source.match(/\{panel === 'account' && \([\s\S]*?<\/section>\s*\)\}/);
  assert.ok(accountPanelMatch, 'could not locate the reachable account settings panel');
  assert.match(accountPanelMatch![0], /phone\.confirmSameOwner/);
  assert.match(accountPanelMatch![0], /phone_rule_confirmed/);
});

test('the confirmation checkbox in the profile editor only renders when a second phone number actually exists', async () => {
  const source = await readFile(new URL('../Front/src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
  const editorMatch = source.match(/\{creatorTab === 'visibility' && <section className="form-panel elevated">[\s\S]*?phone\.confirmSameOwner[\s\S]*?<\/section>\}/);
  assert.ok(editorMatch, 'could not locate the profile editor phone section');
  const beforeCheckbox = editorMatch![0].slice(0, editorMatch![0].indexOf('phone.confirmSameOwner'));
  assert.match(beforeCheckbox, /profile\.account_type === 'private' && \(profile\.additional_phones \|\| \[\]\)\.length > 0/, 'a single phone number must not surface the same-owner checkbox');
});
