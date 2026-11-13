import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// ER-V1-PUBLIC-PREVIEW-003: pre-launch interest list (double opt-in), off by default.
process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role';
process.env.SUPABASE_ANON_KEY ||= 'test-anon';
const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const SECRET = 'x'.repeat(40);

test('collection and launch sending default to off and are independent of commercial operations', async () => {
  const source = await read('Back/src/config.ts');
  assert.match(source, /waitlistCollectionEnabled: envBoolean\('WAITLIST_COLLECTION_ENABLED', false\)/);
  assert.match(source, /waitlistLaunchSendEnabled: envBoolean\('WAITLIST_LAUNCH_SEND_ENABLED', false\)/);
  const waitlist = await read('Back/src/waitlist.ts');
  const open = waitlist.slice(waitlist.indexOf('export function waitlistCollectionOpen'), waitlist.indexOf('let transporter'));
  assert.doesNotMatch(open, /commercial/i);
  const { config } = await import('../Back/src/config.ts');
  const { waitlistCollectionOpen, waitlistMailConfigured } = await import('../Back/src/waitlist.ts');
  const { publicPlatformStatus } = await import('../Back/src/commercialOperations.ts');
  const saved = { enabled: config.waitlistCollectionEnabled, smtp: { ...config.waitlistSmtp }, secret: config.waitlistTokenSecret };
  try {
    if (!process.env.WAITLIST_COLLECTION_ENABLED) assert.equal(publicPlatformStatus().waitlist_enabled, false);
    config.waitlistCollectionEnabled = true;
    config.waitlistSmtp.host = '';
    assert.equal(waitlistCollectionOpen(), false, 'no mail service: list stays closed');
    config.waitlistSmtp.host = 'smtp.example.invalid';
    config.waitlistSmtp.from = 'Escort-Radar <noreply@example.invalid>';
    config.waitlistTokenSecret = 'short';
    assert.equal(waitlistMailConfigured(), false, 'weak secret: closed');
    config.waitlistTokenSecret = SECRET;
    assert.equal(waitlistCollectionOpen(), true);
    assert.equal(publicPlatformStatus().commercial_operations_enabled, false, 'opening the list does not open commerce');
    assert.equal(publicPlatformStatus().registration_open, false, 'opening the list does not open registration');
  } finally {
    config.waitlistCollectionEnabled = saved.enabled;
    Object.assign(config.waitlistSmtp, saved.smtp);
    config.waitlistTokenSecret = saved.secret;
  }
});

test('submissions need a valid address, a known segment and explicit consent to the current text', async () => {
  const { validateWaitlistSubmission, WAITLIST_CONSENT_VERSION } = await import('../Back/src/waitlist.ts');
  const base = { email: ' Person@Example.COM ', interest_type: 'client_premium', consent: true, consent_version: WAITLIST_CONSENT_VERSION, language: 'pl', source_page: 'fanpage' };
  const ok = validateWaitlistSubmission(base);
  assert.ok(ok.ok && ok.value.email === 'person@example.com' && ok.value.preferred_language === 'pl' && !ok.honeypot);
  assert.deepEqual(validateWaitlistSubmission({ ...base, email: 'nope' }), { ok: false, code: 'WAITLIST_INVALID_EMAIL' });
  assert.deepEqual(validateWaitlistSubmission({ ...base, email: 'a"b@example.com' }), { ok: false, code: 'WAITLIST_INVALID_EMAIL' });
  assert.deepEqual(validateWaitlistSubmission({ ...base, interest_type: 'business' }), { ok: false, code: 'WAITLIST_INVALID_INTEREST' });
  for (const consent of [false, 'true', 1, undefined]) assert.deepEqual(validateWaitlistSubmission({ ...base, consent }), { ok: false, code: 'WAITLIST_CONSENT_REQUIRED' });
  assert.deepEqual(validateWaitlistSubmission({ ...base, consent_version: 'old' }), { ok: false, code: 'WAITLIST_CONSENT_REQUIRED' });
  const odd = validateWaitlistSubmission({ ...base, language: 'fr', source_page: '/evil?x=1' });
  assert.ok(odd.ok && odd.value.preferred_language === 'de' && odd.value.source_page === 'other');
  const bot = validateWaitlistSubmission({ ...base, website: 'http://spam' });
  assert.ok(bot.ok && bot.honeypot);
});

