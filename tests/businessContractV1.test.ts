import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createFakeDatabase, installFakeSupabase, type FakeDatabase } from './fixtures/fakeSupabase.ts';

// Offline: every Supabase call is answered by the in-memory fake; nothing reaches a real project.
process.env.SUPABASE_URL = 'http://127.0.0.1:9';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'offline-test-service-key';
process.env.SUPABASE_ANON_KEY = 'offline-test-anon-key';
process.env.OPENAI_API_KEY = '';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const modulesPromise = (async () => ({
  express: (await import('express')).default,
  supabaseModule: await import('../Back/src/supabase.ts'),
  config: (await import('../Back/src/config.ts')).config,
  giftsRouter: (await import('../Back/src/routes/gifts.ts')).giftsRouter,
  referralsRouter: (await import('../Back/src/routes/referrals.ts')).referralsRouter,
  profilesModule: await import('../Back/src/routes/profiles.ts')
}))();

const users = {
  'free-token': { id: 'free-1', email: 'free@example.test', app_metadata: { auth_account_type: 'client' } },
  'premium-token': { id: 'premium-1', email: 'premium@example.test', app_metadata: { auth_account_type: 'client' } },
  'owner-token': { id: 'owner-1', email: 'owner@example.test', app_metadata: { auth_account_type: 'escort', plan: 'escort_monthly', subscription_status: 'active' } },
  'lapsed-owner-token': { id: 'owner-2', email: 'lapsed@example.test', app_metadata: { auth_account_type: 'escort', plan: 'escort_monthly', subscription_status: 'past_due' } }
};
const PROFILE = '11111111-1111-4111-8111-111111111111';

async function seed(): Promise<FakeDatabase> {
  const { supabaseModule, config } = await modulesPromise;
  config.bcuWalletEnabled = true;
  const db = createFakeDatabase();
  db.tables.profiles = [{ id: PROFILE, user_id: 'owner-1', status: 'active', is_published: true, moderation_status: 'approved', shadowbanned: false, category: 'ladies' }];
  db.tables.client_activations = [{ user_id: 'premium-1', state: 'client_activated' }];
  db.tables.client_referrals = [
    { user_id: 'free-1', referral_code: 'ER-FREE0001', referral_link: 'https://escort-radar.fun/r/ER-FREE0001' },
    { user_id: 'premium-1', referral_code: 'ER-PREM0001', referral_link: 'https://escort-radar.fun/r/ER-PREM0001' },
    { user_id: 'owner-1', referral_code: 'ER-OWNR0001', referral_link: 'https://escort-radar.fun/r/ER-OWNR0001' }
  ];
  db.tables.qr_codes = [];
  db.tables.system_bcu_products = [];
  db.tables.radar_notifications = [];
  db.rpcHandlers.assign_referral = () => ({ data: null, error: null });
  db.rpcHandlers.get_admin_referral_tree = () => ({ data: [], error: null });
  installFakeSupabase(supabaseModule, db, users);
  return db;
}

