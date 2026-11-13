import { Router } from 'express';
import { createHash } from 'node:crypto';
import { asyncHandler } from '../validation.js';
import { config } from '../config.js';
import { supabaseAdmin } from '../supabase.js';
import { writeAdminAuditLog } from '../services/adminAudit.js';
import {
  WAITLIST_CONSENT_VERSION,
  WAITLIST_INTEREST_TYPES,
  WAITLIST_LANGUAGES,
  WAITLIST_LAUNCH_TEMPLATE_VERSION,
  WAITLIST_RETENTION,
  launchMail,
  sendWaitlistMail,
  summarizeLeads,
  waitlistMailConfigured,
  type LeadRow,
  type WaitlistInterestType,
  type WaitlistLanguage
} from '../waitlist.js';

/**
 * LEAD INTELLIGENCE (admin only; mounted behind verifyAdminJwt + requireAdmin).
 * Interest-list leads are kept apart from accounts and payments: nothing here reads orders or entitlements.
 */
export const adminLeadsRouter = Router();

const isInterestType = (value: unknown): value is WaitlistInterestType => (WAITLIST_INTEREST_TYPES as readonly string[]).includes(String(value));
const adminEmail = (req: { user?: { email?: string } }) => req.user?.email;

async function loadLeadRows() {
  const rows: (LeadRow & { email: string | null })[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('waitlist_leads')
      .select('email,interest_type,preferred_language,status,source_page,created_at,confirmed_at,unsubscribed_at,confirm_token_expires_at')
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data || []) as typeof rows));
    if (!data || data.length < 1000) break;
  }
  // Distinct people are counted from a one-way hash in memory; addresses never leave this function.
  return rows.map(({ email, ...row }) => ({ ...row, person: email ? createHash('sha256').update(email).digest('hex') : null }));
}

adminLeadsRouter.get('/summary', asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
  let rows: LeadRow[];
  try {
    rows = await loadLeadRows();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === 'PGRST205') return res.json({ available: false, reason: 'migration_063_missing', ...state() });
    return res.status(500).json({ error: 'Lead summary failed' });
  }
  const { data: announcements } = await supabaseAdmin.from('waitlist_announcements')
    .select('interest_type,status,created_at,completed_at,recipients,sent,failed').order('created_at', { ascending: false });
  res.json({ available: true, ...state(), summary: summarizeLeads(rows, new Date(), days), announcements: announcements || [] });
}));

function state() {
  return {
    collection_enabled: config.waitlistCollectionEnabled,
    mail_configured: waitlistMailConfigured(),
    launch_send_enabled: config.waitlistLaunchSendEnabled,
    consent_version: WAITLIST_CONSENT_VERSION,
    retention: WAITLIST_RETENTION
  };
}

// Export of confirmed, still-subscribed addresses for one segment. Every export is written to the audit log.
adminLeadsRouter.get('/export', asyncHandler(async (req, res) => {
  const type = req.query.interest_type;
  if (!isInterestType(type)) return res.status(400).json({ error: 'interest_type required' });
  const { data, error } = await supabaseAdmin.from('waitlist_leads')
    .select('email,interest_type,preferred_language,source_page,confirmed_at')
    .eq('interest_type', type).eq('status', 'confirmed').not('email', 'is', null)
    .order('confirmed_at', { ascending: true });
  if (error) return res.status(500).json({ error: 'Export failed' });
  await writeAdminAuditLog(adminEmail(req), 'waitlist_export', 'waitlist_leads', type, { interest_type: type, rows: data?.length || 0 });
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = ['email,interest_type,preferred_language,source_page,confirmed_at', ...(data || []).map((row) => [row.email, row.interest_type, row.preferred_language, row.source_page, row.confirmed_at].map(cell).join(','))].join('\n');
  res.set('Cache-Control', 'no-store');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="escort-radar-leads-${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${csv}\n`);
}));

// ---------- Future launch announcement (prepared; sending stays off until WAITLIST_LAUNCH_SEND_ENABLED=true) ----------

async function launchRecipients(type: WaitlistInterestType) {
  const { data, error } = await supabaseAdmin.from('waitlist_leads')
    .select('id,email,preferred_language')
    .eq('interest_type', type).eq('status', 'confirmed').not('email', 'is', null);
  if (error) throw error;
  return (data || []) as { id: string; email: string; preferred_language: WaitlistLanguage }[];
}

