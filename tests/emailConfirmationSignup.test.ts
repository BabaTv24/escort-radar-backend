import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Prose in a comment must never satisfy or break a rule about the code itself, so every
// "this string may not appear" assertion runs against the source with full line comments removed.
const stripLineComments = (source: string) => source.replace(/^[ \t]*\/\/.*$/gm, '');

const readCode = async (path: string) => stripLineComments(await read(path));

async function loadAuthRoute() {
  process.env.SUPABASE_URL ||= 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role';
  process.env.SUPABASE_ANON_KEY ||= 'anon-key';
  return import('../Back/src/routes/auth.ts');
}

const readLocales = async () => {
  const [pl, de, en] = await Promise.all([
    read('Front/src/locales/pl.json').then(JSON.parse),
    read('Front/src/locales/de.json').then(JSON.parse),
    read('Front/src/locales/en.json').then(JSON.parse)
  ]);
  return { pl, de, en } as Record<string, Record<string, string>>;
};

const readRegisterHandler = async () => {
  const source = await readCode('Back/src/routes/auth.ts');
  return source.slice(source.indexOf("authRouter.post('/register'"), source.indexOf("authRouter.post('/resend-confirmation'"));
};

test('public registration never marks the address as confirmed on its own', async () => {
  const source = await readCode('Back/src/routes/auth.ts');
  const handler = await readRegisterHandler();

  assert.ok(handler.length > 0, 'the register handler must stay ahead of the resend handler');
  assert.doesNotMatch(source, /email_confirm:/);
  assert.doesNotMatch(source, /auth\.admin\.createUser/);
  assert.doesNotMatch(handler, /auth\.admin\.createUser/);
});

