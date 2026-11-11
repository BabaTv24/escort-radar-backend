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

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

const modulesPromise = (async () => ({
  express: (await import('express')).default,
  supabaseModule: await import('../Back/src/supabase.ts'),
  config: (await import('../Back/src/config.ts')).config,
  sponsoredProfilesRouter: (await import('../Back/src/routes/sponsoredProfiles.ts')).sponsoredProfilesRouter,
  agent: await import('../Back/src/services/sponsoredProfileAgent.ts')
}))();

const users = {
  'client-token': { id: 'client-1', email: 'client@example.test', app_metadata: { auth_account_type: 'client' } },
  'free-client-token': { id: 'client-2', email: 'free@example.test', app_metadata: { auth_account_type: 'client' } },
  'owner-token': { id: 'owner-1', email: 'owner@example.test', app_metadata: { auth_account_type: 'escort', plan: 'escort_monthly', subscription_status: 'active' } },
  'other-owner-token': { id: 'owner-2', email: 'other@example.test', app_metadata: { auth_account_type: 'escort', plan: 'escort_monthly', subscription_status: 'active' } },
  'tech-token': { id: 'tech-1', email: 'tech@example.test', app_metadata: { auth_account_type: 'escort', plan: 'escort_monthly', subscription_status: 'active' } }
};

const publicProfile = { status: 'active', is_published: true, moderation_status: 'approved', shadowbanned: false, category: 'ladies' };

async function seed(): Promise<FakeDatabase> {
  const { supabaseModule, config } = await modulesPromise;
  config.bcuWalletEnabled = true;
  const db = createFakeDatabase();
  db.tables.profiles = [
    { id: 'p-1', user_id: 'owner-1', display_name: 'Aurelia', sponsorship_type: 'none', owner_activation_status: 'not_required', ai_agent_mode: 'disabled', price_1h: 260, currency: 'EUR', primary_phone: '+49 123', ...publicProfile },
    { id: 'p-sponsored', user_id: 'tech-1', display_name: 'Nova', sponsorship_type: 'admin_sponsored', owner_activation_status: 'awaiting_owner_activation', ai_agent_mode: 'pre_activation', description: 'Berlin', ...publicProfile }
  ];
  db.tables.profile_ai_agents = [{ profile_id: 'p-sponsored', active: true, model: 'gpt-5.6-luna' }];
  db.tables.client_activations = [{ user_id: 'client-1', state: 'client_activated' }];
  db.tables.client_referrals = [];
  db.tables.client_profiles = [{ user_id: 'client-1', display_name: 'Alex' }];
  db.tables.profile_chat_sessions = [];
  db.tables.profile_chat_messages = [];
  db.tables.profile_communication_settings = [];
  db.tables.radar_notifications = [];
  db.joins.profiles = (row) => db.tables.profiles.find((profile) => profile.id === row.profile_id) || null;
  db.rpcHandlers.start_paid_profile_chat = (args) => {
    let session = db.tables.profile_chat_sessions.find((row) => row.profile_id === args.p_profile_id && row.client_user_id === args.p_client_user_id);
    if (!session) {
      session = { id: `s-${db.tables.profile_chat_sessions.length + 1}`, profile_id: args.p_profile_id, client_user_id: args.p_client_user_id, client_email: args.p_client_email, status: 'open', handled_by: 'agent', last_message_at: new Date().toISOString(), created_at: new Date().toISOString() };
      db.tables.profile_chat_sessions.push(session);
    }
    return { data: session, error: null };
  };
  installFakeSupabase(supabaseModule, db, users);
  return db;
}

