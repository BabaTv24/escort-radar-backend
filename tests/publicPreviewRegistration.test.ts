import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// ER-V1-PUBLIC-PREVIEW-003: public preview = public browsing without new accounts.
// FREE is the status of a registered customer before the 0.99 EUR activation, not a product of its own.
process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role';
process.env.SUPABASE_ANON_KEY ||= 'test-anon';
const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function registerHandler(source: string) {
  return source.slice(source.indexOf("authRouter.post('/register'"), source.indexOf("authRouter.post('/resend-confirmation'"));
}

test('registration is open exactly when commercial operations are enabled', async () => {
  const { config } = await import('../Back/src/config.ts');
  const { isRegistrationOpen, publicPlatformStatus, REGISTRATION_CLOSED } = await import('../Back/src/commercialOperations.ts');
  const previous = config.commercialOperationsEnabled;
  try {
    (config as { commercialOperationsEnabled: boolean }).commercialOperationsEnabled = false;
    assert.equal(isRegistrationOpen(), false);
    assert.equal(publicPlatformStatus().registration_open, false);
    assert.equal(publicPlatformStatus().advertiser_registration_open, false);
    (config as { commercialOperationsEnabled: boolean }).commercialOperationsEnabled = true;
    assert.equal(isRegistrationOpen(), true);
    assert.equal(publicPlatformStatus().registration_open, true);
    assert.equal(publicPlatformStatus().purchases_enabled, true);
  } finally {
    (config as { commercialOperationsEnabled: boolean }).commercialOperationsEnabled = previous;
  }
  assert.equal(REGISTRATION_CLOSED, 'REGISTRATION_CLOSED');
});

test('the register endpoint refuses every account type before any Supabase call', async () => {
  const handler = registerHandler(await read('Back/src/routes/auth.ts'));
  const gate = handler.indexOf('if (!isRegistrationOpen())');
  assert.ok(gate > 0, 'gate present');
  assert.ok(gate < handler.indexOf('req.body'), 'gate runs before the request body is read');
  assert.ok(gate < handler.indexOf('supabaseAnon.auth.signUp'), 'gate runs before sign up');
  assert.ok(gate < handler.indexOf('supabaseAdmin'), 'gate runs before admin calls');
  assert.match(handler.slice(gate, gate + 200), /res\.status\(403\)\.json\(\{[^}]*code: REGISTRATION_CLOSED/);
  // The previous advertiser-only gate is gone; nothing in the handler depends on the account type for the gate.
  assert.doesNotMatch(handler, /ADVERTISER_REGISTRATION_CLOSED/);
});

test('the register page shows no account form while registration is closed', async () => {
  const page = await read('Front/src/pages/RegisterPage.tsx');
  assert.match(page, /const registrationOpen = platform\.loaded && platform\.registration_open;/);
  const early = page.indexOf('if (!registrationOpen) return <RegistrationPreview />;');
  assert.ok(early > 0 && early < page.indexOf('<input'), 'the preview is returned before any input is rendered');
  const preview = page.slice(page.indexOf('function RegistrationPreview()'));
  assert.ok(preview.length > 100);
  for (const forbidden of ['<input', '<form', 'type="password"', 'api.register', 'signInWithOAuth', 'onClick']) {
    assert.ok(!preview.includes(forbidden), `preview contains ${forbidden}`);
  }
  assert.match(preview, /to="\/city\/berlin"[\s\S]*register\.preview\.cta/);
  assert.match(preview, /to="\/login"/);
  assert.match(preview, /register\.path\.clientText/);
  assert.match(preview, /register\.advertiser\.benefit\.subscription/);
  assert.doesNotMatch(preview, /\bfree\b|Free|FREE/);
});

test('the preview copy matches the approved wording in every language', async () => {
  const [de, pl, en] = await Promise.all(['de', 'pl', 'en'].map(async (language) => JSON.parse(await read(`Front/src/locales/${language}.json`))));
  assert.equal(de['register.preview.message'], 'Escort-Radar befindet sich in der öffentlichen Vorschau. Die Registrierung und Premium-Aktivierung starten in Kürze. Den LIVE-Radar kannst du bereits ohne Konto nutzen.');
  assert.equal(pl['register.preview.message'], 'Escort-Radar jest dostępny w publicznej wersji demonstracyjnej. Rejestracja i aktywacja Premium zostaną uruchomione wkrótce. LIVE Radar możesz już przeglądać bez konta.');
  assert.equal(en['register.preview.message'], 'Escort-Radar is currently in public preview. Registration and Premium activation are coming soon. You can already explore the LIVE Radar without an account.');
  assert.equal(de['register.preview.cta'], 'LIVE-Radar entdecken');
  assert.equal(pl['register.preview.cta'], 'Otwórz LIVE Radar');
  assert.equal(en['register.preview.cta'], 'Explore LIVE Radar');
  for (const dict of [de, pl, en]) {
    for (const key of ['eyebrow', 'title', 'existingAccount', 'offersEyebrow', 'soon']) assert.ok(dict[`register.preview.${key}`], key);
    assert.match(dict['register.path.clientText'], /0[,.]99/);
    assert.match(dict['register.advertiser.benefit.subscription'], /49[,.]99/);
  }
});

test('the frontend assumes closed registration until the server says otherwise', async () => {
  const status = await read('Front/src/lib/platformStatus.ts');
  assert.match(status, /PUBLIC_PREVIEW_STATUS: PlatformStatus = \{[\s\S]*registration_open: false,/);
});
