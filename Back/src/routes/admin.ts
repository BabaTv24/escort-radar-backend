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

adminRouter.get('/users', asyncHandler(async (_req, res) => {
  const [{ data: authUsers, error: authError }, { data: profiles }, { data: wallets }] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabaseAdmin.from('profiles').select('id, user_id, account_type, public_user_id, referral_code, is_test_account, status, created_at').limit(2000),
    supabaseAdmin.from('wallets').select('*').limit(2000)
  ]);

  if (authError) return res.status(500).json({ error: authError.message });

  const profileRows = profiles || [];
  const walletRows = wallets || [];
  const users = (authUsers.users || []).map((user) => {
    const userProfiles = profileRows.filter((profile) => profile.user_id === user.id);
    const wallet = walletRows.find((row) => row.user_id === user.id);
    const primaryProfile = userProfiles[0];
    return {
      id: user.id,
      email: user.email,
      role: user.app_metadata?.role || 'user',
      account_type: primaryProfile?.account_type || user.user_metadata?.account_type || 'private',
      public_user_id: primaryProfile?.public_user_id || null,
      referral_code: primaryProfile?.referral_code || null,
      token_balance: Number(wallet?.escort_token_balance || 0),
      wallet_id: wallet?.id || null,
      wallet_frozen: Boolean(wallet?.frozen),
      profile_count: userProfiles.length,
      is_test_account: userProfiles.some((profile) => profile.is_test_account) || String(user.email || '').includes('+test'),
      created_at: user.created_at,
      status: user.banned_until ? 'suspended' : 'active'
    };
  });

  res.json({ users });
}));

adminRouter.get('/subscriptions', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, user_id, display_name, listing_plan, listing_price, listing_currency, subscription_status, subscription_started_at, subscription_expires_at, is_test_account, admin_note, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ subscriptions: data || [] });
}));

adminRouter.get('/tags', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('tags')
    .select('*')
    .order('group_key', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ tags: data || [] });
}));

adminRouter.post('/tags', asyncHandler(async (req, res) => {
  const slug = String(req.body.slug || req.body.label || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const label = optionalText(req.body.label, 80);
  if (!slug || !label) return res.status(400).json({ error: 'Tag slug and label are required' });

  const { data, error } = await supabaseAdmin
    .from('tags')
    .insert({
      slug,
      label,
      group_key: optionalText(req.body.group_key, 60) || 'premium',
      sort_order: Number(req.body.sort_order || 100),
      active: req.body.active !== false
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'tag_created', 'tag', data.id, data);
  res.status(201).json({ tag: data });
}));

adminRouter.patch('/tags/:id', asyncHandler(async (req, res) => {
  const patch = {
    label: optionalText(req.body.label, 80),
    group_key: optionalText(req.body.group_key, 60) || 'premium',
    sort_order: Number(req.body.sort_order || 100),
    active: req.body.active !== false
  };

  const { data, error } = await supabaseAdmin
    .from('tags')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'tag_updated', 'tag', req.params.id, patch);
  res.json({ tag: data });
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

adminRouter.patch('/profiles/:id/promotion', asyncHandler(async (req, res) => {
  const days = Number(req.body.days || 7);
  const patch = {
    promoted_until: new Date(Date.now() + Math.max(1, Math.min(days, 90)) * 24 * 60 * 60 * 1000).toISOString(),
    shadowbanned: Boolean(req.body.shadowbanned)
  };

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'profile_promotion_updated', 'profile', req.params.id, patch);
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
  const [wallets, transactions, streams, unlocks, masterWallets, purchaseRequests] = await Promise.all([
    supabaseAdmin.from('wallets').select('escort_token_balance, eur_spent, referral_balance, frozen').limit(5000),
    supabaseAdmin.from('token_transactions').select('amount, transaction_type, status').limit(5000),
    supabaseAdmin.from('live_stream_sessions').select('status, viewer_count').limit(1000),
    supabaseAdmin.from('premium_unlocks').select('token_cost').limit(5000),
    supabaseAdmin.from('master_admin_wallets').select('*').eq('active', true).limit(1),
    supabaseAdmin.from('token_purchase_requests').select('status, token_amount, eur_price').limit(5000)
  ]);

  const walletRows = wallets.data || [];
  const transactionRows = transactions.data || [];
  const streamRows = streams.data || [];
  const unlockRows = unlocks.data || [];
  const masterWallet = masterWallets.data?.[0] || {};
  const purchaseRows = purchaseRequests.data || [];

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
      pending_purchases: purchaseRows.filter((purchase) => purchase.status === 'pending').length,
      approved_purchase_value: purchaseRows.filter((purchase) => purchase.status === 'approved').reduce((sum, purchase) => sum + Number(purchase.eur_price || 0), 0),
      master_reserve_tatacoin: Number(masterWallet.reserve_amount || 500000),
      distributed_amount: Number(masterWallet.distributed_amount || 0),
      burned_amount: Number(masterWallet.burned_amount || 0),
      locked_amount: Number(masterWallet.locked_amount || 0),
      revenue_estimate_eur: Number(masterWallet.revenue_estimate_eur || 0)
    }
  });
}));