test('confirmation tokens are random, stored only as a hash; unsubscribe links are bound to one record', async () => {
  const { createConfirmToken, hashWaitlistToken, isWellFormedToken, unsubscribeToken, verifyUnsubscribeToken } = await import('../Back/src/waitlist.ts');
  const a = createConfirmToken();
  const b = createConfirmToken();
  assert.notEqual(a.token, b.token);
  assert.ok(isWellFormedToken(a.token));
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.equal(hashWaitlistToken(a.token), a.hash);
  assert.notEqual(a.hash, a.token);
  const id = '11111111-2222-3333-4444-555555555555';
  const other = '11111111-2222-3333-4444-666666666666';
  const token = unsubscribeToken(id, SECRET);
  assert.ok(verifyUnsubscribeToken(id, token, SECRET));
  assert.ok(!verifyUnsubscribeToken(other, token, SECRET));
  assert.ok(!verifyUnsubscribeToken(id, `${token}x`, SECRET));
  assert.ok(!verifyUnsubscribeToken(id, token, 'short'));
});

test('e-mails state price, the non-binding nature and offer withdrawal in every language', async () => {
  const { config } = await import('../Back/src/config.ts');
  const { confirmationMail, launchMail, alreadyConfirmedMail } = await import('../Back/src/waitlist.ts');
  const saved = config.waitlistTokenSecret;
  config.waitlistTokenSecret = SECRET;
  try {
    const leadId = '11111111-2222-3333-4444-555555555555';
    const expectations = { de: ['0,99 €', 'kein Konto', 'Zahlungspflicht'], pl: ['0,99 EUR', 'konta', 'obowiązku zapłaty'], en: ['EUR 0.99', 'account', 'payment obligation'] } as const;
    for (const language of ['de', 'pl', 'en'] as const) {
      const mail = confirmationMail({ to: 'a@example.com', leadId, token: 'T'.repeat(43), type: 'client_premium', language });
      for (const phrase of expectations[language]) assert.ok(mail.text.includes(phrase), `${language}: ${phrase}`);
      assert.match(mail.text, /\/waitlist\/confirm\?token=T{43}/);
      assert.match(mail.text, /\/waitlist\/unsubscribe\?id=/);
      assert.ok(mail.unsubscribeUrl);
      assert.doesNotMatch(mail.html, /<script/i);
      const launch = launchMail({ to: 'a@example.com', leadId, type: 'advertiser', language });
      assert.match(launch.text, /49[,.]99/);
      assert.match(launch.text, /\/waitlist\/unsubscribe\?id=/);
      assert.ok(alreadyConfirmedMail({ to: 'a@example.com', leadId, type: 'advertiser', language }).subject);
    }
    // No Polish characters in German or English mail copy.
    for (const language of ['de', 'en'] as const) {
      const all = [confirmationMail({ to: 'a@example.com', leadId, token: 'T'.repeat(43), type: 'advertiser', language }), launchMail({ to: 'a@example.com', leadId, type: 'client_premium', language })].map((mail) => mail.subject + mail.text).join(' ');
      assert.doesNotMatch(all, /[ąćęłńśźż]/i);
    }
  } finally {
    config.waitlistTokenSecret = saved;
  }
});

