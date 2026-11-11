import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createFakeDatabase, installFakeSupabase, type FakeDatabase } from './fixtures/fakeSupabase.ts';

// Offline configuration: the real Supabase clients are created but every data call is replaced
// by the in-memory fake below, so no request can reach a real project.
process.env.SUPABASE_URL = 'http://127.0.0.1:9';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'offline-test-service-key';
process.env.SUPABASE_ANON_KEY = 'offline-test-anon-key';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

// Loaded lazily, after the offline environment above is in place (tests compile to CommonJS).
const modulesPromise = (async () => ({
  express: (await import('express')).default,
  supabaseModule: await import('../Back/src/supabase.ts'),
  config: (await import('../Back/src/config.ts')).config,
  bookingRequestsRouter: (await import('../Back/src/routes/bookingRequests.ts')).bookingRequestsRouter,
  sponsoredProfilesRouter: (await import('../Back/src/routes/sponsoredProfiles.ts')).sponsoredProfilesRouter,
  bcuRouter: (await import('../Back/src/routes/bcu.ts')).bcuRouter,
  rules: await import('../Back/src/bookingRules.ts'),
  bookingErrors: await import('../Front/src/lib/bookingErrors.ts')
}))();

const users = {
  'client-token': { id: 'client-1', email: 'client@example.test', app_metadata: { auth_account_type: 'client' } },
  'free-client-token': { id: 'client-2', email: 'free@example.test', app_metadata: { auth_account_type: 'client' } },
  'owner-token': { id: 'owner-1', email: 'owner@example.test', app_metadata: { auth_account_type: 'escort', plan: 'escort_monthly', subscription_status: 'active' } },
  'other-owner-token': { id: 'owner-2', email: 'other@example.test', app_metadata: { auth_account_type: 'escort', plan: 'escort_monthly', subscription_status: 'active' } }
};

function futureDate(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function seed(): Promise<FakeDatabase> {
  const { supabaseModule } = await modulesPromise;
  const db = createFakeDatabase();
  db.tables.profiles = [
    { id: 'profile-1', user_id: 'owner-1', status: 'active', is_published: true, moderation_status: 'approved', shadowbanned: false, category: 'ladies', opening_hours: { timezone: 'Europe/Berlin' }, owner_activation_status: 'not_required' },
    { id: 'profile-hidden', user_id: 'owner-1', status: 'active', is_published: false, moderation_status: 'approved', shadowbanned: false, category: 'ladies' },
    { id: 'profile-unowned', user_id: null, status: 'active', is_published: true, moderation_status: 'approved', shadowbanned: false, category: 'ladies' }
  ];
  db.tables.client_activations = [{ user_id: 'client-1', state: 'client_activated' }];
  db.tables.client_referrals = [];
  db.tables.booking_requests = [];
  db.joins.profiles = (row) => db.tables.profiles.find((profile) => profile.id === row.profile_id) || null;
  // Mirrors create_paid_booking_request: idempotent per (client, profile, key), one charge per new request.
  db.rpcHandlers.create_paid_booking_request = (args) => {
    const existing = db.tables.booking_requests.find((row) => row.requester_user_id === args.p_client_user_id
      && row.profile_id === args.p_profile_id && row.client_request_key === args.p_idempotency_key);
    if (existing) return { data: existing, error: null };
    db.tables.bcu_profile_interactions ||= [];
    db.tables.bcu_profile_interactions.push({ interaction_type: 'booking', amount_bcu: 50000 });
    const row = { id: `paid-${db.tables.booking_requests.length + 1}`, profile_id: args.p_profile_id, requester_user_id: args.p_client_user_id, client_request_key: args.p_idempotency_key, status: 'pending' };
    db.tables.booking_requests.push(row);
    return { data: row, error: null };
  };
  installFakeSupabase(supabaseModule, db, users);
  return db;
}

async function withServer<T>(run: (call: (method: string, path: string, token?: string, body?: unknown) => Promise<{ status: number; body: any }>) => Promise<T>) {
  const { express, bookingRequestsRouter, sponsoredProfilesRouter, bcuRouter } = await modulesPromise;
  const app = express();
  app.use(express.json());
  app.use('/api/booking-requests', bookingRequestsRouter);
  app.use('/api/sponsored', sponsoredProfilesRouter);
  app.use('/api/bcu', bcuRouter);
  app.use((error: unknown, _req: any, res: any, _next: any) => res.status(500).json({ error: String(error) }));
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    return await run(async (method, path, token, body) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    });
  } finally {
    server.close();
  }
}