async function withServer<T>(run: (call: (method: string, path: string, token?: string, body?: unknown) => Promise<{ status: number; body: any }>) => Promise<T>) {
  const { express, giftsRouter, referralsRouter } = await modulesPromise;
  const app = express();
  app.use(express.json());
  app.use('/api/gifts', giftsRouter);
  app.use('/api/referrals', referralsRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await run(async (method, path, token, body) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('gift catalog lists Diamond I-V and none is purchasable until BOSS sets a price', async () => {
  await seed();
  await withServer(async (call) => {
    const catalog = await call('GET', '/api/gifts/catalog');
    assert.equal(catalog.status, 200);
    assert.deepEqual(catalog.body.gifts.map((gift: any) => gift.name), ['Diamond I', 'Diamond II', 'Diamond III', 'Diamond IV', 'Diamond V']);
    assert.ok(catalog.body.gifts.every((gift: any) => gift.configured === false && gift.price_bc === null));
  });
});

test('a configured gift is listed with the catalog price only', async () => {
  const db = await seed();
  db.tables.system_bcu_products = [
    { product_code: 'gift_diamond_2', amount_bcu: 120000, operation_type: 'transfer', active: true },
    { product_code: 'gift_diamond_3', amount_bcu: 90000, operation_type: 'transfer', active: false }
  ];
  await withServer(async (call) => {
    const { body } = await call('GET', '/api/gifts/catalog');
    assert.deepEqual(body.gifts.filter((gift: any) => gift.configured).map((gift: any) => [gift.level, gift.price_bc]), [[2, '12']]);
  });
});

test('sending a gift requires a Premium client, a valid level and an idempotency key', async () => {
  const db = await seed();
  await withServer(async (call) => {
    assert.equal((await call('POST', `/api/gifts/${PROFILE}`, undefined, { level: 1, idempotency_key: 'gift-attempt-1' })).status, 401);
    assert.equal((await call('POST', `/api/gifts/${PROFILE}`, 'owner-token', { level: 1, idempotency_key: 'gift-attempt-1' })).status, 403);
    const free = await call('POST', `/api/gifts/${PROFILE}`, 'free-token', { level: 1, idempotency_key: 'gift-attempt-1' });
    assert.equal(free.status, 403);
    assert.equal(free.body.code, 'CLIENT_ACTIVATION_REQUIRED');
    assert.equal((await call('POST', `/api/gifts/${PROFILE}`, 'premium-token', { level: 6, idempotency_key: 'gift-attempt-1' })).body.code, 'GIFT_LEVEL_INVALID');
    assert.equal((await call('POST', `/api/gifts/${PROFILE}`, 'premium-token', { level: 1 })).body.code, 'GIFT_IDEMPOTENCY_KEY_INVALID');
  });
  assert.equal(db.rpcCalls.length, 0);
});

test('an unconfigured gift is refused with no charge; a configured gift notifies the owner anonymously once', async () => {
  const db = await seed();
  const sent = new Map<string, Record<string, unknown>>();
  db.rpcHandlers.send_bcu_profile_gift = (args) => {
    if (args.p_gift_level !== 2) return { data: null, error: { message: 'GIFT_NOT_CONFIGURED' } };
    const existing = sent.get(args.p_idempotency_key);
    if (existing) return { data: { charged: false, gift: existing }, error: null };
    const gift = { id: 'gift-1', profile_id: args.p_profile_id, recipient_user_id: 'owner-1', gift_level: 2, amount_bcu: '120000' };
    sent.set(args.p_idempotency_key, gift);
    return { data: { charged: true, gift }, error: null };
  };
  await withServer(async (call) => {
    const unconfigured = await call('POST', `/api/gifts/${PROFILE}`, 'premium-token', { level: 1, idempotency_key: 'gift-attempt-1' });
    assert.equal(unconfigured.status, 409);
    assert.equal(unconfigured.body.code, 'GIFT_NOT_CONFIGURED');
    assert.equal(unconfigured.body.charged, false);
    const first = await call('POST', `/api/gifts/${PROFILE}`, 'premium-token', { level: 2, idempotency_key: 'gift-attempt-2' });
    const retry = await call('POST', `/api/gifts/${PROFILE}`, 'premium-token', { level: 2, idempotency_key: 'gift-attempt-2' });
    assert.equal(first.status, 201);
    assert.equal(first.body.charged, true);
    assert.equal(first.body.gift.amount_bc, '12');
    assert.equal(retry.body.charged, false);
  });
  assert.equal(db.tables.radar_notifications.length, 1);
  const [notification] = db.tables.radar_notifications;
  assert.equal(notification.event_type, 'gift_received');
  assert.equal(notification.user_id, 'owner-1');
  assert.doesNotMatch(JSON.stringify(notification), /premium-1|premium@example/);
});

test('gift price and recipient never come from the request body', async () => {
  const route = await read('Back/src/routes/gifts.ts');
  assert.doesNotMatch(route, /req\.body[^\n]*(?:amount|price|recipient|user_id)/);
  assert.match(route, /p_client_user_id: req\.user!\.id/);
});

test('referral link and QR: FREE client refused; Premium client and subscribed advertiser receive their own', async () => {
  await seed();
  await withServer(async (call) => {
    const free = await call('GET', '/api/referrals/me', 'free-token');
    assert.equal(free.status, 403);
    assert.equal(free.body.code, 'REFERRAL_PREMIUM_REQUIRED');
    assert.doesNotMatch(JSON.stringify(free.body), /ER-FREE/);
    const lapsed = await call('GET', '/api/referrals/me', 'lapsed-owner-token');
    assert.equal(lapsed.status, 403);
    const premium = await call('GET', '/api/referrals/me', 'premium-token');
    assert.equal(premium.status, 200);
    assert.equal(premium.body.referralCode, 'ER-PREM0001');
    const owner = await call('GET', '/api/referrals/me', 'owner-token');
    assert.equal(owner.status, 200);
    assert.equal(owner.body.referralCode, 'ER-OWNR0001');
  });
});

test('client activation summary hides the referral code, link and QR from FREE clients', async () => {
  await seed();
  const { getClientActivationSummary } = await import('../Back/src/services/clientActivation.ts');
  const free = await getClientActivationSummary('free-1');
  assert.equal(free.state, 'client_free');
  assert.equal(free.referral_code, null);
  assert.equal(free.referral_link, null);
  assert.equal(free.qr_image_url, null);
  const premium = await getClientActivationSummary('premium-1');
  assert.equal(premium.referral_code, 'ER-PREM0001');
});

test('public profile output carries only the first authorized image and no contact details', async () => {
  const { sanitizePublicProfile, PUBLIC_PROFILE_IMAGE_LIMIT } = (await modulesPromise).profilesModule;
  assert.equal(PUBLIC_PROFILE_IMAGE_LIMIT, 1);
  const images = [1, 2, 3, 4].map((index) => ({ id: `image-${index}`, storage_path: `p/${index}.jpg` }));
  const output = sanitizePublicProfile({
    id: 'p', display_name: 'Anna', profile_images: images, primary_phone: '+491700000000', whatsapp: '+491700000000', telegram: '@anna'
  }) as Record<string, any>;
  assert.equal(output.profile_images.length, 1);
  assert.equal(output.images.length, 1);
  assert.equal(output.profile_images[0].id, 'image-1');
  assert.doesNotMatch(JSON.stringify(output), /\+49170|@anna/);
});

test('profile access does not advertise video chat or unconfigured gifts', async () => {
  const route = await read('Back/src/routes/profiles.ts');
  assert.match(route, /live_cam_enabled: VIDEO_CHAT_IMPLEMENTED/);
  assert.match(route, /gifts_enabled: \(await giftCatalog\(\)\)\.some\(\(gift\) => gift\.configured\)/);
  assert.doesNotMatch(route, /live_cam_enabled: true|gifts_enabled: true/);
});

test('migration 060 keeps history and makes gifts atomic, idempotent and backend-only', async () => {
  const sql = await read('supabase/migrations/060_v1_business_contract_lock.sql');
  assert.doesNotMatch(sql, /delete from|truncate|drop table/i);
  assert.doesNotMatch(sql, /insert into public\.system_bcu_products/i);
  const gift = sql.slice(sql.indexOf('function public.send_bcu_profile_gift'));
  assert.match(gift, /pg_advisory_xact_lock/);
  assert.match(gift, /'gift_sent'[\s\S]*'gift_received'/);
  assert.match(gift, /GIFT_NOT_CONFIGURED/);
  assert.match(gift, /client_activated/);
  assert.match(sql, /idempotency_key text not null unique/);
  assert.match(sql, /revoke execute on function public\.send_bcu_profile_gift\(uuid, uuid, integer, text\) from public, anon, authenticated/);
  assert.match(sql, /revoke all on public\.bcu_profile_gifts from public, anon, authenticated/);
});
