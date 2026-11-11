import type { Response, Router } from 'express';
import { isActivePublicCategory } from '../categories.js';
import { requireAccountType } from '../middleware/auth.js';
import { isPublicProfile } from '../publicProfiles.js';
import { getClientActivationSummary } from '../services/clientActivation.js';
import { notifyUserUnlessUnread } from '../services/inAppNotifications.js';
import {
  getCommunicationSettings,
  getCommunicationSettingsMap,
  publicCommunication,
  saveCommunicationSettings,
  type CommunicationSettings
} from '../services/profileCommunication.js';
import { answerAsOwnerAssistant, answerAsSponsoredProfileAgent, parseAssistantLocale } from '../services/sponsoredProfileAgent.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler, optionalText } from '../validation.js';

type Row = Record<string, any>;
type ChatRole = 'client' | 'owner';
type SessionAccess = { session: Row; profile: Row; role: ChatRole; settings: CommunicationSettings; agent: { active: boolean; model: string | null } };

const AWAITING = 'awaiting_owner_activation';

/**
 * Text chat on the existing profile_chat_sessions / profile_chat_messages tables.
 * Mounted on the sponsored-profile router, so every route is authenticated and requires the BCU wallet.
 */
export function registerProfileChatRoutes(router: Router) {
  router.post('/profiles/:profileId/chat', requireAccountType('client'), asyncHandler(async (req, res) => {
    const activation = await getClientActivationSummary(req.user!.id);
    if (activation.state !== 'client_activated') return chatError(res, 403, 'CLIENT_ACTIVATION_REQUIRED');

    const { data: profile } = await supabaseAdmin.from('profiles')
      .select('id, user_id, status, is_published, moderation_status, shadowbanned, category, sponsorship_type')
      .eq('id', req.params.profileId).maybeSingle();
    if (!profile || !profile.user_id || !isPublicProfile(profile) || !isActivePublicCategory(profile.category)) {
      return chatError(res, 404, 'PROFILE_NOT_AVAILABLE');
    }
    if (profile.user_id === req.user!.id) return chatError(res, 400, 'CHAT_OWN_PROFILE');

    // An existing conversation stays readable even if the owner later switched chat off; it is never charged again.
    const { data: existing } = await supabaseAdmin.from('profile_chat_sessions').select('*')
      .eq('profile_id', profile.id).eq('client_user_id', req.user!.id).maybeSingle();
    if (existing) return res.json({ session: { id: existing.id, profile_id: existing.profile_id }, charged_bc: '0', existing: true });

    const settings = await getCommunicationSettings(profile);
    if (!settings.text_chat_enabled) return chatError(res, 403, 'TEXT_CHAT_DISABLED');

    // Atomic: creates the session and transfers the chat price once per client/profile pair.
    const { data, error } = await supabaseAdmin.rpc('start_paid_profile_chat', {
      p_client_user_id: req.user!.id,
      p_client_email: req.user!.email || '',
      p_profile_id: profile.id
    });
    if (error) return mapChatRpcError(res, error.message);
    res.status(201).json({ session: { id: (data as Row).id, profile_id: profile.id }, charged_bc: '3', existing: false });
  }));

  router.get('/conversations', asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { data: ownedProfiles } = await supabaseAdmin.from('profiles')
      .select('id, display_name, sponsorship_type, owner_activation_status')
      .eq('user_id', userId);
    // History of a sponsored profile stays hidden from its technical account until the owner claims it.
    const ownerProfiles = (ownedProfiles || []).filter((profile) => profile.owner_activation_status !== AWAITING);
    const ownerProfileIds = ownerProfiles.map((profile) => profile.id);

    const [{ data: clientSessions }, { data: ownerSessions }] = await Promise.all([
      supabaseAdmin.from('profile_chat_sessions').select('*').eq('client_user_id', userId).order('last_message_at', { ascending: false }).limit(100),
      ownerProfileIds.length
        ? supabaseAdmin.from('profile_chat_sessions').select('*').in('profile_id', ownerProfileIds).order('last_message_at', { ascending: false }).limit(200)
        : Promise.resolve({ data: [] as Row[] })
    ]);
    const sessions = [
      ...(clientSessions || []).map((session) => ({ session, role: 'client' as const })),
      ...(ownerSessions || []).map((session) => ({ session, role: 'owner' as const }))
    ];
    if (!sessions.length) return res.json({ conversations: [], unread_total: 0 });

    const profileIds = [...new Set(sessions.map(({ session }) => session.profile_id))];
    const sessionIds = sessions.map(({ session }) => session.id);
    const [{ data: profiles }, { data: messages }, clientNames] = await Promise.all([
      supabaseAdmin.from('profiles').select('id, display_name, sponsorship_type, owner_activation_status, ai_agent_mode').in('id', profileIds),
      supabaseAdmin.from('profile_chat_messages').select('session_id, sender_type, content, created_at').in('session_id', sessionIds).order('created_at', { ascending: false }).limit(2000),
      clientDisplayNames(sessions.filter(({ role }) => role === 'owner').map(({ session }) => session.client_user_id))
    ]);
    const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const settingsById = await getCommunicationSettingsMap(profiles || []);
    const conversations = sessions.map(({ session, role }) => {
      const sessionMessages = (messages || []).filter((message) => message.session_id === session.id);
      const last = sessionMessages[0] || null;
      const profile: Row = profileById.get(session.profile_id) || { id: session.profile_id };
      return {
        ...publicSession(session, profile, role, settingsById.get(session.profile_id)!, null),
        counterpart_name: role === 'owner' ? clientNames.get(session.client_user_id) || null : profile.display_name || null,
        last_message: last ? { sender_type: last.sender_type, content: String(last.content).slice(0, 140), created_at: last.created_at } : null,
        unread: countUnread(sessionMessages, role, session)
      };
    }).sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)));
    res.json({ conversations, unread_total: conversations.reduce((sum, item) => sum + item.unread, 0) });
  }));

  router.get('/chat/:sessionId', asyncHandler(async (req, res) => {
    const access = await loadSession(req.params.sessionId, req.user!.id);
    if (!access) return chatError(res, 404, 'CHAT_NOT_FOUND');
    if (access.role === 'owner' && access.profile.owner_activation_status === AWAITING) return chatError(res, 403, 'SPONSORED_PROFILE_ACTIVATION_REQUIRED');
    const { data: messages, error } = await supabaseAdmin.from('profile_chat_messages').select('*')
      .eq('session_id', access.session.id).order('created_at', { ascending: true }).limit(300);
    if (error) return chatError(res, 500, 'CHAT_LOAD_FAILED');
    await markRead(access);
    const clientName = access.role === 'owner' ? (await clientDisplayNames([access.session.client_user_id])).get(access.session.client_user_id) || null : null;
    res.json({
      session: { ...publicSession(access.session, access.profile, access.role, access.settings, access.agent), counterpart_name: access.role === 'owner' ? clientName : access.profile.display_name || null },
      messages: (messages || []).map(publicMessage)
    });
  }));

  router.post('/chat/:sessionId/read', asyncHandler(async (req, res) => {
    const access = await loadSession(req.params.sessionId, req.user!.id);
    if (!access) return chatError(res, 404, 'CHAT_NOT_FOUND');
    if (access.role === 'owner' && access.profile.owner_activation_status === AWAITING) return chatError(res, 403, 'SPONSORED_PROFILE_ACTIVATION_REQUIRED');
    await markRead(access);
    res.json({ ok: true });
  }));

  router.post('/chat/:sessionId/messages', asyncHandler(async (req, res) => {
    const content = optionalText(req.body?.content, 4000);
    if (!content) return chatError(res, 400, 'CHAT_MESSAGE_REQUIRED');
    const access = await loadSession(req.params.sessionId, req.user!.id);
    if (!access) return chatError(res, 404, 'CHAT_NOT_FOUND');
    const { session, profile, role, settings } = access;
    const awaiting = profile.owner_activation_status === AWAITING;
    if (role === 'owner' && awaiting) return chatError(res, 403, 'SPONSORED_PROFILE_ACTIVATION_REQUIRED');
    if (session.status === 'closed') return chatError(res, 409, 'CHAT_CLOSED');
    // The owner's switch is enforced here, not only in the UI.
    if (role === 'client' && !settings.text_chat_enabled) return chatError(res, 403, 'TEXT_CHAT_DISABLED');

    const now = new Date().toISOString();
    const { data: message, error } = await supabaseAdmin.from('profile_chat_messages')
      .insert({ session_id: session.id, sender_type: role, sender_user_id: req.user!.id, content })
      .select().single();
    if (error) return chatError(res, 500, 'CHAT_SEND_FAILED');
    // A personal reply from the owner is an implicit takeover: the assistant stops answering.
    await supabaseAdmin.from('profile_chat_sessions').update(role === 'owner'
      ? { last_message_at: now, owner_read_at: now, handled_by: 'owner', status: 'owner_takeover' }
      : { last_message_at: now, client_read_at: now }).eq('id', session.id);

    let agentMessage: Row | null = null;
    if (role === 'client') {
      const preActivationAgent = awaiting && profile.ai_agent_mode === 'pre_activation' && access.agent.active;
      const ownerAssistant = !awaiting && settings.ai_assistant_enabled && session.handled_by === 'agent';
      if (preActivationAgent || ownerAssistant) {
        let answer: string;
        let metadata: Row;
        if (preActivationAgent) {
          const { data: history } = await supabaseAdmin.from('profile_chat_messages').select('sender_type, content')
            .eq('session_id', session.id).order('created_at', { ascending: true }).limit(20);
          answer = await answerAsSponsoredProfileAgent(profile, (history || []) as any);
          metadata = { profile_facts_only: true, owner_impersonation_forbidden: true };
        } else {
          const reply = answerAsOwnerAssistant(profile, content, parseAssistantLocale(req.body?.locale));
          answer = reply.content;
          metadata = { owner_assistant: true, provider: 'rules', topic: reply.topic, profile_facts_only: true };
        }
        const { data } = await supabaseAdmin.from('profile_chat_messages').insert({
          session_id: session.id,
          sender_type: 'agent',
          content: answer,
          agent_disclosure_shown: true,
          model: preActivationAgent ? access.agent.model : 'rules',
          metadata
        }).select().single();
        agentMessage = data;
        await supabaseAdmin.from('profile_chat_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', session.id);
      }
      if (!awaiting) {
        await notifyUserUnlessUnread({ userId: profile.user_id, recipientType: 'advertiser', eventType: 'chat_message', title: 'New chat message', body: content.slice(0, 140), profileId: profile.id });
      }
    } else {
      await notifyUserUnlessUnread({ userId: session.client_user_id, recipientType: 'client', eventType: 'chat_reply', title: `New message from ${profile.display_name || 'profile'}`, body: content.slice(0, 140), profileId: profile.id });
    }
    res.status(201).json({ message: publicMessage(message), agent_message: agentMessage ? publicMessage(agentMessage) : null });
  }));

  router.post('/chat/:sessionId/takeover', asyncHandler(async (req, res) => setHandler(req.params.sessionId, req.user!.id, 'owner', res)));
  router.post('/chat/:sessionId/release', asyncHandler(async (req, res) => setHandler(req.params.sessionId, req.user!.id, 'agent', res)));

  router.get('/communication-settings', asyncHandler(async (req, res) => {
    const { data: profiles, error } = await supabaseAdmin.from('profiles')
      .select('id, display_name, sponsorship_type, owner_activation_status')
      .eq('user_id', req.user!.id).order('created_at', { ascending: true });
    if (error) return chatError(res, 500, 'COMMUNICATION_SETTINGS_FAILED');
    const editable = (profiles || []).filter((profile) => profile.owner_activation_status !== AWAITING);
    const settings = await getCommunicationSettingsMap(editable);
    res.json({
      profiles: editable.map((profile) => ({ profile_id: profile.id, display_name: profile.display_name, ...settings.get(profile.id)!, video_chat_enabled: false, video_chat_implemented: false }))
    });
  }));

  router.put('/communication-settings', asyncHandler(async (req, res) => {
    const profileId = String(req.body?.profile_id || '');
    if (req.body?.video_chat_enabled === true) return chatError(res, 409, 'VIDEO_CHAT_NOT_AVAILABLE');
    const { data: profile } = await supabaseAdmin.from('profiles')
      .select('id, user_id, sponsorship_type, owner_activation_status').eq('id', profileId).maybeSingle();
    if (!profile || profile.user_id !== req.user!.id) return chatError(res, 404, 'PROFILE_NOT_FOUND');
    if (profile.owner_activation_status === AWAITING) return chatError(res, 403, 'SPONSORED_PROFILE_ACTIVATION_REQUIRED');
    const next = { ...(await getCommunicationSettings(profile)) };
    for (const key of ['text_chat_enabled', 'ai_assistant_enabled'] as const) {
      if (req.body?.[key] === undefined) continue;
      if (typeof req.body[key] !== 'boolean') return chatError(res, 400, 'COMMUNICATION_SETTINGS_INVALID');
      next[key] = req.body[key];
    }
    await saveCommunicationSettings(profile.id, next, req.user!.id);
    res.json({ profile_id: profile.id, ...next, video_chat_enabled: false, video_chat_implemented: false });
  }));
}