const validBooking = (overrides: Record<string, unknown> = {}) => ({
  profile_id: 'profile-1', requester_email: 'client@example.test', requested_date: futureDate(3),
  requested_time: '18:00', duration_minutes: 60, message: 'Hello', idempotency_key: 'attempt-1', ...overrides
});

test('unauthenticated, non-client and non-activated booking attempts are rejected before any write', async () => {
  for (const bcu of [false, true]) {
    (await modulesPromise).config.bcuWalletEnabled = bcu;
    const db = await seed();
    await withServer(async (call) => {
      assert.equal((await call('POST', '/api/booking-requests', undefined, validBooking())).status, 401);
      assert.equal((await call('POST', '/api/booking-requests', 'owner-token', validBooking())).status, 403);
      const free = await call('POST', '/api/booking-requests', 'free-client-token', validBooking());
      assert.equal(free.status, 403);
      assert.equal(free.body.code, 'CLIENT_ACTIVATION_REQUIRED');
    });
    assert.equal(db.tables.booking_requests.length, 0);
    assert.equal(db.rpcCalls.length, 0);
  }
});

test('bookings for hidden, ownerless or own profiles and invalid dates are rejected', async () => {
  (await modulesPromise).config.bcuWalletEnabled = false;
  const db = await seed();
  await withServer(async (call) => {
    const cases: Array<[Record<string, unknown>, number, string]> = [
      [{ profile_id: 'profile-hidden' }, 404, 'PROFILE_NOT_AVAILABLE'],
      [{ profile_id: 'missing' }, 404, 'PROFILE_NOT_AVAILABLE'],
      [{ profile_id: 'profile-unowned' }, 409, 'PROFILE_NOT_BOOKABLE'],
      [{ requested_date: futureDate(-2) }, 400, 'BOOKING_DATE_IN_PAST'],
      [{ requested_date: futureDate(400) }, 400, 'BOOKING_DATE_TOO_FAR'],
      [{ requested_time: '25:00' }, 400, 'BOOKING_TIME_INVALID'],
      [{ duration_minutes: 5 }, 400, 'BOOKING_DURATION_INVALID'],
      [{ idempotency_key: '' }, 400, 'BOOKING_IDEMPOTENCY_KEY_INVALID']
    ];
    for (const [overrides, status, code] of cases) {
      const response = await call('POST', '/api/booking-requests', 'client-token', validBooking(overrides));
      assert.equal(response.status, status, code);
      assert.equal(response.body.code, code);
    }
  });
  assert.equal(db.tables.booking_requests.length, 0);
});

test('authorized paid booking uses the atomic BC RPC and a retry never charges twice', async () => {
  (await modulesPromise).config.bcuWalletEnabled = true;
  const db = await seed();
  await withServer(async (call) => {
    const first = await call('POST', '/api/booking-requests', 'client-token', validBooking());
    const retry = await call('POST', '/api/booking-requests', 'client-token', validBooking());
    assert.equal(first.status, 201);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.replayed, true);
    assert.equal(retry.body.booking_request.id, first.body.booking_request.id);
  });
  // The replay is answered from the stored request; the paying RPC (itself idempotent) runs once.
  assert.deepEqual(db.rpcCalls.map((item) => item.name), ['create_paid_booking_request']);
  assert.equal(db.tables.radar_notifications.filter((row) => row.event_type === 'booking_requested').length, 1);
  assert.equal(db.rpcCalls[0].args.p_client_user_id, 'client-1');
  assert.equal(db.tables.booking_requests.length, 1);
  assert.equal(db.tables.bcu_profile_interactions.length, 1);
});

test('insufficient BC is reported as 402 INSUFFICIENT_BC', async () => {
  (await modulesPromise).config.bcuWalletEnabled = true;
  const db = await seed();
  db.rpcHandlers.create_paid_booking_request = () => ({ data: null, error: { message: 'INSUFFICIENT_BCU' } });
  await withServer(async (call) => {
    const response = await call('POST', '/api/booking-requests', 'client-token', validBooking());
    assert.equal(response.status, 402);
    assert.equal(response.body.code, 'INSUFFICIENT_BC');
  });
});

