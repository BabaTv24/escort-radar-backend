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
  advertiserActivityRouter: (await import('../Back/src/routes/advertiserActivity.ts')).advertiserActivityRouter,
  favoritesRouter: (await import('../Back/src/routes/favorites.ts')).favoritesRouter
}))();

const advertiser = { auth_account_type: 'escort', plan: 'escort_monthly', subscription_status: 'active' };
const users = {
  'owner-token': { id: 'owner-1', email: 'owner@example.test', app_metadata: advertiser },
  'other-owner-token': { id: 'owner-2', email: 'other@example.test', app_metadata: advertiser },
  'client-token': { id: 'client-1', email: 'client@example.test', app_metadata: { auth_account_type: 'client' } }
};

const day = 86_400_000;
const isoDate = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);
const credit = (user_id: string, transaction_type: string, amount_bcu: string, extra: Record<string, unknown> = {}) => ({ user_id, transaction_type, amount_bcu, direction: 'credit', status: 'completed', ...extra });

async function seed(): Promise<FakeDatabase> {
  const { supabaseModule, config } = await modulesPromise;
  config.bcuWalletEnabled = true;
  const db = createFakeDatabase();
  db.tables.profiles = [
    { id: 'p-1', user_id: 'owner-1', owner_activation_status: 'not_required', opening_hours: { timezone: 'Europe/Berlin' } },
    { id: 'p-2', user_id: 'owner-1', owner_activation_status: 'active', opening_hours: null },
    { id: 'p-hidden', user_id: 'owner-1', owner_activation_status: 'awaiting_owner_activation' },
    { id: 'p-other', user_id: 'owner-2', owner_activation_status: 'not_required' }
  ];
  db.tables.booking_requests = [
    { profile_id: 'p-1', status: 'pending', requested_date: isoDate(3), requested_time: '18:00', duration_minutes: 60 },
    { profile_id: 'p-2', status: 'pending', requested_date: isoDate(4), requested_time: '18:00', duration_minutes: 60 },
    { profile_id: 'p-1', status: 'accepted', requested_date: isoDate(5), requested_time: '20:00', duration_minutes: 60 },
    { profile_id: 'p-1', status: 'accepted', requested_date: isoDate(-5), requested_time: '20:00', duration_minutes: 60 },
    { profile_id: 'p-1', status: 'rejected', requested_date: isoDate(2), requested_time: '20:00', duration_minutes: 60 },
    { profile_id: 'p-hidden', status: 'pending', requested_date: isoDate(2), requested_time: '20:00', duration_minutes: 60 },
    { profile_id: 'p-other', status: 'pending', requested_date: isoDate(2), requested_time: '20:00', duration_minutes: 60 }
  ];
  db.tables.profile_chat_sessions = [
    { id: 's-1', profile_id: 'p-1', owner_read_at: '2026-01-01T10:00:00.000Z' },
    { id: 's-2', profile_id: 'p-2', owner_read_at: null },
    { id: 's-other', profile_id: 'p-other', owner_read_at: null }
  ];
  db.tables.profile_chat_messages = [
    { session_id: 's-1', sender_type: 'client', created_at: '2026-01-01T09:00:00.000Z' },
    { session_id: 's-1', sender_type: 'client', created_at: '2026-01-01T11:00:00.000Z' },
    { session_id: 's-1', sender_type: 'agent', created_at: '2026-01-01T11:01:00.000Z' },
    { session_id: 's-2', sender_type: 'client', created_at: '2026-01-02T11:00:00.000Z' },
    { session_id: 's-other', sender_type: 'client', created_at: '2026-01-02T11:00:00.000Z' }
  ];
  db.tables.client_favorites = [{ profile_id: 'p-1' }, { profile_id: 'p-2' }, { profile_id: 'p-1' }, { profile_id: 'p-other' }];
  db.tables.radar_notifications = [
    { id: 'n-1', user_id: 'owner-1', event_type: 'favorite_received', read_at: null },
    { id: 'n-2', user_id: 'owner-1', event_type: 'favorite_received', read_at: '2026-01-01T00:00:00.000Z' },
    { id: 'n-3', user_id: 'owner-1', event_type: 'booking_requested', read_at: null },
    { id: 'n-4', user_id: 'owner-2', event_type: 'favorite_received', read_at: null }
  ];
  db.tables.bcu_wallets = [
    { user_id: 'owner-1', balance_bcu: '1250000', locked_balance_bcu: '70000', frozen: false },
    { user_id: 'owner-2', balance_bcu: '50000', locked_balance_bcu: '0', frozen: false }
  ];
  db.tables.bcu_ledger_entries = [
    credit('owner-1', 'favorite_received', '50000'),
    credit('owner-1', 'favorite_received', '50000'),
    credit('owner-1', 'chat_received', '30000'),
    credit('owner-1', 'booking_received', '50000'),
    credit('owner-1', 'bcu_purchase', '1000000'),
    credit('owner-1', 'sponsored_profile_activation_bonus', '70000'),
    credit('owner-1', 'chat_received', '30000', { status: 'pending' }),
    { user_id: 'owner-1', transaction_type: 'chat_sent', amount_bcu: '30000', direction: 'debit', status: 'completed' },
    credit('owner-2', 'favorite_received', '50000')
  ];
  installFakeSupabase(supabaseModule, db, users);
  return db;
}