async function setHandler(sessionId: string, userId: string, handledBy: 'owner' | 'agent', res: Response) {
  const access = await loadSession(sessionId, userId);
  if (!access || access.role !== 'owner') return chatError(res, 404, 'CHAT_NOT_FOUND');
  if (access.profile.owner_activation_status === AWAITING) return chatError(res, 403, 'SPONSORED_PROFILE_ACTIVATION_REQUIRED');
  const status = handledBy === 'owner' ? 'owner_takeover' : 'open';
  const { error } = await supabaseAdmin.from('profile_chat_sessions').update({ handled_by: handledBy, status }).eq('id', access.session.id);
  if (error) return chatError(res, 500, 'CHAT_UPDATE_FAILED');
  const session = { ...access.session, handled_by: handledBy, status };
  res.json({ session: publicSession(session, access.profile, 'owner', access.settings, access.agent) });
}

async function loadSession(sessionId: string, userId: string): Promise<SessionAccess | null> {
  const { data: session } = await supabaseAdmin.from('profile_chat_sessions')
    .select('*, profiles!inner(*)').eq('id', sessionId).maybeSingle();
  if (!session) return null;
  const profile = session.profiles as Row;
  const role: ChatRole | null = session.client_user_id === userId ? 'client' : profile.user_id === userId ? 'owner' : null;
  if (!role) return null;
  const [{ data: agent }, settings] = await Promise.all([
    supabaseAdmin.from('profile_ai_agents').select('active, model').eq('profile_id', profile.id).maybeSingle(),
    getCommunicationSettings(profile as { id: string; sponsorship_type?: string })
  ]);
  const { profiles: _profiles, ...plainSession } = session;
  return { session: plainSession, profile, role, settings, agent: { active: Boolean(agent?.active), model: agent?.model || null } };
}