test('free booking path records the requester and is idempotent per attempt key', async () => {
  (await modulesPromise).config.bcuWalletEnabled = false;
  const db = await seed();
  await withServer(async (call) => {
    const first = await call('POST', '/api/booking-requests', 'client-token', validBooking());
    const retry = await call('POST', '/api/booking-requests', 'client-token', validBooking());
    assert.equal(first.status, 201);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.replayed, true);
  });
  assert.equal(db.tables.booking_requests.length, 1);
  assert.equal(db.tables.booking_requests[0].requester_user_id, 'client-1');
  assert.equal(db.tables.booking_requests[0].client_request_key, 'attempt-1');
  assert.equal(db.rpcCalls.length, 0);
});

test('owner status changes follow the state machine and terminal states cannot be reopened', async () => {
  (await modulesPromise).config.bcuWalletEnabled = false;
  const db = await seed();
  db.tables.booking_requests.push(
    { id: 'b-pending', profile_id: 'profile-1', status: 'pending' },
    { id: 'b-rejected', profile_id: 'profile-1', status: 'rejected' },
    { id: 'b-cancelled', profile_id: 'profile-1', status: 'cancelled' }
  );
  await withServer(async (call) => {
    assert.equal((await call('PATCH', '/api/booking-requests/b-pending/status', 'other-owner-token', { status: 'accepted' })).status, 403);
    assert.equal((await call('PATCH', '/api/booking-requests/b-pending/status', 'owner-token', { status: 'bogus' })).status, 400);
    assert.equal((await call('PATCH', '/api/booking-requests/b-pending/status', 'owner-token', { status: 'accepted' })).status, 200);
    for (const [id, status] of [['b-pending', 'pending'], ['b-rejected', 'accepted'], ['b-cancelled', 'pending'], ['b-cancelled', 'accepted']]) {
      const response = await call('PATCH', `/api/booking-requests/${id}/status`, 'owner-token', { status });
      assert.equal(response.status, 409, `${id} -> ${status}`);
      assert.equal(response.body.code, 'BOOKING_TRANSITION_INVALID');
    }
    assert.equal((await call('PATCH', '/api/booking-requests/b-pending/status', 'owner-token', { status: 'cancelled' })).status, 200);
  });
  assert.deepEqual(db.tables.booking_requests.map((row) => row.status), ['cancelled', 'rejected', 'cancelled']);
});

test('booking transition table', async () => {
  const { ownerBookingTransitionAllowed } = (await modulesPromise).rules;
  assert.equal(ownerBookingTransitionAllowed('pending', 'accepted'), true);
  assert.equal(ownerBookingTransitionAllowed('pending', 'rejected'), true);
  assert.equal(ownerBookingTransitionAllowed('accepted', 'cancelled'), true);
  for (const [from, to] of [['accepted', 'pending'], ['rejected', 'accepted'], ['cancelled', 'pending'], ['awaiting_owner_activation', 'accepted'], ['pending', 'pending'], ['pending', 'awaiting_owner_activation'], ['unknown', 'accepted']]) {
    assert.equal(ownerBookingTransitionAllowed(from, to), false, `${from} -> ${to}`);
  }
});

test('booking dates are evaluated in the profile time zone', async () => {
  const { validateBookingInput } = (await modulesPromise).rules;
  const now = new Date('2026-11-11T23:30:00Z'); // already 12 November in Warsaw
  const base = { profile_id: 'p', requested_time: '10:00', duration_minutes: 60, idempotency_key: 'k' };
  assert.equal(validateBookingInput({ ...base, requested_date: '2026-11-11' }, { fallbackEmail: 'a@b.cd', now, timeZone: 'Europe/Warsaw' }).ok, false);
  assert.equal(validateBookingInput({ ...base, requested_date: '2026-11-11' }, { fallbackEmail: 'a@b.cd', now, timeZone: 'America/New_York' }).ok, true);
  const invalidZone = validateBookingInput({ ...base, requested_date: '2026-02-30' }, { fallbackEmail: 'a@b.cd', now, timeZone: 'Not/AZone' });
  assert.deepEqual(invalidZone, { ok: false, code: 'BOOKING_DATE_INVALID' });
});

