import { Router } from 'express';
import { requireAdmin, verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import {
  allowedAdminReportStatuses,
  allowedModerationStatuses,
  allowedStatuses,
  allowedVerificationStatuses,
  asyncHandler,
  optionalText
} from '../validation.js';
import { normalizePhone } from '../utils/identity.js';

export const adminRouter = Router();

adminRouter.use(verifyUser, requireAdmin);

adminRouter.get('/stats', asyncHandler(async (_req, res) => {
  const [profiles, reports, bookings, activity] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, status, verification_status, moderation_status, is_test_account, created_at').limit(1000),
    supabaseAdmin.from('reports').select('id, admin_status, status').limit(1000),
    supabaseAdmin.from('booking_requests').select('id, status').limit(1000),
    supabaseAdmin.from('admin_activity_logs').select('*').order('created_at', { ascending: false }).limit(12)
  ]);

  if (profiles.error) return res.status(500).json({ error: profiles.error.message });
  if (reports.error) return res.status(500).json({ error: reports.error.message });
  if (bookings.error) return res.status(500).json({ error: bookings.error.message });

  const profileRows = profiles.data || [];
  const reportRows = reports.data || [];
  const bookingRows = bookings.data || [];

  res.json({
    stats: {
      total_profiles: profileRows.length,
      pending_verification: profileRows.filter((profile) => profile.verification_status === 'pending').length,
      active_profiles: profileRows.filter((profile) => profile.status === 'active').length,
      suspended_profiles: profileRows.filter((profile) => profile.status === 'suspended' || profile.moderation_status === 'suspended').length,
      booking_requests: bookingRows.length,
      reports: reportRows.length,
      test_accounts: profileRows.filter((profile) => profile.is_test_account).length
    },
    latest_activity: activity.data || []
  });
}));

adminRouter.get('/profiles', asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  let query = supabaseAdmin
    .from('profiles')
    .select('*, profile_images(*)')
    .order('created_at', { ascending: false })
    .limit(300);

  if (phone) {
    query = query.or(`primary_phone.eq.${phone},additional_phones.cs.{${phone}}`);
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  const rows = data || [];
  res.json({
    profiles: rows,
    stats: {
      total_profiles: rows.length,
      active_profiles: rows.filter((profile) => profile.status === 'active').length,
      pending_profiles: rows.filter((profile) => profile.status === 'pending').length,
      suspended_profiles: rows.filter((profile) => profile.status === 'suspended' || profile.moderation_status === 'suspended').length,
      test_accounts: rows.filter((profile) => profile.is_test_account).length
    }
  });
}));

adminRouter.patch('/profiles/:id/phone-conflict-status', asyncHandler(async (req, res) => {
  const status = String(req.body.phone_conflict_status || '');
  if (!['clear', 'warning', 'conflict'].includes(status)) return res.status(400).json({ error: 'Invalid phone conflict status' });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ phone_conflict_status: status })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'profile_phone_conflict_updated', 'profile', req.params.id, { phone_conflict_status: status });
  res.json({ profile: data });
}));

adminRouter.get('/profiles/:id', asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*, profile_images(*)')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: error.message });
  res.json({ profile: data });
}));

adminRouter.patch('/profiles/:id/status', asyncHandler(async (req, res) => {
  const status = String(req.body.status || '');
  if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const patch: Record<string, unknown> = { status };
  if (status === 'suspended') patch.suspended_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'profile_status_updated', 'profile', req.params.id, patch);
  res.json({ profile: data });
}));

adminRouter.patch('/profiles/:id/verification', asyncHandler(async (req, res) => {
  const verificationStatus = String(req.body.verification_status || req.body.status || '');
  const moderationStatus = String(req.body.moderation_status || '');
  if (!allowedVerificationStatuses.includes(verificationStatus)) return res.status(400).json({ error: 'Invalid verification status' });
  if (moderationStatus && !allowedModerationStatuses.includes(moderationStatus)) return res.status(400).json({ error: 'Invalid moderation status' });

  const patch: Record<string, unknown> = {
    verification_status: verificationStatus,
    verified: verificationStatus === 'verified'
  };
  if (verificationStatus === 'verified') patch.verified_at = new Date().toISOString();
  if (moderationStatus) {
    patch.moderation_status = moderationStatus;
    if (moderationStatus === 'suspended') patch.suspended_at = new Date().toISOString();
    if (moderationStatus === 'blocked') patch.blocked_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'profile_verification_updated', 'profile', req.params.id, patch);
  res.json({ profile: data });
}));

adminRouter.patch('/profiles/:id/test-account', asyncHandler(async (req, res) => {
  const isTestAccount = Boolean(req.body.is_test_account);
  const fakeStatus = String(req.body.availability_status || '');
  const patch: Record<string, unknown> = { is_test_account: isTestAccount };
  if (['available', 'busy', 'unavailable'].includes(fakeStatus)) patch.availability_status = fakeStatus;
  if (isTestAccount && req.body.activate_without_payment) {
    patch.status = 'active';
    patch.subscription_status = 'test';
    patch.verification_status = 'verified';
    patch.verified = true;
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'profile_test_account_updated', 'profile', req.params.id, patch);
  res.json({ profile: data });
}));

adminRouter.patch('/profiles/:id/admin-note', asyncHandler(async (req, res) => {
  const adminNote = optionalText(req.body.admin_note || req.body.note, 4000);
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ admin_note: adminNote })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'profile_admin_note_updated', 'profile', req.params.id, { admin_note: adminNote });
  res.json({ profile: data });
}));