async function markRead(access: SessionAccess) {
  const column = access.role === 'owner' ? 'owner_read_at' : 'client_read_at';
  await supabaseAdmin.from('profile_chat_sessions').update({ [column]: new Date().toISOString() }).eq('id', access.session.id);
}

/** Never returns profile rows, e-mail addresses or internal agent metadata to either side. */
function publicSession(session: Row, profile: Row, role: ChatRole, settings: CommunicationSettings, agent: SessionAccess['agent'] | null) {
  const awaiting = profile.owner_activation_status === AWAITING;
  const assistantActive = awaiting
    ? profile.ai_agent_mode === 'pre_activation' && (agent ? agent.active : true)
    : settings.text_chat_enabled && settings.ai_assistant_enabled && session.handled_by === 'agent';
  return {
    id: session.id,
    profile_id: session.profile_id,
    profile_name: profile.display_name || null,
    my_role: role,
    status: session.status,
    handled_by: session.handled_by,
    last_message_at: session.last_message_at,
    created_at: session.created_at,
    assistant_active: assistantActive,
    awaiting_owner_activation: awaiting,
    communication: publicCommunication(settings)
  };
}

function publicMessage(message: Row) {
  return {
    id: message.id,
    session_id: message.session_id,
    sender_type: message.sender_type,
    content: message.content,
    agent_disclosure_shown: Boolean(message.agent_disclosure_shown),
    created_at: message.created_at
  };
}