test('video chat attempt is refused before any BC charge', async () => {
  (await modulesPromise).config.bcuWalletEnabled = true;
  const db = await seed();
  await withServer(async (call) => {
    const response = await call('POST', '/api/sponsored/profiles/profile-1/videochat', 'client-token', { idempotency_key: 'video-1' });
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'VIDEO_CHAT_NOT_AVAILABLE');
    assert.equal(response.body.charged, false);
  });
  assert.equal(db.rpcCalls.length, 0);
});

test('Communication Plus cannot be bought while it unlocks nothing, and status says so', async () => {
  (await modulesPromise).config.bcuWalletEnabled = true;
  const db = await seed();
  db.tables.bcu_wallets = [{ user_id: 'client-1', balance_bcu: '5000000', locked_balance_bcu: '0' }];
  db.tables.system_bcu_products = [{ product_code: 'communication_plus', amount_bcu: '1000000', active: true, operation_type: 'debit' }];
  db.tables.user_entitlements = [];
  await withServer(async (call) => {
    for (const path of ['/api/bcu/communication-plus/purchase', '/api/bcu/products/communication_plus/activate']) {
      const response = await call('POST', path, 'client-token', { idempotency_key: 'cp-1' });
      assert.equal(response.status, 409, path);
      assert.equal(response.body.code, 'COMMUNICATION_PLUS_NOT_AVAILABLE');
    }
    const status = await call('GET', '/api/bcu/communication-plus', 'client-token');
    assert.equal(status.status, 200);
    assert.equal(status.body.sales_enabled, false);
  });
  assert.equal(db.rpcCalls.length, 0);
});

test('booking form maps API failures to visible localized messages', async () => {
  const { resolveBookingError } = (await modulesPromise).bookingErrors;
  const failure = (status: number, code?: string) => Object.assign(new Error('x'), { status, payload: code ? { code } : {} });
  assert.deepEqual(resolveBookingError(failure(401)), { kind: 'login' });
  assert.deepEqual(resolveBookingError(failure(402, 'INSUFFICIENT_BC')), { kind: 'message', key: 'booking.error.insufficientBc' });
  assert.deepEqual(resolveBookingError(failure(400, 'BOOKING_DATE_IN_PAST')), { kind: 'message', key: 'booking.error.dateInPast' });
  assert.deepEqual(resolveBookingError(failure(403)), { kind: 'message', key: 'booking.error.activationRequired' });
  assert.deepEqual(resolveBookingError(new TypeError('Failed to fetch')), { kind: 'message', key: 'booking.error.generic' });

  const [page, pl, de, en] = await Promise.all([
    read('Front/src/pages/ProfilePage.tsx'),
    read('Front/src/locales/pl.json').then(JSON.parse),
    read('Front/src/locales/de.json').then(JSON.parse),
    read('Front/src/locales/en.json').then(JSON.parse)
  ]);
  const submit = page.slice(page.indexOf('async function submitBooking'), page.indexOf('return (', page.indexOf('async function submitBooking')));
  assert.match(submit, /if \(bookingSubmitting\) return;/);
  assert.match(submit, /catch \(error\)[\s\S]*resolveBookingError\(error\)[\s\S]*setBookingError/);
  assert.match(submit, /bookingAttemptKey\.current \|\|= crypto\.randomUUID\(\)/);
  assert.match(page, /type="submit" disabled=\{bookingSubmitting\}/);
  assert.match(page, /role="alert">\{bookingError\}/);
  assert.doesNotMatch(page, /requestVideochat|7 BC/);
  const keys = [...page.matchAll(/'(booking\.error\.[A-Za-z]+)'/g)].map((match) => match[1]);
  const bookingErrors = await read('Front/src/lib/bookingErrors.ts');
  keys.push(...[...bookingErrors.matchAll(/'(booking\.error\.[A-Za-z]+)'/g)].map((match) => match[1]), 'profile.videoChatUnavailable', 'communicationPlus.salesPaused');
  for (const key of new Set(keys)) for (const locale of [pl, de, en]) assert.equal(typeof locale[key], 'string', key);
});

test('migration 058 removes direct client writes to booking_requests', async () => {
  const migration = await read('supabase/migrations/058_booking_requests_backend_only_writes.sql');
  assert.match(migration, /drop policy if exists "Anyone can create booking requests" on public\.booking_requests;/);
  assert.match(migration, /drop policy if exists "Advertisers can update own booking request status" on public\.booking_requests;/);
  assert.match(migration, /revoke all on public\.booking_requests from anon;/);
  assert.match(migration, /revoke insert, update, delete, truncate, references, trigger on public\.booking_requests from authenticated;/);
  assert.doesNotMatch(migration, /\b(delete from|truncate table|update public\.booking_requests set)\b/i);
});