adminRouter.get('/reports', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('*, profiles(display_name, city, status, moderation_status)')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ reports: data || [], reports_count: data?.length || 0 });
}));

adminRouter.patch('/reports/:id/status', asyncHandler(async (req, res) => {
  const adminStatus = String(req.body.admin_status || req.body.status || '');
  if (!allowedAdminReportStatuses.includes(adminStatus)) return res.status(400).json({ error: 'Invalid report status' });

  const patch: Record<string, unknown> = {
    admin_status: adminStatus,
    status: adminStatus === 'investigating' ? 'reviewing' : adminStatus === 'escalated' ? 'reviewing' : adminStatus,
    admin_note: optionalText(req.body.admin_note, 4000),
    escalated_to_authorities: Boolean(req.body.escalated_to_authorities)
  };
  if (adminStatus === 'resolved') patch.resolved_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('reports')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'report_status_updated', 'report', req.params.id, patch);
  res.json({ report: data });
}));

adminRouter.get('/bookings', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('booking_requests')
    .select('*, profiles(display_name, city, user_id)')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ booking_requests: data || [] });
}));

adminRouter.patch('/bookings/:id/status', asyncHandler(async (req, res) => {
  const status = String(req.body.status || '');
  if (!['pending', 'accepted', 'rejected', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid booking status' });
  }

  const { data, error } = await supabaseAdmin
    .from('booking_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'booking_status_updated', 'booking_request', req.params.id, { status });
  res.json({ booking_request: data });
}));

adminRouter.get('/settings', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('*')
    .in('key', ['listing_price', 'max_photos', 'default_language', 'supported_languages', 'enable_demo_profiles', 'enable_bookings', 'enable_live_cam_placeholder']);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ settings: normalizeSettings(data || []) });
}));

adminRouter.get('/tokens/stats', asyncHandler(async (_req, res) => {
  const [wallets, transactions, streams, unlocks] = await Promise.all([
    supabaseAdmin.from('wallets').select('escort_token_balance, eur_spent, referral_balance, frozen').limit(5000),
    supabaseAdmin.from('token_transactions').select('amount, transaction_type, status').limit(5000),
    supabaseAdmin.from('live_stream_sessions').select('status, viewer_count').limit(1000),
    supabaseAdmin.from('premium_unlocks').select('token_cost').limit(5000)
  ]);

  const walletRows = wallets.data || [];
  const transactionRows = transactions.data || [];
  const streamRows = streams.data || [];
  const unlockRows = unlocks.data || [];

  res.json({
    stats: {
      token_circulation: walletRows.reduce((sum, wallet) => sum + Number(wallet.escort_token_balance || 0), 0),
      eur_spent: walletRows.reduce((sum, wallet) => sum + Number(wallet.eur_spent || 0), 0),
      referral_balance: walletRows.reduce((sum, wallet) => sum + Number(wallet.referral_balance || 0), 0),
      frozen_wallets: walletRows.filter((wallet) => wallet.frozen).length,
      token_transfers: transactionRows.length,
      completed_transactions: transactionRows.filter((transaction) => transaction.status === 'completed').length,
      active_streams: streamRows.filter((stream) => stream.status === 'live').length,
      stream_viewers: streamRows.reduce((sum, stream) => sum + Number(stream.viewer_count || 0), 0),
      premium_unlock_value: unlockRows.reduce((sum, unlock) => sum + Number(unlock.token_cost || 0), 0),
      master_reserve_tatacoin: 500000
    }
  });
}));

adminRouter.patch('/wallets/:id/balance', asyncHandler(async (req, res) => {
  const balance = Number(req.body.escort_token_balance);
  if (!Number.isFinite(balance) || balance < 0) return res.status(400).json({ error: 'Invalid token balance' });

  const { data, error } = await supabaseAdmin
    .from('wallets')
    .update({ escort_token_balance: balance, frozen: Boolean(req.body.frozen) })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'wallet_balance_adjusted', 'wallet', req.params.id, { escort_token_balance: balance });
  res.json({ wallet: data });
}));

adminRouter.patch('/settings', asyncHandler(async (req, res) => {
  const input = req.body.settings || req.body;
  const allowed = ['listing_price', 'max_photos', 'default_language', 'supported_languages', 'enable_demo_profiles', 'enable_bookings', 'enable_live_cam_placeholder'];
  const rows = Object.entries(input)
    .filter(([key]) => allowed.includes(key))
    .map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));

  if (!rows.length) return res.status(400).json({ error: 'No valid settings provided' });

  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .upsert(rows, { onConflict: 'key' })
    .select();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'settings_updated', 'app_settings', null, input);
  res.json({ settings: normalizeSettings(data || []) });
}));

async function logAdminAction(adminEmail: string | undefined, action: string, targetType: string, targetId: string | null, details: Record<string, unknown>) {
  await supabaseAdmin.from('admin_activity_logs').insert({
    admin_email: adminEmail || null,
    action,
    target_type: targetType,
    target_id: targetId,
    details
  });
}

function normalizeSettings(rows: Array<{ key: string; value: unknown }>) {
  const defaults: Record<string, unknown> = {
    listing_price: 49.99,
    max_photos: 6,
    default_language: 'DE',
    supported_languages: ['DE', 'PL', 'EN'],
    enable_demo_profiles: true,
    enable_bookings: true,
    enable_live_cam_placeholder: true
  };

  rows.forEach((row) => {
    defaults[row.key] = row.value;
  });

  return defaults;
}