test('lead figures count confirmed records only and never expose addresses', async () => {
  const { summarizeLeads } = await import('../Back/src/waitlist.ts');
  const now = new Date('2026-11-13T12:00:00Z');
  const row = (status: 'pending' | 'confirmed' | 'unsubscribed', type: 'client_premium' | 'advertiser', person: string, confirmed: string | null, created = '2026-11-12T10:00:00Z', language = 'de', source = 'fanpage') => ({
    interest_type: type, preferred_language: language, status, source_page: source, created_at: created, confirmed_at: confirmed,
    unsubscribed_at: status === 'unsubscribed' ? '2026-11-13T09:00:00Z' : null, confirm_token_expires_at: status === 'pending' ? '2026-11-14T00:00:00Z' : null, person
  });
  const summary = summarizeLeads([
    row('confirmed', 'client_premium', 'p1', '2026-11-12T11:00:00Z'),
    row('confirmed', 'advertiser', 'p1', '2026-11-12T11:30:00Z', '2026-11-12T10:00:00Z', 'pl', 'register'),
    row('confirmed', 'advertiser', 'p2', '2026-10-01T11:00:00Z', '2026-10-01T10:00:00Z'),
    row('unsubscribed', 'client_premium', 'p3', '2026-11-10T11:00:00Z'),
    row('pending', 'client_premium', 'p4', null)
  ], now, 30);
  assert.equal(summary.confirmed_people, 2);
  assert.equal(summary.confirmed_total, 3);
  assert.equal(summary.confirmed_client_premium, 1);
  assert.equal(summary.confirmed_advertiser, 2);
  assert.equal(summary.pending, 1);
  assert.equal(summary.unsubscribed, 1);
  assert.equal(summary.new_confirmed_7d, 3);
  assert.equal(summary.new_confirmed_30d, 3);
  assert.equal(summary.confirmation_rate, 80);
  assert.deepEqual(summary.languages, [{ name: 'de', count: 2 }, { name: 'pl', count: 1 }]);
  assert.equal(summary.daily.length, 30);
  assert.equal(summary.daily.find((day) => day.day === '2026-11-12')?.advertiser, 1);
  assert.equal(summarizeLeads([], now).confirmation_rate, null, 'no invented rate without data');
});

test('routes: closed list refuses before parsing; withdrawal always works; admin only for lead data', async () => {
  const routes = await read('Back/src/routes/waitlist.ts');
  const interest = routes.slice(routes.indexOf("waitlistRouter.post('/interest'"), routes.indexOf("waitlistRouter.post('/confirm'"));
  assert.ok(interest.indexOf('if (!waitlistCollectionOpen()) return closedResponse(res);') < interest.indexOf('validateWaitlistSubmission'));
  assert.ok(interest.indexOf('decision.honeypot') < interest.indexOf("from('waitlist_leads')"));
  assert.match(interest, /return res\.status\(202\)\.json\(NEUTRAL\)/);
  assert.doesNotMatch(interest, /auth\.(signUp|admin)/, 'no account is created');
  const unsubscribe = routes.slice(routes.indexOf("waitlistRouter.post('/unsubscribe'"));
  assert.doesNotMatch(unsubscribe.slice(0, 300), /waitlistCollectionOpen/);
  const admin = await read('Back/src/routes/admin.ts');
  assert.ok(admin.indexOf("adminRouter.use(verifyAdminJwt, requireAdmin);") < admin.indexOf("adminRouter.use('/leads', adminLeadsRouter);"));
  const leads = await read('Back/src/routes/adminLeads.ts');
  assert.match(leads, /writeAdminAuditLog\(adminEmail\(req\), 'waitlist_export'/);
  const send = leads.slice(leads.indexOf("'/announcements/send'"));
  assert.ok(send.indexOf('if (!config.waitlistLaunchSendEnabled)') < send.indexOf('sendWaitlistMail'));
  assert.doesNotMatch(leads, /from\('(manual_payment_orders|client_entitlements|token_purchase_requests|profiles|client_profiles)'\)/, 'leads are not mixed with customers or payments');
  const server = await read('Back/src/server.ts');
  assert.match(server, /app\.use\('\/api\/waitlist', waitlistRouter\);/);
  assert.match(server, /startWaitlistRetention\(\);/);
});

test('migration 063: strict RLS, no client access, no sensitive columns, one record per segment', async () => {
  const sql = await read('supabase/migrations/063_waitlist_leads.sql');
  for (const table of ['waitlist_leads', 'waitlist_announcements', 'waitlist_deliveries']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`));
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated;`));
  }
  assert.doesNotMatch(sql, /grant [^;]* to (anon|authenticated)/i);
  assert.doesNotMatch(sql, /create policy/i);
  assert.match(sql, /unique index if not exists waitlist_leads_email_interest_key on public\.waitlist_leads \(email, interest_type\)/);
  assert.match(sql, /unique index if not exists waitlist_announcements_segment_key/);
  const columns = sql.slice(sql.indexOf('create table if not exists public.waitlist_leads'), sql.indexOf('create unique index')).split(/\r?\n/).filter((line) => !line.trim().startsWith('--')).join(' ');
  assert.doesNotMatch(columns, /password|phone|address|iban|card|ip_|user_agent|preference|history/i);
  assert.match(sql, /grant execute on function public\.prune_waitlist\(integer, integer, integer\) to service_role;/);
});