async function withServer<T>(run: (call: (method: string, path: string, token?: string, body?: unknown) => Promise<{ status: number; body: any }>) => Promise<T>) {
  const { express, sponsoredProfilesRouter } = await modulesPromise;
  const app = express();
  app.use(express.json());
  app.use('/api/sponsored', sponsoredProfilesRouter);
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

test('chat start honours activation, the owner switch and charges through the RPC only for new conversations', async () => {
  const db = await seed();
  await withServer(async (call) => {
    const disabled = await call('POST', '/api/sponsored/profiles/p-1/chat', 'client-token');
    assert.deepEqual([disabled.status, disabled.body.code], [403, 'TEXT_CHAT_DISABLED']);
    const unactivated = await call('POST', '/api/sponsored/profiles/p-1/chat', 'free-client-token');
    assert.deepEqual([unactivated.status, unactivated.body.code], [403, 'CLIENT_ACTIVATION_REQUIRED']);
    assert.equal((await call('POST', '/api/sponsored/profiles/p-1/chat', 'owner-token')).status, 403);

    assert.equal((await call('PUT', '/api/sponsored/communication-settings', 'other-owner-token', { profile_id: 'p-1', text_chat_enabled: true })).status, 404);
    assert.equal((await call('PUT', '/api/sponsored/communication-settings', 'owner-token', { profile_id: 'p-1', video_chat_enabled: true })).status, 409);
    assert.equal((await call('PUT', '/api/sponsored/communication-settings', 'owner-token', { profile_id: 'p-1', text_chat_enabled: 'yes' })).status, 400);
    const enabled = await call('PUT', '/api/sponsored/communication-settings', 'owner-token', { profile_id: 'p-1', text_chat_enabled: true, ai_assistant_enabled: true });
    assert.equal(enabled.status, 200);

    const started = await call('POST', '/api/sponsored/profiles/p-1/chat', 'client-token');
    assert.equal(started.status, 201);
    const reopened = await call('POST', '/api/sponsored/profiles/p-1/chat', 'client-token');
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.existing, true);
    assert.equal(reopened.body.session.id, started.body.session.id);
  });
  assert.equal(db.rpcCalls.filter((item) => item.name === 'start_paid_profile_chat').length, 1);
});

test('owner assistant discloses AI, stops after takeover, resumes after release; owner replies notify the client', async () => {
  const db = await seed();
  db.tables.profile_communication_settings.push({ profile_id: 'p-1', text_chat_enabled: true, ai_assistant_enabled: true });
  db.tables.profile_chat_sessions.push({ id: 's-1', profile_id: 'p-1', client_user_id: 'client-1', client_email: 'client@example.test', status: 'open', handled_by: 'agent', last_message_at: '2026-11-11T10:00:00Z', created_at: '2026-11-11T10:00:00Z' });
  await withServer(async (call) => {
    const first = await call('POST', '/api/sponsored/chat/s-1/messages', 'client-token', { content: 'Wie viel kostet eine Stunde?', locale: 'de' });
    assert.equal(first.status, 201);
    assert.match(first.body.agent_message.content, /^KI-Assistent von Aurelia — Sie sprechen mit einem KI-Assistenten\./);
    assert.match(first.body.agent_message.content, /260 EUR/);

    assert.equal((await call('POST', '/api/sponsored/chat/s-1/takeover', 'client-token')).status, 404);
    assert.equal((await call('POST', '/api/sponsored/chat/s-1/takeover', 'other-owner-token')).status, 404);
    assert.equal((await call('POST', '/api/sponsored/chat/s-1/takeover', 'owner-token')).status, 200);
    const silent = await call('POST', '/api/sponsored/chat/s-1/messages', 'client-token', { content: 'Hallo?' });
    assert.equal(silent.body.agent_message, null);
    assert.equal((await call('POST', '/api/sponsored/chat/s-1/messages', 'owner-token', { content: 'Hier ist Aurelia persönlich.' })).status, 201);

    const released = await call('POST', '/api/sponsored/chat/s-1/release', 'owner-token');
    assert.equal(released.body.session.assistant_active, true);
    const again = await call('POST', '/api/sponsored/chat/s-1/messages', 'client-token', { content: 'Wo bist du?', locale: 'en' });
    assert.match(again.body.agent_message.content, /^AI assistant of Aurelia — you are talking to an AI assistant\./);

    const asClient = await call('GET', '/api/sponsored/chat/s-1', 'client-token');
    const payload = JSON.stringify(asClient.body);
    assert.doesNotMatch(payload, /primary_phone|client_email|sender_user_id|"profiles"/);
    const asOwner = await call('GET', '/api/sponsored/chat/s-1', 'owner-token');
    assert.equal(asOwner.body.session.counterpart_name, 'Alex');
    assert.equal((await call('GET', '/api/sponsored/chat/s-1', 'other-owner-token')).status, 404);
  });
  assert.equal(db.tables.radar_notifications.filter((row) => row.event_type === 'chat_reply' && row.user_id === 'client-1').length, 1);
  // Repeated client messages produce one unread notification for the owner, not one per message.
  assert.equal(db.tables.radar_notifications.filter((row) => row.event_type === 'chat_message' && row.user_id === 'owner-1').length, 1);
});