adminLeadsRouter.post('/announcements/preview', asyncHandler(async (req, res) => {
  const { interest_type: type, language } = (req.body || {}) as { interest_type?: unknown; language?: unknown };
  if (!isInterestType(type)) return res.status(400).json({ error: 'interest_type required' });
  const lang = ((WAITLIST_LANGUAGES as readonly string[]).includes(String(language)) ? language : 'de') as WaitlistLanguage;
  const recipients = await launchRecipients(type);
  const mail = launchMail({ to: 'recipient@example.invalid', leadId: '00000000-0000-0000-0000-000000000000', type, language: lang });
  const { data: existing } = await supabaseAdmin.from('waitlist_announcements').select('status,created_at').eq('interest_type', type).maybeSingle();
  res.json({
    interest_type: type,
    language: lang,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    recipients: recipients.length,
    already_sent: Boolean(existing),
    send_enabled: config.waitlistLaunchSendEnabled && waitlistMailConfigured()
  });
}));

adminLeadsRouter.post('/announcements/send', asyncHandler(async (req, res) => {
  const { interest_type: type, confirm } = (req.body || {}) as { interest_type?: unknown; confirm?: unknown };
  if (!config.waitlistLaunchSendEnabled) return res.status(409).json({ error: 'Launch announcements are disabled', code: 'WAITLIST_LAUNCH_SEND_DISABLED' });
  if (!waitlistMailConfigured()) return res.status(503).json({ error: 'Mail service not configured', code: 'WAITLIST_MAIL_UNAVAILABLE' });
  if (!isInterestType(type)) return res.status(400).json({ error: 'interest_type required' });
  if (confirm !== `SEND ${type}`) return res.status(400).json({ error: `Type "SEND ${type}" to confirm`, code: 'WAITLIST_CONFIRMATION_REQUIRED' });

  // The unique index allows exactly one announcement per segment: a second attempt is refused.
  const { data: announcement, error: createError } = await supabaseAdmin.from('waitlist_announcements')
    .insert({ interest_type: type, template_version: WAITLIST_LAUNCH_TEMPLATE_VERSION, status: 'sending', created_by: adminEmail(req) || null })
    .select('id').single();
  if (createError?.code === '23505') return res.status(409).json({ error: 'Announcement already sent for this segment', code: 'WAITLIST_ANNOUNCEMENT_EXISTS' });
  if (createError || !announcement) return res.status(500).json({ error: 'Announcement failed' });

  const recipients = await launchRecipients(type);
  await writeAdminAuditLog(adminEmail(req), 'waitlist_announcement_start', 'waitlist_announcements', announcement.id, { interest_type: type, recipients: recipients.length });
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    // Re-check right before sending: an address withdrawn meanwhile is skipped.
    const { data: current } = await supabaseAdmin.from('waitlist_leads').select('status').eq('id', recipient.id).maybeSingle();
    if (current?.status !== 'confirmed') continue;
    const { error: claimError } = await supabaseAdmin.from('waitlist_deliveries')
      .insert({ announcement_id: announcement.id, lead_id: recipient.id, status: 'failed', error_code: 'in_progress' });
    if (claimError) continue;
    let status: 'sent' | 'failed' = 'sent';
    let errorCode: string | null = null;
    try {
      await sendWaitlistMail(launchMail({ to: recipient.email, leadId: recipient.id, type, language: recipient.preferred_language }));
      sent += 1;
    } catch (error) {
      status = 'failed';
      errorCode = String((error as { code?: string }).code || 'send_failed').slice(0, 80);
      failed += 1;
    }
    await supabaseAdmin.from('waitlist_deliveries').update({ status, error_code: errorCode, attempted_at: new Date().toISOString() })
      .eq('announcement_id', announcement.id).eq('lead_id', recipient.id);
  }
  await supabaseAdmin.from('waitlist_announcements')
    .update({ status: 'sent', completed_at: new Date().toISOString(), recipients: recipients.length, sent, failed })
    .eq('id', announcement.id);
  await writeAdminAuditLog(adminEmail(req), 'waitlist_announcement_done', 'waitlist_announcements', announcement.id, { interest_type: type, sent, failed });
  res.json({ ok: true, interest_type: type, recipients: recipients.length, sent, failed });
}));
