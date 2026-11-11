import { Router } from 'express';
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { VIDEO_CHAT_IMPLEMENTED } from '../featureAvailability.js';
import { requireAccountType, verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { registerProfileChatRoutes } from './profileChatRoutes.js';
import { asyncHandler } from '../validation.js';

export const sponsoredProfilesRouter = Router();

sponsoredProfilesRouter.use(verifyUser);
sponsoredProfilesRouter.use((_req, res, next) => {
  if (!config.bcuWalletEnabled) return res.status(404).json({ error: 'Sponsored profile BCU interactions are not available' });
  return next();
});

// Text chat routes (start, list, read, send, takeover, settings) live in profileChatRoutes.ts.
registerProfileChatRoutes(sponsoredProfilesRouter);

sponsoredProfilesRouter.post('/profiles/:profileId/videochat', requireAccountType('client'), asyncHandler(async (req, res) => {
  // Refuse before any BCU RPC: a call attempt must never be charged while video chat does not exist.
  if (!VIDEO_CHAT_IMPLEMENTED) {
    return res.status(409).json({ error: 'VIDEO_CHAT_NOT_AVAILABLE', code: 'VIDEO_CHAT_NOT_AVAILABLE', charged: false });
  }
  const key = String(req.body.idempotency_key || req.headers['idempotency-key'] || '').trim();
  if (!key || key.length > 128) return res.status(400).json({ error: 'A valid idempotency_key is required' });
  const { data, error } = await supabaseAdmin.rpc('charge_bcu_profile_interaction', {
    p_client_user_id: req.user!.id,
    p_profile_id: req.params.profileId,
    p_interaction_type: 'videochat',
    p_interaction_key: `videochat:${req.user!.id}:${req.params.profileId}:${key}`,
    p_reference_id: null
  });
  if (error) return sponsoredError(res, error.message);
  res.status(201).json({ interaction: data, charged_bc: '7', status: 'owner_notification_pending' });
}));

sponsoredProfilesRouter.get('/me', asyncHandler(async (req, res) => {
  const { data: profiles, error } = await supabaseAdmin.from('profiles')
    .select('id, display_name, sponsorship_type, owner_activation_status, ai_agent_mode, owner_activated_at')
    .eq('user_id', req.user!.id).eq('sponsorship_type', 'admin_sponsored');
  if (error) return res.status(400).json({ error: error.message });
  const ids = (profiles || []).map((profile) => profile.id);
  if (!ids.length) return res.json({ profiles: [], stats: emptySponsoredStats(), conversations: [] });
  const [{ data: sessions }, { data: bookings }] = await Promise.all([
    supabaseAdmin.from('profile_chat_sessions').select('*').in('profile_id', ids).order('last_message_at', { ascending: false }),
    supabaseAdmin.from('booking_requests').select('*').in('profile_id', ids).order('created_at', { ascending: false })
  ]);
  const sessionRows = sessions || [];
  const sessionIds = sessionRows.map((session) => session.id);
  const { data: messages } = sessionIds.length
    ? await supabaseAdmin.from('profile_chat_messages').select('id, session_id, sender_type, content, created_at').in('session_id', sessionIds)
    : { data: [] as any[] };
  const messageRows = messages || [];
  const activeProfileIds = new Set((profiles || [])
    .filter((profile) => profile.owner_activation_status === 'active')
    .map((profile) => profile.id));
  const transferredSessions = sessionRows.filter((session) => activeProfileIds.has(session.profile_id));
  const transferredSessionIds = new Set(transferredSessions.map((session) => session.id));
  res.json({
    profiles,
    stats: {
      messages: messageRows.filter((message) => message.sender_type === 'client').length,
      clients: new Set(sessionRows.map((session) => session.client_user_id)).size,
      booking_attempts: (bookings || []).length,
      unread_clients: new Set(sessionRows.filter((session) => !session.owner_read_at).map((session) => session.client_user_id)).size
    },
    conversations: transferredSessions.map((session) => ({
      ...session,
      messages: messageRows.filter((message) => transferredSessionIds.has(message.session_id) && message.session_id === session.id)
    })),
    booking_requests: (bookings || []).filter((booking) => activeProfileIds.has(booking.profile_id))
  });
}));

sponsoredProfilesRouter.post('/claim', asyncHandler(async (req, res) => {
  const claimToken = String(req.body.claim_token || '').trim();
  if (claimToken.length < 32 || claimToken.length > 256) {
    return res.status(400).json({ error: 'SPONSORED_CLAIM_TOKEN_INVALID' });
  }
  const ipHash = createHash('sha256').update(String(req.ip || 'unknown')).digest('hex');
  const { data: rateAllowed, error: rateError } = await supabaseAdmin.rpc('register_sponsored_profile_claim_attempt', {
    p_claimant_user_id: req.user!.id,
    p_ip_hash: ipHash
  });
  if (rateError) return res.status(400).json({ error: rateError.message });
  if (!rateAllowed) return res.status(429).json({ error: 'SPONSORED_CLAIM_RATE_LIMITED' });

  const tokenHash = createHash('sha256').update(claimToken).digest('hex');
  const { data, error } = await supabaseAdmin.rpc('claim_admin_sponsored_profile', {
    p_claimant_user_id: req.user!.id,
    p_token_hash: tokenHash
  });
  if (error) return sponsoredError(res, error.message);
  const profile = data?.profile || {};
  const businessProfile = ['agency', 'business', 'massage_salon', 'club_party'].includes(String(profile.account_type || profile.profile_type || ''));
  const { data: authUser, error: authReadError } = await supabaseAdmin.auth.admin.getUserById(req.user!.id);
  if (authReadError || !authUser.user) return res.status(500).json({ error: 'SPONSORED_CLAIM_AUTH_SYNC_REQUIRED' });
  const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(req.user!.id, {
    app_metadata: {
      ...(authUser.user.app_metadata || {}),
      auth_account_type: businessProfile ? 'business' : 'escort',
      plan: businessProfile ? 'business_monthly' : 'escort_monthly',
      subscription_status: 'active'
    }
  });
  if (authUpdateError) return res.status(500).json({ error: 'SPONSORED_CLAIM_AUTH_SYNC_REQUIRED' });
  res.json({ ...data, history_transferred: true, agent_mode: 'owner_assistant' });
}));

function emptySponsoredStats() {
  return { messages: 0, clients: 0, booking_attempts: 0, unread_clients: 0 };
}

function sponsoredError(res: any, message: string) {
  if (message.includes('ACTIVATION_REQUIRED')) return res.status(402).json({ error: message });
  if (message.includes('TOKEN_INVALID')) return res.status(400).json({ error: 'SPONSORED_CLAIM_TOKEN_INVALID' });
  if (message.includes('TOKEN_EXPIRED')) return res.status(410).json({ error: 'SPONSORED_CLAIM_TOKEN_EXPIRED' });
  if (message.includes('TOKEN_USED') || message.includes('TOKEN_REVOKED') || message.includes('NOT_CLAIMABLE')) return res.status(409).json({ error: message });
  if (message.includes('WALLET_CONFLICT')) return res.status(409).json({ error: message });
  if (message.includes('INSUFFICIENT')) return res.status(402).json({ error: message });
  if (message.includes('FORBIDDEN')) return res.status(403).json({ error: message });
  if (message.includes('NOT_FOUND') || message.includes('NOT_AVAILABLE')) return res.status(404).json({ error: message });
  return res.status(400).json({ error: message });
}