adminRouter.get('/wallets', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('wallets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ wallets: data || [] });
}));

adminRouter.get('/token-transactions', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('token_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ transactions: data || [] });
}));

adminRouter.get('/token-purchase-requests', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('token_purchase_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ purchase_requests: data || [] });
}));

adminRouter.patch('/token-purchase-requests/:id/status', asyncHandler(async (req, res) => {
  const status = String(req.body.status || '');
  if (!['pending', 'approved', 'failed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid purchase status' });

  const { data: purchase, error: fetchError } = await supabaseAdmin
    .from('token_purchase_requests')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (fetchError || !purchase) return res.status(404).json({ error: fetchError?.message || 'Purchase request not found' });

  const patch = { status, admin_note: optionalText(req.body.admin_note, 1000), updated_at: new Date().toISOString() };
  const { data, error } = await supabaseAdmin
    .from('token_purchase_requests')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  if (status === 'approved' && purchase.wallet_id) {
    const amount = Number(purchase.token_amount || 0) + Number(purchase.bonus_tokens || 0);
    const { data: wallet } = await supabaseAdmin.from('wallets').select('*').eq('id', purchase.wallet_id).single();
    await supabaseAdmin
      .from('wallets')
      .update({
        escort_token_balance: Number(wallet?.escort_token_balance || 0) + amount,
        eur_spent: Number(wallet?.eur_spent || 0) + Number(purchase.eur_price || 0)
      })
      .eq('id', purchase.wallet_id);
    await supabaseAdmin.from('token_transactions').insert({
      to_wallet_id: purchase.wallet_id,
      amount,
      transaction_type: 'manual_purchase_approval',
      status: 'completed',
      metadata: { purchase_request_id: purchase.id, eur_price: purchase.eur_price }
    });
    const { data: masterWallet } = await supabaseAdmin.from('master_admin_wallets').select('*').eq('active', true).limit(1).maybeSingle();
    if (masterWallet) {
      await supabaseAdmin
        .from('master_admin_wallets')
        .update({
          distributed_amount: Number(masterWallet.distributed_amount || 0) + amount,
          revenue_estimate_eur: Number(masterWallet.revenue_estimate_eur || 0) + Number(purchase.eur_price || 0),
          updated_at: new Date().toISOString()
        })
        .eq('id', masterWallet.id);
    }
  }

  await logAdminAction(req.user?.email, 'token_purchase_status_updated', 'token_purchase_request', req.params.id, patch);
  res.json({ purchase_request: data });
}));

adminRouter.get('/master-wallets', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('master_admin_wallets').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ master_wallets: data || [] });
}));

adminRouter.patch('/master-wallets/:id', asyncHandler(async (req, res) => {
  const patch = {
    reserve_amount: Number(req.body.reserve_amount || 0),
    distributed_amount: Number(req.body.distributed_amount || 0),
    burned_amount: Number(req.body.burned_amount || 0),
    locked_amount: Number(req.body.locked_amount || 0),
    revenue_estimate_eur: Number(req.body.revenue_estimate_eur || 0),
    solana_wallet_address: optionalText(req.body.solana_wallet_address, 120),
    phantom_connected: Boolean(req.body.phantom_connected),
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabaseAdmin.from('master_admin_wallets').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'master_wallet_updated', 'master_admin_wallet', req.params.id, patch);
  res.json({ master_wallet: data });
}));

adminRouter.get('/photos', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profile_images')
    .select('*, profiles(display_name, city, user_id)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ photos: data || [] });
}));

adminRouter.patch('/photos/:id/status', asyncHandler(async (req, res) => {
  const status = String(req.body.moderation_status || req.body.status || '');
  if (!['pending', 'approved', 'rejected', 'blocked'].includes(status)) return res.status(400).json({ error: 'Invalid photo status' });
  const { data, error } = await supabaseAdmin
    .from('profile_images')
    .update({ moderation_status: status, admin_note: optionalText(req.body.admin_note, 1000) })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'photo_moderation_updated', 'profile_image', req.params.id, { moderation_status: status });
  res.json({ photo: data });
}));

adminRouter.get('/live-sessions', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('live_stream_sessions').select('*, profiles(display_name, city)').order('created_at', { ascending: false }).limit(300);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ live_sessions: data || [] });
}));

adminRouter.patch('/live-sessions/:id/status', asyncHandler(async (req, res) => {
  const status = String(req.body.status || 'suspended');
  const { data, error } = await supabaseAdmin.from('live_stream_sessions').update({ status }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'live_session_status_updated', 'live_stream_session', req.params.id, { status });
  res.json({ live_session: data });
}));

adminRouter.get('/chat-sessions', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('private_chat_sessions').select('*, profiles(display_name, city)').order('created_at', { ascending: false }).limit(300);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ chat_sessions: data || [] });
}));

adminRouter.post('/live-lab/simulate', asyncHandler(async (req, res) => {
  const simulation = String(req.body.simulation || 'purchase');
  await logAdminAction(req.user?.email, `live_lab_${simulation}`, 'live_lab', null, { simulation });
  res.status(201).json({ simulation, status: 'completed' });
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