test('disabled chat rejects client messages but keeps history readable; conversation list counts unread', async () => {
  const db = await seed();
  db.tables.profile_communication_settings.push({ profile_id: 'p-1', text_chat_enabled: false, ai_assistant_enabled: true });
  db.tables.profile_chat_sessions.push({ id: 's-1', profile_id: 'p-1', client_user_id: 'client-1', status: 'open', handled_by: 'owner', owner_read_at: '2026-11-11T09:00:00Z', client_read_at: '2026-11-11T09:00:00Z', last_message_at: '2026-11-11T10:00:00Z', created_at: '2026-11-11T08:00:00Z' });
  db.tables.profile_chat_messages.push(
    { id: 'm-1', session_id: 's-1', sender_type: 'client', content: 'Hi', created_at: '2026-11-11T09:30:00Z' },
    { id: 'm-2', session_id: 's-1', sender_type: 'owner', content: 'Hello', created_at: '2026-11-11T09:40:00Z' }
  );
  await withServer(async (call) => {
    const blocked = await call('POST', '/api/sponsored/chat/s-1/messages', 'client-token', { content: 'Still there?' });
    assert.deepEqual([blocked.status, blocked.body.code], [403, 'TEXT_CHAT_DISABLED']);
    assert.equal((await call('POST', '/api/sponsored/chat/s-1/messages', 'owner-token', { content: 'Owner can still answer' })).status, 201);
    const history = await call('GET', '/api/sponsored/chat/s-1', 'client-token');
    assert.equal(history.status, 200);
    assert.equal(history.body.session.assistant_active, false);
    const ownerList = await call('GET', '/api/sponsored/conversations', 'owner-token');
    assert.equal(ownerList.body.conversations[0].my_role, 'owner');
    assert.equal(ownerList.body.conversations[0].counterpart_name, 'Alex');
  });
  assert.equal(db.tables.profile_chat_messages.filter((row) => row.content === 'Still there?').length, 0);
});

test('sponsored profile awaiting activation keeps the disclosed pre-activation agent and hides history from the technical owner', async () => {
  const db = await seed();
  db.tables.profile_chat_sessions.push({ id: 's-sp', profile_id: 'p-sponsored', client_user_id: 'client-1', status: 'open', handled_by: 'agent', last_message_at: '2026-11-11T10:00:00Z', created_at: '2026-11-11T10:00:00Z' });
  const { agent } = await modulesPromise;
  await withServer(async (call) => {
    const sent = await call('POST', '/api/sponsored/chat/s-sp/messages', 'client-token', { content: 'Gdzie jesteś?' });
    assert.equal(sent.status, 201);
    assert.ok(sent.body.agent_message.content.startsWith(agent.PROFILE_AGENT_DISCLOSURE));
    assert.equal((await call('GET', '/api/sponsored/chat/s-sp', 'tech-token')).status, 403);
    assert.equal((await call('POST', '/api/sponsored/chat/s-sp/takeover', 'tech-token')).status, 403);
    assert.equal((await call('GET', '/api/sponsored/conversations', 'tech-token')).body.conversations.length, 0);
  });
  assert.equal(db.tables.radar_notifications.length, 0);
});

test('migration 059 is additive and keeps the chat RPC service-role only', async () => {
  const migration = await read('supabase/migrations/059_profile_text_chat_settings.sql');
  assert.match(migration, /create table if not exists public\.profile_communication_settings/);
  assert.match(migration, /revoke all on public\.profile_communication_settings from public, anon, authenticated;/);
  assert.match(migration, /coalesce\(v_text_chat_enabled, v_profile\.sponsorship_type = 'admin_sponsored'\)/);
  assert.match(migration, /perform public\.charge_bcu_profile_interaction\(/);
  assert.match(migration, /revoke execute on function public\.start_paid_profile_chat\(uuid, text, uuid\) from public, anon, authenticated;/);
  assert.doesNotMatch(migration, /\b(drop table|delete from|truncate)\b/i);
});
