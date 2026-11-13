import { Router, type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import { asyncHandler } from '../validation.js';
import { config } from '../config.js';
import { supabaseAdmin } from '../supabase.js';
import { TrafficRateLimiter, clientAddressFromHeaders } from '../trafficAnalytics.js';
import {
  WAITLIST_MAX_SENDS_PER_RECORD,
  WAITLIST_RESEND_COOLDOWN_MS,
  WAITLIST_RETENTION,
  WAITLIST_TOKEN_TTL_MS,
  alreadyConfirmedMail,
  confirmationMail,
  createConfirmToken,
  hashWaitlistToken,
  isWellFormedToken,
  sendWaitlistMail,
  validateWaitlistSubmission,
  verifyUnsubscribeToken,
  waitlistCollectionOpen,
  waitlistMailConfigured,
  type WaitlistInterestType,
  type WaitlistLanguage
} from '../waitlist.js';

export const waitlistRouter = Router();

// Abuse protection (in memory, per instance): per client address, per address+mailbox and overall.
const addressLimiter = new TrafficRateLimiter(5, 60 * 60 * 1000);
const confirmLimiter = new TrafficRateLimiter(30, 60 * 60 * 1000);
const globalLimiter = new TrafficRateLimiter(300, 60 * 60 * 1000);

/** The same neutral answer for new, pending, confirmed and unsubscribed addresses (no account oracle). */
const NEUTRAL = { ok: true, status: 'check_inbox' } as const;

function addressKey(req: Request) {
  const address = clientAddressFromHeaders(req.headers, req.socket.remoteAddress, {
    trustedProxyHops: config.analyticsTrustedProxyHops,
    clientIpHeader: config.analyticsClientIpHeader
  });
  return createHash('sha256').update(`waitlist\u0001${address}`).digest('hex');
}

function closedResponse(res: Response) {
  if (!config.waitlistCollectionEnabled) return res.status(403).json({ error: 'The interest list is not open', code: 'WAITLIST_DISABLED' });
  return res.status(503).json({ error: 'The interest list is temporarily unavailable', code: 'WAITLIST_MAIL_UNAVAILABLE' });
}

waitlistRouter.post('/interest', asyncHandler(async (req, res) => {
  // Closed: nothing is parsed, stored or sent.
  if (!waitlistCollectionOpen()) return closedResponse(res);
  const decision = validateWaitlistSubmission(req.body);
  if (!decision.ok) return res.status(400).json({ error: 'Invalid request', code: decision.code });
  if (!globalLimiter.allow('all') || !addressLimiter.allow(addressKey(req))) {
    return res.status(429).json({ error: 'Too many requests', code: 'WAITLIST_RATE_LIMITED' });
  }
  // Honeypot filled in: answer like a success, store and send nothing.
  if (decision.honeypot) return res.status(202).json(NEUTRAL);

  const { email, interest_type, preferred_language, source_page } = decision.value;
  const now = new Date();
  const { data: existing, error: readError } = await supabaseAdmin
    .from('waitlist_leads')
    .select('id,status,confirmation_sent_at,confirmation_send_count')
    .eq('email', email)
    .eq('interest_type', interest_type)
    .maybeSingle();
  if (readError) return res.status(500).json({ error: 'Request failed', code: 'WAITLIST_FAILED' });

  const recentlySent = existing?.confirmation_sent_at && now.getTime() - new Date(existing.confirmation_sent_at).getTime() < WAITLIST_RESEND_COOLDOWN_MS;
  if (existing && (recentlySent || existing.confirmation_send_count >= WAITLIST_MAX_SENDS_PER_RECORD)) {
    // Duplicate within the cool-down or over the per-record cap: same answer, no further mail.
    return res.status(202).json(NEUTRAL);
  }

  const language = preferred_language as WaitlistLanguage;
  const type = interest_type as WaitlistInterestType;
  let leadId: string;
  let mail;
  if (existing?.status === 'confirmed') {
    leadId = existing.id;
    mail = alreadyConfirmedMail({ to: email, leadId, type, language });
    await supabaseAdmin.from('waitlist_leads').update({
      confirmation_sent_at: now.toISOString(),
      confirmation_send_count: existing.confirmation_send_count + 1,
      updated_at: now.toISOString()
    }).eq('id', leadId);
  } else {
    // New, pending or previously withdrawn: a fresh single-use token; the record stays pending until confirmed.
    const { token, hash } = createConfirmToken();
    const fields = {
      status: 'pending',
      preferred_language: language,
      source_page,
      consent_version: (req.body as { consent_version: string }).consent_version,
      consent_given_at: now.toISOString(),
      confirm_token_hash: hash,
      confirm_token_expires_at: new Date(now.getTime() + WAITLIST_TOKEN_TTL_MS).toISOString(),
      confirmation_sent_at: now.toISOString(),
      unsubscribed_at: null,
      confirmed_at: null,
      updated_at: now.toISOString()
    };
    if (existing) {
      const { error } = await supabaseAdmin.from('waitlist_leads')
        .update({ ...fields, confirmation_send_count: existing.confirmation_send_count + 1 })
        .eq('id', existing.id);
      if (error) return res.status(500).json({ error: 'Request failed', code: 'WAITLIST_FAILED' });
      leadId = existing.id;
    } else {
      const { data: inserted, error } = await supabaseAdmin.from('waitlist_leads')
        .insert({ email, interest_type, ...fields, confirmation_send_count: 1 })
        .select('id')
        .single();
      // A concurrent duplicate insert loses the unique index race: answer neutrally.
      if (error?.code === '23505') return res.status(202).json(NEUTRAL);
      if (error || !inserted) return res.status(500).json({ error: 'Request failed', code: 'WAITLIST_FAILED' });
      leadId = inserted.id;
    }
    mail = confirmationMail({ to: email, leadId, token, type, language });
  }

  try {
    await sendWaitlistMail(mail);
  } catch (error) {
    console.error('[waitlist] confirmation mail failed', { code: (error as { code?: string })?.code || 'unknown' });
    // Nothing unverified is kept for a failed first mail; an existing record keeps its state but loses the
    // cool-down so that a retry really sends. Pending records are never counted as leads.
    if (!existing) await supabaseAdmin.from('waitlist_leads').delete().eq('id', leadId).eq('status', 'pending');
    else await supabaseAdmin.from('waitlist_leads').update({ confirmation_sent_at: null, confirmation_send_count: existing.confirmation_send_count }).eq('id', leadId);
    return res.status(502).json({ error: 'The confirmation e-mail could not be sent', code: 'WAITLIST_MAIL_FAILED' });
  }
  res.status(202).json(NEUTRAL);
}));

waitlistRouter.post('/confirm', asyncHandler(async (req, res) => {
  if (!waitlistCollectionOpen()) return closedResponse(res);
  if (!confirmLimiter.allow(addressKey(req))) return res.status(429).json({ error: 'Too many requests', code: 'WAITLIST_RATE_LIMITED' });
  const token = (req.body as { token?: unknown } | undefined)?.token;
  if (!isWellFormedToken(token)) return res.status(410).json({ error: 'Link invalid or already used', code: 'WAITLIST_TOKEN_INVALID' });
  const hash = hashWaitlistToken(token);
  const now = new Date().toISOString();
  const { data: confirmed, error } = await supabaseAdmin.from('waitlist_leads')
    .update({ status: 'confirmed', confirmed_at: now, confirm_token_hash: null, confirm_token_expires_at: null, updated_at: now })
    .eq('confirm_token_hash', hash)
    .eq('status', 'pending')
    .gt('confirm_token_expires_at', now)
    .select('interest_type')
    .maybeSingle();
  if (error) return res.status(500).json({ error: 'Request failed', code: 'WAITLIST_FAILED' });
  if (confirmed) return res.json({ ok: true, status: 'confirmed', interest_type: confirmed.interest_type });
  const { data: expired } = await supabaseAdmin.from('waitlist_leads').select('id').eq('confirm_token_hash', hash).maybeSingle();
  if (expired) return res.status(410).json({ error: 'Link expired', code: 'WAITLIST_TOKEN_EXPIRED' });
  return res.status(410).json({ error: 'Link invalid or already used', code: 'WAITLIST_TOKEN_INVALID' });
}));

// Withdrawal always works while the mail secret exists, even when collection is closed.
waitlistRouter.post('/unsubscribe', asyncHandler(async (req, res) => {
  if (!confirmLimiter.allow(addressKey(req))) return res.status(429).json({ error: 'Too many requests', code: 'WAITLIST_RATE_LIMITED' });
  const { id, token } = (req.body || {}) as { id?: unknown; token?: unknown };
  if (!verifyUnsubscribeToken(id, token)) return res.status(400).json({ error: 'Link invalid', code: 'WAITLIST_UNSUBSCRIBE_INVALID' });
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from('waitlist_leads')
    .update({ status: 'unsubscribed', unsubscribed_at: now, confirm_token_hash: null, confirm_token_expires_at: null, updated_at: now })
    .eq('id', id as string)
    .neq('status', 'unsubscribed');
  if (error) return res.status(500).json({ error: 'Request failed', code: 'WAITLIST_FAILED' });
  res.json({ ok: true, status: 'unsubscribed' });
}));

export async function pruneWaitlist() {
  const { data, error } = await supabaseAdmin.rpc('prune_waitlist', {
    p_pending_days: WAITLIST_RETENTION.pendingDays,
    p_unsubscribed_days: WAITLIST_RETENTION.unsubscribedDays,
    p_confirmed_days: WAITLIST_RETENTION.confirmedDays
  });
  if (error) {
    // Before migration 063 is applied the function does not exist; nothing to prune then.
    if (error.code !== 'PGRST202' && error.code !== '42883') console.warn('[waitlist] retention failed', error.code);
    return null;
  }
  return data;
}

let retentionTimer: NodeJS.Timeout | null = null;
export function startWaitlistRetention() {
  if (retentionTimer) return;
  void pruneWaitlist();
  retentionTimer = setInterval(() => { void pruneWaitlist(); }, 6 * 60 * 60 * 1000);
  retentionTimer.unref();
}

export function waitlistPublicState() {
  return { waitlist_enabled: waitlistCollectionOpen(), waitlist_mail_configured: waitlistMailConfigured() };
}