test('public registration uses the Supabase sign up flow that sends Confirm signup', async () => {
  const handler = await readRegisterHandler();

  assert.match(handler, /supabaseAnon\.auth\.signUp\(\{/);
  assert.match(handler, /emailRedirectTo: buildEmailConfirmationRedirectUrl\(\)/);
  assert.ok(
    handler.indexOf('supabaseAnon.auth.signUp') < handler.indexOf('supabaseAdmin.auth.admin.updateUserById'),
    'the account has to exist before the service role writes its app_metadata'
  );
});

test('the confirmation link points at an existing route inside the configured site URL', async () => {
  const [source, appSource] = await Promise.all([
    read('Back/src/routes/auth.ts'),
    read('Front/src/App.tsx')
  ]);

  assert.match(source, /const emailConfirmationRedirectPath = '\/login\?confirmed=1'/);
  assert.match(source, /function buildEmailConfirmationRedirectUrl\(\) \{\s*return `\$\{config\.appUrl\.replace\(\/\\\/\+\$\/, ''\)\}\$\{emailConfirmationRedirectPath\}`/);
  assert.match(appSource, /path="\/login"/);
});

test('a successful registration returns no session, no token and no user id', async () => {
  const source = await read('Back/src/routes/auth.ts');
  const handler = await readRegisterHandler();
  const responseBuilder = source.slice(source.indexOf('function buildRegistrationResponse'));

  assert.match(handler, /res\.status\(201\)\.json\(buildRegistrationResponse\(email, authAccountType, !data\.session\)\)/);
  assert.match(responseBuilder, /success: true/);
  assert.match(responseBuilder, /requires_email_confirmation: requiresEmailConfirmation/);
  assert.doesNotMatch(responseBuilder, /access_token|refresh_token|session|data\.user\.id/);
});

test('the API client types registration as a confirmation handshake without a session', async () => {
  const source = await read('Front/src/lib/api.ts');
  const type = source.slice(source.indexOf('export type RegistrationResult'), source.indexOf('export type ReferralMe'));

  assert.match(type, /requires_email_confirmation: boolean/);
  assert.doesNotMatch(type, /access_token|refresh_token|id: string/);
  assert.match(source, /register: \(body: \{[^)]*\}\) => request<RegistrationResult>\('\/api\/auth\/register'/);
  assert.match(source, /resendConfirmationEmail: \(body: \{ email: string \}\)[\s\S]*'\/api\/auth\/resend-confirmation'/);
});

test('the register screen never signs the visitor in after creating the account', async () => {
  const source = await read('Front/src/pages/RegisterPage.tsx');
  const registerFn = source.slice(source.indexOf('async function register()'), source.indexOf('async function resendConfirmationEmail()'));

  assert.ok(registerFn.length > 0);
  assert.doesNotMatch(registerFn, /signInWithPassword/);
  assert.doesNotMatch(registerFn, /navigate\(/);
  assert.match(registerFn, /setPendingConfirmationEmail\(normalizedEmail\)/);
  // Google OAuth is a different flow and keeps its own redirect.
  assert.doesNotMatch(source, /supabase\.auth\.signInWithPassword/);
});

test('the register screen shows the inbox prompt, the spam hint and a way back to sign in', async () => {
  const source = await read('Front/src/pages/RegisterPage.tsx');
  const card = source.slice(source.indexOf('{pendingConfirmationEmail ? ('), source.indexOf(') : ('));

  assert.match(card, /t\('auth\.confirm\.title'\)/);
  assert.match(card, /t\('auth\.confirm\.body', \{ email: pendingConfirmationEmail \}\)/);
  assert.match(card, /t\('auth\.confirm\.notActiveYet'\)/);
  assert.match(card, /t\('auth\.confirm\.spamHint'\)/);
  assert.match(card, /t\('auth\.confirm\.backToLogin'\)/);
  assert.match(card, /to="\/login"/);
});

test('every confirmation string exists in Polish, German and English', async () => {
  const locales = await readLocales();
  const keys = [
    'auth.confirm.title',
    'auth.confirm.body',
    'auth.confirm.notActiveYet',
    'auth.confirm.spamHint',
    'auth.confirm.resend',
    'auth.confirm.resendSent',
    'auth.confirm.resendTooSoon',
    'auth.confirm.resendFailed',
    'auth.confirm.backToLogin',
    'auth.confirm.confirmedNotice'
  ];

  for (const key of keys) {
    for (const lang of ['pl', 'de', 'en'] as const) {
      const value = locales[lang][key];
      assert.equal(typeof value, 'string', `${key} is missing in ${lang}`);
      assert.ok(value.trim().length > 0, `${key} is empty in ${lang}`);
    }
    assert.equal(new Set(['pl', 'de', 'en'].map((lang) => locales[lang][key])).size, 3, `${key} is not translated`);
  }

  assert.match(locales.pl['auth.confirm.body'], /\{\{email\}\}/);
  assert.match(locales.de['auth.confirm.body'], /\{\{email\}\}/);
  assert.match(locales.en['auth.confirm.body'], /\{\{email\}\}/);
  assert.match(locales.pl['auth.confirm.spamHint'], /SPAM/);
  assert.match(locales.de['auth.confirm.spamHint'], /SPAM/);
  assert.match(locales.en['auth.confirm.spamHint'], /SPAM/);
  assert.equal(Object.keys(locales.pl).length, Object.keys(locales.de).length);
  assert.equal(Object.keys(locales.pl).length, Object.keys(locales.en).length);
});

test('an unsupported account type is rejected instead of silently downgraded', async () => {
  const handler = await readRegisterHandler();

  assert.match(handler, /if \(requestedAccountType && !normalizeAuthAccountType\(requestedAccountType\)\) \{\s*return res\.status\(400\)\.json\(\{ error: 'Unsupported account type' \}\);/);
  assert.ok(
    handler.indexOf("res.status(400).json({ error: 'Unsupported account type' })") < handler.indexOf('supabaseAnon.auth.signUp'),
    'the account type is validated before any account is created'
  );
});

test('public registration cannot mint an admin or any role outside the allow list', async () => {
  const source = await readCode('Back/src/routes/auth.ts');
  const handler = await readRegisterHandler();

  assert.match(source, /const allowedAuthAccountTypes = \['client', 'escort', 'business'\] as const/);
  assert.match(handler, /auth_account_type: authAccountType/);
  assert.doesNotMatch(handler, /\brole\b/);
  assert.doesNotMatch(handler, /req\.body\.(role|app_metadata|admin)/);
  assert.doesNotMatch(handler, /'admin'|"admin"/);

  const { normalizeAuthAccountType } = await loadAuthRoute();
  assert.equal(normalizeAuthAccountType('admin'), null);
  assert.equal(normalizeAuthAccountType('moderator'), null);
  assert.equal(normalizeAuthAccountType('service_role'), null);
  assert.equal(normalizeAuthAccountType('client'), 'client');
  assert.equal(normalizeAuthAccountType('escort'), 'escort');
  assert.equal(normalizeAuthAccountType('business'), 'business');
});

test('the account type the visitor asks for is stored as a breadcrumb, never as an authority', async () => {
  const source = await read('Back/src/routes/auth.ts');
  const handler = await readRegisterHandler();

  // user_metadata is writable by the account owner, so the sign up call may carry the requested
  // type only as recovery information; app_metadata written with the service role decides.
  assert.match(handler, /requested_auth_account_type: authAccountType/);
  assert.match(handler, /app_metadata: \{\s*auth_account_type: authAccountType/);
  assert.doesNotMatch(source, /user_metadata\?\.\s*auth_account_type|raw_user_meta_data.*auth_account_type/);
});

test('an existing address gets exactly the same answer as a fresh one', async () => {
  const source = await readCode('Back/src/routes/auth.ts');
  const handler = await readRegisterHandler();
  const obfuscationGuard = source.slice(source.indexOf('function isObfuscatedExistingUser'));

  assert.match(obfuscationGuard, /Array\.isArray\(user\.identities\) && user\.identities\.length === 0/);
  assert.match(handler, /if \(isObfuscatedExistingUser\(data\.user\)\) \{\s*return res\.status\(201\)\.json\(buildRegistrationResponse\(email, authAccountType, true\)\);/);
  assert.ok(
    handler.indexOf('isObfuscatedExistingUser(data.user)') < handler.indexOf("rpc('assign_referral'"),
    'the referral RPC must not run for the placeholder user, it would raise and expose the address'
  );
  assert.doesNotMatch(handler, /already registered|already exists|user_exists/i);
});

test('a failing confirmation email is reported instead of a fake success', async () => {
  const handler = await readRegisterHandler();

  assert.match(handler, /if \(error \|\| !data\.user\) \{[\s\S]*error\?\.status && error\.status >= 500 \? 502 : 400/);
  assert.match(handler, /return res\.status\(status\)\.json\(\{ error: error\?\.message \|\| 'Registration failed' \}\)/);
  assert.ok(
    handler.indexOf('if (error || !data.user)') < handler.indexOf('res.status(201)'),
    'a sign up error can never fall through to the success response'
  );
});

test('resending a confirmation reports throttling and transport failures but hides the address', async () => {
  const source = await readCode('Back/src/routes/auth.ts');
  const handler = source.slice(source.indexOf("authRouter.post('/resend-confirmation'"), source.indexOf('function buildEmailConfirmationRedirectUrl'));

  assert.match(handler, /supabaseAnon\.auth\.resend\(\{\s*type: 'signup'/);
  assert.match(handler, /error\?\.status === 429[\s\S]*res\.status\(429\)[\s\S]*CONFIRMATION_RESEND_RATE_LIMITED/);
  assert.match(handler, /error\?\.status && error\.status >= 500[\s\S]*res\.status\(502\)[\s\S]*CONFIRMATION_EMAIL_SEND_FAILED/);
  assert.match(handler, /res\.json\(\{ success: true, requires_email_confirmation: true \}\)/);
  assert.doesNotMatch(handler, /not found|unknown address|already confirmed/i);
});

test('the confirmation return route does not strand the visitor on an empty page', async () => {
  const [loginSource, clientSource] = await Promise.all([
    read('Front/src/pages/LoginPage.tsx'),
    read('Front/src/lib/supabase.ts')
  ]);

  assert.match(clientSource, /detectSessionInUrl: true/);
  assert.match(loginSource, /searchParams\.get\('confirmed'\) === '1'/);
  assert.match(loginSource, /setConfirmationNotice\(t\('auth\.confirm\.confirmedNotice'\)\)/);
  assert.match(loginSource, /waitForSupabaseSession\(\)[\s\S]*navigate\(nextPath, \{ replace: true \}\)/);
  assert.match(loginSource, /\{confirmationNotice && <p className="subscription-notice">\{confirmationNotice\}<\/p>\}/);
});

test('the password sign in of confirmed accounts is left untouched', async () => {
  const [loginSource, middlewareSource] = await Promise.all([
    read('Front/src/pages/LoginPage.tsx'),
    read('Back/src/middleware/auth.ts')
  ]);
  const submit = loginSource.slice(loginSource.indexOf('async function handleSubmit'), loginSource.indexOf('async function signInWithGoogle'));

  assert.match(submit, /supabase\.auth\.signInWithPassword\(\{ email: normalizedEmail, password \}\)/);
  assert.match(submit, /saveLoginSessionHandoff\(session\)/);
  assert.match(submit, /navigate\(nextPath, \{ replace: true \}\)/);
  assert.match(middlewareSource, /supabaseAnon\.auth\.getUser\(token\)/);
  assert.match(middlewareSource, /return res\.status\(401\)\.json\(\{ error: 'Invalid or expired token' \}\)/);
});

test('owner_email still never links a profile to a signup', async () => {
  const [authSource, profilesSource] = await Promise.all([
    readCode('Back/src/routes/auth.ts'),
    readCode('Back/src/routes/profiles.ts')
  ]);
  const combined = `${authSource}\n${profilesSource}`;

  assert.doesNotMatch(combined, /ilike\('owner_email'/);
  assert.doesNotMatch(combined, /is\('user_id', null\)/);
  assert.doesNotMatch(combined, /\.update\(\{ user_id/);
  assert.doesNotMatch(authSource, /owner_email/);
});

test('the referral chain and the no-delete rule survive the new signup path', async () => {
  const source = await read('Back/src/routes/auth.ts');

  assert.match(source, /rpc\('assign_referral'/);
  assert.match(source, /p_referral_code: referredByCode \|\| null/);
  assert.match(source, /retrying root fallback/);
  assert.match(source, /referral_pending: true/);
  assert.doesNotMatch(source, /deleteUser/);
});

test('sponsored profiles keep the tokenized claim and grow no auth accounts of their own', async () => {
  const [authSource, sponsoredSource, agentSource, sql] = await Promise.all([
    readCode('Back/src/routes/auth.ts'),
    read('Back/src/routes/sponsoredProfiles.ts'),
    read('Back/src/services/sponsoredProfileAgent.ts'),
    read('supabase/migrations/052_sponsored_profiles_ai_bcu.sql')
  ]);

  assert.match(sponsoredSource, /claim_admin_sponsored_profile/);
  assert.match(sponsoredSource, /sponsoredProfilesRouter\.use\(verifyUser\)/);
  assert.doesNotMatch(sponsoredSource, /auth\.admin\.createUser|auth\.signUp/);
  assert.doesNotMatch(agentSource, /auth\.admin\.createUser|auth\.signUp/);
  assert.doesNotMatch(authSource, /sponsoring|support\.escort-radar\.fun/);
  assert.match(sql, /if v_profile\.user_id is null then\s*raise exception 'SPONSORED_CLAIM_TECHNICAL_OWNER_REQUIRED'/);
});
