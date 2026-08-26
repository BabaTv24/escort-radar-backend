import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

async function loadProfilesRoute() {
  process.env.SUPABASE_URL ||= 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role';
  process.env.SUPABASE_ANON_KEY ||= 'anon-key';
  return import('../Back/src/routes/profiles.ts');
}

const publicBase = {
  id: 'profile-1',
  display_name: 'Anna',
  status: 'active',
  is_published: true,
  moderation_status: 'approved',
  shadowbanned: false,
  category: 'ladies',
  city: 'berlin',
  work_city: 'Berlin'
};

test('the account type resolver never links an unowned profile by owner_email', async () => {
  const source = await read('Back/src/routes/auth.ts');
  const resolver = source.slice(source.indexOf('async function resolveAuthAccountType'));

  assert.doesNotMatch(resolver, /ilike\('owner_email'/);
  assert.doesNotMatch(resolver, /is\('user_id', null\)/);
  assert.doesNotMatch(resolver, /\.update\(\{ user_id/);
  assert.match(resolver, /\.from\('profiles'\)[\s\S]*\.eq\('user_id', userId\)/);
});

test('GET /api/profiles/me resolves ownership from user_id only', async () => {
  const source = await read('Back/src/routes/profiles.ts');
  const route = source.slice(source.indexOf("profilesRouter.get('/me'"), source.indexOf("profilesRouter.get('/:id/access'"));

  assert.doesNotMatch(route, /ilike\('owner_email'/);
  assert.doesNotMatch(route, /is\('user_id', null\)/);
  assert.doesNotMatch(route, /\.update\(\{ user_id/);
  assert.match(route, /\.eq\('user_id', req\.user!\.id\)/);
});

test('no backend route links a profile to a signup that merely matches owner_email', async () => {
  const [authSource, profilesSource] = await Promise.all([
    read('Back/src/routes/auth.ts'),
    read('Back/src/routes/profiles.ts')
  ]);

  assert.doesNotMatch(`${authSource}\n${profilesSource}`, /ilike\('owner_email'/);
  assert.doesNotMatch(`${authSource}\n${profilesSource}`, /is\('user_id', null\)/);
});

test('an owner with a linked user_id keeps the owner path for read, update and delete', async () => {
  const source = await read('Back/src/routes/profiles.ts');
  const meRoute = source.slice(source.indexOf("profilesRouter.get('/me'"), source.indexOf("profilesRouter.get('/:id/access'"));

  assert.match(meRoute, /\.eq\('user_id', req\.user!\.id\)/);
  assert.match(meRoute, /res\.json\(\{ profile: data \? withOwnerImageUrls\(data, wallet\) : null, wallet \}\)/);
  assert.match(source, /profilesRouter\.put\('\/:id'[\s\S]*existing\.user_id !== req\.user!\.id/);
  assert.match(source, /profilesRouter\.delete\('\/:id'[\s\S]*existing\.user_id !== req\.user!\.id/);
});

test('public profile output drops owner_email, email and user_id', async () => {
  const { sanitizePublicProfile } = await loadProfilesRoute();
  const sanitized = sanitizePublicProfile({
    ...publicBase,
    owner_email: 'owner@example.com',
    email: 'contact@example.com',
    user_id: '11111111-2222-3333-4444-555555555555'
  }) as Record<string, unknown>;

  assert.equal(Object.prototype.hasOwnProperty.call(sanitized, 'owner_email'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized, 'email'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized, 'user_id'), false);
  assert.doesNotMatch(JSON.stringify(sanitized), /owner@example\.com|contact@example\.com|11111111-2222/);
  assert.equal(sanitized.id, 'profile-1');
  assert.equal(sanitized.display_name, 'Anna');
});

test('the profile listing and the single profile route share the sanitizer that strips owner identity', async () => {
  const source = await read('Back/src/routes/profiles.ts');
  const sanitizer = source.slice(source.indexOf('export function sanitizePublicProfile'));

  assert.match(sanitizer, /owner_email: _ownerEmail/);
  assert.match(sanitizer, /email: _email/);
  assert.match(sanitizer, /user_id: _userId/);
  assert.match(source, /filteredRecords\.map\(\(profile\) => sanitizePublicProfile\(withImageUrls\(profile\)\)\)/);
  assert.match(source, /profilesRouter\.get\('\/:id'[\s\S]*res\.json\(\{ profile: sanitizePublicProfile\(withImageUrls\(data\)\) \}\)/);
});

test('the radar select still carries no owner identity columns', async () => {
  const source = await read('Back/src/routes/profiles.ts');
  const radarSelect = source.slice(source.indexOf('const radarSelect = ['), source.indexOf("].join(', ')"));

  assert.doesNotMatch(radarSelect, /owner_email|user_id/);
  assert.match(radarSelect, /'id', 'display_name', 'slug'/);
});

test('GET /:id/access unlocks contact data only for a public profile in an active category', async () => {
  const source = await read('Back/src/routes/profiles.ts');
  const route = source.slice(source.indexOf("profilesRouter.get('/:id/access'"), source.indexOf("profilesRouter.get('/:id/location'"));

  assert.match(route, /select\('id, primary_phone, additional_phones, whatsapp, telegram, status, is_published, moderation_status, shadowbanned, category, profile_images\(\*\)'\)/);
  assert.match(route, /if \(!isPublicProfile\(data\) \|\| !isActivePublicCategory\(data\.category\)\) \{\s*return res\.status\(404\)\.json\(\{ error: 'Profile not found' \}\);/);
  assert.ok(route.indexOf('isPublicProfile(data)') < route.indexOf('phone_number: data.primary_phone'));
});

test('GET /:id/access keeps the 403 activation gate ahead of the visibility gate', async () => {
  const source = await read('Back/src/routes/profiles.ts');
  const route = source.slice(source.indexOf("profilesRouter.get('/:id/access'"), source.indexOf("profilesRouter.get('/:id/location'"));

  assert.match(route, /activation\.state !== 'client_activated'[\s\S]*res\.status\(403\)[\s\S]*Client activation required/);
  assert.ok(route.indexOf("res.status(403)") < route.indexOf('isPublicProfile(data)'));
});

test('the visibility helpers reject drafts, rejected, shadowbanned and disabled category profiles', async () => {
  const { isPublicProfile } = await import('../Back/src/publicProfiles.ts');
  const { disabledPublicCategoryOptions, isActivePublicCategory } = await import('../Back/src/categories.ts');

  assert.equal(isPublicProfile(publicBase), true);
  assert.equal(isActivePublicCategory(publicBase.category), true);
  assert.equal(isPublicProfile({ ...publicBase, is_published: false }), false);
  assert.equal(isPublicProfile({ ...publicBase, status: 'pending' }), false);
  assert.equal(isPublicProfile({ ...publicBase, moderation_status: 'rejected' }), false);
  assert.equal(isPublicProfile({ ...publicBase, shadowbanned: true }), false);
  assert.ok(disabledPublicCategoryOptions.length > 0);
  for (const category of disabledPublicCategoryOptions) {
    assert.equal(isActivePublicCategory(category), false);
  }
});

test('the ownership audit script is read-only and never asserts a takeover on its own', async () => {
  const sql = await read('scripts/sql/profile_ownership_takeover_audit_readonly.sql');
  const statements = sql.replace(/--.*$/gm, '');

  assert.doesNotMatch(statements, /\b(insert|update|delete|alter|drop|truncate|create|grant|revoke|merge|copy)\b/i);
  assert.match(sql, /is NOT proof of a\s*--\s*takeover/);
  assert.match(statements, /review_email_mismatch_only/);
  assert.match(statements, /explained_by_sponsored_claim/);
});

test('the tokenized sponsored claim path stays untouched by the ownership fix', async () => {
  const [route, sql] = await Promise.all([
    read('Back/src/routes/sponsoredProfiles.ts'),
    read('supabase/migrations/052_sponsored_profiles_ai_bcu.sql')
  ]);

  assert.match(route, /sponsoredProfilesRouter\.use\(verifyUser\)/);
  assert.match(route, /claim_admin_sponsored_profile/);
  assert.doesNotMatch(route, /owner_email/);
  assert.match(sql, /if v_profile\.user_id is null then\s*raise exception 'SPONSORED_CLAIM_TECHNICAL_OWNER_REQUIRED'/);
  assert.match(sql, /update public\.profiles set\s*user_id = p_claimant_user_id,/);
  assert.doesNotMatch(sql, /ilike\('owner_email'/);
});