function countUnread(messages: Row[], role: ChatRole, session: Row) {
  const readAt = role === 'owner' ? session.owner_read_at : session.client_read_at;
  return messages.filter((message) => {
    const fromOtherSide = role === 'owner' ? message.sender_type === 'client' : message.sender_type !== 'client';
    return fromOtherSide && (!readAt || String(message.created_at) > String(readAt));
  }).length;
}

/** Clients are shown to advertisers by their chosen display name only, never by account data. */
async function clientDisplayNames(userIds: unknown[]) {
  const ids = [...new Set(userIds.filter((id): id is string => typeof id === 'string' && Boolean(id)))];
  if (!ids.length) return new Map<string, string>();
  const { data } = await supabaseAdmin.from('client_profiles').select('user_id, display_name').in('user_id', ids);
  return new Map((data || []).filter((row: Row) => typeof row.display_name === 'string' && row.display_name.trim())
    .map((row: Row) => [row.user_id as string, String(row.display_name).trim()]));
}

function mapChatRpcError(res: Response, message: string) {
  if (message.includes('TEXT_CHAT_DISABLED')) return chatError(res, 403, 'TEXT_CHAT_DISABLED');
  if (message.includes('INSUFFICIENT')) return chatError(res, 402, 'INSUFFICIENT_BC');
  if (message.includes('PROFILE_NOT_AVAILABLE') || message.includes('PROFILE_NOT_SPONSORED')) return chatError(res, 404, 'PROFILE_NOT_AVAILABLE');
  console.error('[ProfileChat] start failed', message);
  return chatError(res, 400, 'CHAT_START_FAILED');
}

function chatError(res: Response, status: number, code: string) {
  return res.status(status).json({ error: code, code });
}