test('client sees only own bookings, with derived completed status, and can cancel only undecided ones', async () => {
  (await modulesPromise).config.bcuWalletEnabled = false;
  const db = await seed();
  db.tables.booking_requests.push(
    { id: 'c-pending', profile_id: 'profile-1', requester_user_id: 'client-1', status: 'pending', requested_date: futureDate(2), requested_time: '10:00', duration_minutes: 60 },
    { id: 'c-past', profile_id: 'profile-1', requester_user_id: 'client-1', status: 'accepted', requested_date: futureDate(-3), requested_time: '10:00', duration_minutes: 60 },
    { id: 'c-future', profile_id: 'profile-1', requester_user_id: 'client-1', status: 'accepted', requested_date: futureDate(3), requested_time: '10:00', duration_minutes: 60 },
    { id: 'other-client', profile_id: 'profile-1', requester_user_id: 'client-2', status: 'pending', requested_date: futureDate(2), requested_time: '10:00', duration_minutes: 60 }
  );
  await withServer(async (call) => {
    assert.equal((await call('GET', '/api/booking-requests/mine')).status, 401);
    assert.equal((await call('GET', '/api/booking-requests/mine', 'owner-token')).status, 403);
    const mine = await call('GET', '/api/booking-requests/mine', 'client-token');
    assert.equal(mine.status, 200);
    const byId = Object.fromEntries(mine.body.booking_requests.map((row: any) => [row.id, row.display_status]));
    assert.deepEqual(byId, { 'c-pending': 'pending', 'c-past': 'completed', 'c-future': 'accepted' });
    assert.equal(mine.body.booking_requests[0].profiles.opening_hours, undefined);

    assert.equal((await call('POST', '/api/booking-requests/other-client/cancel', 'client-token')).status, 404);
    const acceptedCancel = await call('POST', '/api/booking-requests/c-future/cancel', 'client-token');
    assert.equal(acceptedCancel.status, 409);
    assert.equal(acceptedCancel.body.code, 'BOOKING_TRANSITION_INVALID');
    assert.equal((await call('POST', '/api/booking-requests/c-pending/cancel', 'client-token')).status, 200);
    assert.equal((await call('POST', '/api/booking-requests/c-pending/cancel', 'client-token')).status, 409);
  });
  assert.equal(db.tables.booking_requests.find((row) => row.id === 'c-pending')!.status, 'cancelled');
  assert.equal(db.tables.booking_requests.find((row) => row.id === 'other-client')!.status, 'pending');
  assert.deepEqual(db.tables.radar_notifications.map((row) => [row.user_id, row.event_type]), [['owner-1', 'booking_cancelled_by_client']]);
});

test('owner decisions notify the requesting client and the advertiser list hides account data', async () => {
  (await modulesPromise).config.bcuWalletEnabled = false;
  const db = await seed();
  db.tables.client_profiles = [{ user_id: 'client-1', display_name: 'Alex' }];
  db.tables.booking_requests.push({ id: 'o-1', profile_id: 'profile-1', requester_user_id: 'client-1', requester_email: 'alex@example.test', client_request_key: 'secret-key', status: 'pending', requested_date: futureDate(2), requested_time: '10:00', duration_minutes: 60, created_at: new Date().toISOString() });
  await withServer(async (call) => {
    const list = await call('GET', '/api/booking-requests/me', 'owner-token');
    assert.equal(list.status, 200);
    assert.equal(list.body.booking_requests[0].client_display_name, 'Alex');
    assert.equal(list.body.booking_requests[0].client_request_key, undefined);
    assert.equal((await call('GET', '/api/booking-requests/me', 'other-owner-token')).body.booking_requests.length, 0);
    assert.equal((await call('PATCH', '/api/booking-requests/o-1/status', 'owner-token', { status: 'accepted' })).status, 200);
  });
  assert.deepEqual(db.tables.radar_notifications.map((row) => [row.user_id, row.recipient_type, row.event_type]), [['client-1', 'client', 'booking_accepted']]);
});