test('frontend: two actions only during the preview with an open list, no account fields, consent unchecked', async () => {
  const component = await read('Front/src/components/WaitlistInterest.tsx');
  assert.match(component, /const active = platform\.loaded && !platform\.commercial_operations_enabled && platform\.waitlist_enabled;/);
  assert.match(component, /if \(!active\) return <>\{fallback \?\? null\}<\/>;/);
  assert.match(component, /const \[consent, setConsent\] = useState\(false\);/);
  assert.doesNotMatch(component, /type="password"|type="tel"|textarea|signUp|api\.register/);
  const backend = await read('Back/src/waitlist.ts');
  const version = component.match(/WAITLIST_CONSENT_VERSION = '([^']+)'/)?.[1];
  assert.ok(version && backend.includes(`WAITLIST_CONSENT_VERSION = '${version}'`), 'frontend and backend consent versions match');
  const status = await read('Front/src/lib/platformStatus.ts');
  assert.match(status, /PUBLIC_PREVIEW_STATUS: PlatformStatus = \{[\s\S]*waitlist_enabled: false/);
  const home = await read('Front/src/pages/HomePage.tsx');
  assert.equal((home.match(/<WaitlistInterestButton type="client_premium"/g) || []).length, 2);
  assert.equal((home.match(/<WaitlistInterestButton type="advertiser"/g) || []).length, 3);
  assert.equal((home.match(/fallback=\{<Link to="\/register/g) || []).length, 5, 'each action replaces an existing call to action');
  const app = await read('Front/src/App.tsx');
  assert.match(app, /path="\/waitlist\/confirm"/);
  assert.match(app, /path="\/waitlist\/unsubscribe"/);
});

test('lead texts exist in DE/PL/EN with the approved button labels and no Polish on DE/EN pages', async () => {
  const [de, pl, en] = await Promise.all(['de', 'pl', 'en'].map(async (language) => JSON.parse(await read(`Front/src/locales/${language}.json`)) as Record<string, string>));
  assert.equal(de['waitlist.button.client_premium'], 'Ich interessiere mich für Premium');
  assert.equal(pl['waitlist.button.client_premium'], 'Jestem zainteresowany Premium');
  assert.equal(en['waitlist.button.client_premium'], "I'm interested in Premium");
  assert.equal(de['waitlist.button.advertiser'], 'Ich möchte ein Inserat schalten');
  assert.equal(pl['waitlist.button.advertiser'], 'Chcę dodać ogłoszenie');
  assert.equal(en['waitlist.button.advertiser'], 'I want to advertise');
  const keys = Object.keys(pl).filter((key) => key.startsWith('waitlist.') || key.startsWith('admin.leads.') || key === 'admin.nav.leads');
  assert.ok(keys.length > 90);
  for (const key of keys) {
    assert.ok(de[key] && en[key], `missing ${key}`);
    assert.doesNotMatch(de[key], /[ąćęłńśźż]/i, `Polish in DE ${key}`);
    assert.doesNotMatch(en[key], /[ąćęłńśźż]/i, `Polish in EN ${key}`);
  }
  for (const dict of [de, pl, en]) {
    for (const key of ['account', 'order', 'reservation', 'payment', 'availability']) assert.ok(dict[`waitlist.notice.${key}`]);
    assert.match(dict['waitlist.product.client_premium.price'], /0[,.]99/);
    assert.match(dict['waitlist.product.advertiser.price'], /49[,.]99/);
  }
});