async function withServer<T>(run: (call: (method: string, path: string, token?: string) => Promise<{ status: number; body: any }>) => Promise<T>) {
  const { express, advertiserActivityRouter, favoritesRouter } = await modulesPromise;
  const app = express();
  app.use(express.json());
  app.use('/api/advertiser/activity', advertiserActivityRouter);
  app.use('/api/favorites', favoritesRouter);
  app.use((error: unknown, _req: any, res: any, _next: any) => res.status(500).json({ error: String(error) }));
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    return await run(async (method, path, token) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
      return { status: response.status, body: await response.json().catch(() => null) };
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('activity counters aggregate every owned profile and nothing from other owners', async () => {
  await seed();
  await withServer(async (call) => {
    const { status, body } = await call('GET', '/api/advertiser/activity', 'owner-token');
    assert.equal(status, 200);
    assert.equal(body.profiles_count, 2, 'profile awaiting owner activation stays hidden');
    assert.equal(body.new_bookings, 2);
    assert.equal(body.active_bookings, 1, 'past accepted appointment counts as completed, not active');
    assert.equal(body.unread_messages, 2, 'only client messages after owner_read_at');
    assert.equal(body.admirers_total, 3);
    assert.equal(body.new_admirers, 1);
    assert.deepEqual(body.wallet, { available_bc: '118', locked_bc: '7' });
  });
});

test('digital revenue comes from completed ledger credits and keeps booking fees separate', async () => {
  await seed();
  await withServer(async (call) => {
    const { body } = await call('GET', '/api/advertiser/activity', 'owner-token');
    assert.deepEqual(body.revenue.favorites, { bc: '10', count: 2 });
    assert.deepEqual(body.revenue.text_chat, { bc: '3', count: 1 }, 'pending credits and debits are not earnings');
    assert.deepEqual(body.revenue.video_chat, { bc: '0', count: 0 });
    assert.equal(body.revenue.digital_total_bc, '13', 'purchases, bonuses and booking fees are excluded');
    assert.deepEqual(body.revenue.booking_fees, { bc: '5', count: 1 });
  });
});

test('activity is advertiser-only and the BC fields disappear when the BC wallet is off', async () => {
  await seed();
  const { config } = await modulesPromise;
  await withServer(async (call) => {
    assert.equal((await call('GET', '/api/advertiser/activity')).status, 401);
    assert.equal((await call('GET', '/api/advertiser/activity', 'client-token')).status, 403);
    config.bcuWalletEnabled = false;
    const { body } = await call('GET', '/api/advertiser/activity', 'owner-token');
    assert.equal(body.wallet, null);
    assert.equal(body.revenue, null);
    assert.equal(body.new_bookings, 2);
  });
  config.bcuWalletEnabled = true;
});

test('acknowledging admirers marks only the caller\'s favorite notifications', async () => {
  const db = await seed();
  await withServer(async (call) => {
    const { body } = await call('POST', '/api/advertiser/activity/admirers/read', 'owner-token');
    assert.equal(body.updated, 1);
  });
  const unread = db.tables.radar_notifications.filter((row) => !row.read_at).map((row) => row.id);
  assert.deepEqual(unread.sort(), ['n-3', 'n-4']);
});

test('first paid favorite notifies the owner anonymously; a repeat add neither charges nor notifies', async () => {
  const db = await seed();
  db.tables.profiles.push({ id: '11111111-1111-4111-8111-111111111111', user_id: 'owner-1' });
  db.tables.radar_notifications = [];
  let paid = false;
  db.rpcHandlers.add_bcu_favorite_with_transfer = (args) => {
    assert.equal(args.p_idempotency_key, `favorite:client-1:${args.p_profile_id}`);
    const charged = !paid;
    paid = true;
    return { data: { favorite: true, charged, amount_bcu: '50000', profile_id: args.p_profile_id, recipient_credited: true }, error: null };
  };
  await withServer(async (call) => {
    const first = await call('POST', '/api/favorites/11111111-1111-4111-8111-111111111111', 'client-token');
    assert.equal(first.status, 201);
    assert.equal(first.body.charged, true);
    assert.equal(first.body.amount_bc, '5');
    const again = await call('POST', '/api/favorites/11111111-1111-4111-8111-111111111111', 'client-token');
    assert.equal(again.body.charged, false);
  });
  assert.equal(db.tables.radar_notifications.length, 1);
  const [notification] = db.tables.radar_notifications;
  assert.equal(notification.user_id, 'owner-1');
  assert.equal(notification.event_type, 'favorite_received');
  assert.doesNotMatch(JSON.stringify(notification), /client-1|client@example/);
});

test('dashboard wires counters, sidebar badges, revenue panel and refresh after mutations', async () => {
  const [dashboard, shell, bookings, messages, activity] = await Promise.all([
    read('Front/src/pages/DashboardPage.tsx'),
    read('Front/src/components/advertiser-dashboard/AdvertiserDashboardShell.tsx'),
    read('Front/src/components/advertiser-dashboard/AdvertiserBookingsSection.tsx'),
    read('Front/src/components/advertiser-dashboard/AdvertiserMessagesSection.tsx'),
    read('Front/src/components/advertiser-dashboard/AdvertiserBusinessActivity.tsx')
  ]);
  assert.match(dashboard, /badges=\{activityBadges\(activity\)\}/);
  assert.match(dashboard, /AdvertiserActivityCounters activity=\{activity\}[^>]*onOpen=\{selectSection\}/);
  assert.match(dashboard, /AdvertiserBookingsSection token=\{props\.token\} onChanged=\{refreshActivity\}/);
  assert.match(dashboard, /AdvertiserMessagesSection token=\{props\.token\} onChanged=\{refreshActivity\}/);
  assert.match(dashboard, /api\.markAdmirersRead/);
  assert.match(shell, /er-nav-badge/);
  assert.match(bookings, /onChanged\?\.\(\)/);
  assert.match(messages, /onUnreadChange=\{onChanged\}/);
  assert.match(activity, /REFRESH_MS = 30_000/);
  for (const language of ['pl', 'de', 'en']) {
    const messagesJson = JSON.parse(await read(`Front/src/locales/${language}.json`));
    for (const key of ['activity.newBookings', 'activity.newMessages', 'activity.newAdmirers', 'activity.activeBookings', 'activity.availableBc', 'activity.lockedBc', 'revenue.title']) {
      assert.equal(typeof messagesJson[key], 'string', `${language}:${key}`);
    }
  }
  const de = JSON.parse(await read('Front/src/locales/de.json'));
  assert.equal(de['revenue.title'], 'Digitale Einnahmen');
  assert.equal(de['activity.newAdmirers'], 'Neue Bewunderer');
});

test('video chat and Communication Plus stay unable to charge BC', async () => {
  const [features, sponsored, bcu] = await Promise.all([
    read('Back/src/featureAvailability.ts'),
    read('Back/src/routes/sponsoredProfiles.ts'),
    read('Back/src/routes/bcu.ts')
  ]);
  assert.match(features, /VIDEO_CHAT_IMPLEMENTED = false/);
  assert.match(features, /COMMUNICATION_PLUS_SALES_ENABLED = false/);
  assert.match(sponsored, /VIDEO_CHAT_IMPLEMENTED/);
  assert.match(bcu, /COMMUNICATION_PLUS_NOT_AVAILABLE/);
});
