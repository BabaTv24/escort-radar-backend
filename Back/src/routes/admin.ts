import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { requireAdmin, verifyAdminJwt } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import {
  allowedAdminReportStatuses,
  allowedModerationStatuses,
  allowedStatuses,
  allowedVerificationStatuses,
  asyncHandler,
  optionalText,
  slugify
} from '../validation.js';
import { normalizePhone } from '../utils/identity.js';
import { writeAdminAuditLog } from '../services/adminAudit.js';
import { config } from '../config.js';
import { signAdminToken } from '../utils/adminJwt.js';
import { allowedServiceKeys } from '../serviceCatalog.js';

export const adminRouter = Router();

const adminUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const premiumTiers = ['standard', 'gold', 'elite', 'diamond'];
const operatorStatuses = ['ONLINE_NOW', 'AVAILABLE_TODAY', 'BUSY', 'APPOINTMENT_ONLY', 'TRAVELING', 'OFFLINE'];
const berlinSeedAreas = ['Mitte', 'Charlottenburg', 'Prenzlauer Berg', 'Kreuzberg', 'Friedrichshain', 'Wilmersdorf', 'Schoneberg', 'Neukolln'];
const berlinSeedNames = ['Mila', 'Nora', 'Elena', 'Sofia', 'Lina', 'Amara', 'Vera', 'Nika', 'Alina', 'Mara', 'Eva', 'Lea', 'Iris', 'Kira', 'Livia', 'Selin', 'Anya', 'Noemi', 'Lara', 'Mina', 'Rosa', 'Clara', 'Yara', 'Nina'];
const berlinSeedCategories = ['ladies', 'massage', 'house_hotel', 'live_cam', 'couples', 'trans', 'gay'];
const berlinSeedServices = ['towarzystwo', 'pocalunki', 'masaz', 'masaz_relaksacyjny', 'dyskrecja', 'wspolne_wyjscia', 'spotkanie_calonocne', 'prywatnie', 'namietne_pocalunki', 'spa'];

adminRouter.post('/login', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const twoFactorCode = String(req.body.two_factor_code || req.body.twoFactorCode || '');
  const allowedEmails = new Set([config.adminEmail, ...config.adminEmails].filter(Boolean));

  if (!config.adminPassword || !config.jwtSecret) {
    console.error('Admin login is not configured: ADMIN_PASSWORD and JWT_SECRET are required');
    return res.status(500).json({ error: 'Admin login is not configured' });
  }

  if (!allowedEmails.has(email) || password !== config.adminPassword) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  if (config.admin2faSecret && twoFactorCode !== config.admin2faSecret) {
    return res.status(401).json({ error: 'Invalid admin 2FA code' });
  }

  const token = signAdminToken(email);
  res.json({
    token,
    admin: {
      id: email,
      email,
      role: 'admin',
      admin: true
    }
  });
}));

adminRouter.use(verifyAdminJwt, requireAdmin);

adminRouter.get('/me', asyncHandler(async (req, res) => {
  res.json({
    admin: {
      id: req.user?.id,
      email: req.user?.email,
      role: req.user?.app_metadata?.role || 'admin',
      admin: req.user?.app_metadata?.admin === true
    }
  });
}));

adminRouter.get('/stats', asyncHandler(async (_req, res) => {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);

  const [profiles, reports, bookings, activity, activationPayments, activations] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, display_name, city, category, status, verification_status, moderation_status, is_test_account, available_now, created_at').limit(1000),
    supabaseAdmin.from('reports').select('id, admin_status, status').limit(1000),
    supabaseAdmin.from('booking_requests').select('id, status, created_at').limit(1000),
    supabaseAdmin.from('admin_activity_logs').select('*').order('created_at', { ascending: false }).limit(12),
    supabaseAdmin.from('client_activation_payments').select('*').eq('status', 'paid').order('created_at', { ascending: false }).limit(1000),
    supabaseAdmin.from('client_activations').select('id, state').limit(5000)
  ]);

  if (profiles.error) return res.status(500).json({ error: profiles.error.message });
  if (reports.error) return res.status(500).json({ error: reports.error.message });
  if (bookings.error) return res.status(500).json({ error: bookings.error.message });
  if (activationPayments.error) return res.status(500).json({ error: activationPayments.error.message });

  const profileRows = profiles.data || [];
  const reportRows = reports.data || [];
  const bookingRows = bookings.data || [];
  const activationPaymentRows = activationPayments.data || [];
  const activationRows = activations.data || [];
  const dailyClientActivationRevenue = sumPaymentCents(activationPaymentRows.filter((row) => new Date(row.created_at) >= dayStart));
  const monthlyClientActivationRevenue = sumPaymentCents(activationPaymentRows.filter((row) => new Date(row.created_at) >= monthStart));
  const activatedClientCount = activationRows.filter((activation) => activation.state === 'client_activated').length;
  const registeredClientCount = activationRows.length;
  const latestActivationPayments = activationPaymentRows.slice(0, 12).map((payment) => ({
    id: payment.id,
    admin_email: payment.email,
    action: 'client_activation_payment',
    target_type: 'client_activation_payment',
    target_id: payment.stripe_session_id,
    details: {
      amount_cents: payment.amount_cents,
      currency: payment.currency,
      status: payment.status
    },
    created_at: payment.created_at
  }));

  res.json({
    stats: {
      total_profiles: profileRows.length,
      pending_verification: profileRows.filter((profile) => profile.verification_status === 'pending').length,
      active_profiles: profileRows.filter((profile) => profile.status === 'active').length,
      available_profiles: profileRows.filter((profile) => profile.available_now).length,
      suspended_profiles: profileRows.filter((profile) => profile.status === 'suspended' || profile.moderation_status === 'suspended').length,
      booking_requests: bookingRows.length,
      bookings_today: bookingRows.filter((booking) => new Date(booking.created_at) >= dayStart).length,
      reports: reportRows.length,
      test_accounts: profileRows.filter((profile) => profile.is_test_account).length,
      daily_revenue_eur: dailyClientActivationRevenue,
      monthly_revenue_eur: monthlyClientActivationRevenue,
      client_activation_revenue_eur: sumPaymentCents(activationPaymentRows),
      client_activation_transactions: activationPaymentRows.length,
      registered_clients: registeredClientCount,
      activated_clients: activatedClientCount,
      free_clients: Math.max(registeredClientCount - activatedClientCount, 0),
      activation_conversion_rate: registeredClientCount ? Math.round((activatedClientCount / registeredClientCount) * 100) : 0
    },
    revenue_events: latestActivationPayments.map((payment) => ({
      date: payment.created_at,
      email: payment.admin_email,
      type: 'client_activation',
      amount: Number(payment.details.amount_cents || 0) / 100,
      currency: payment.details.currency || 'eur',
      status: payment.details.status || 'paid',
      provider: 'stripe',
      stripe_session_id: payment.target_id
    })),
    top_cities: topCounts(profileRows, 'city'),
    top_categories: topCounts(profileRows, 'category'),
    top_profiles: profileRows
      .filter((profile) => profile.status === 'active')
      .slice(0, 8)
      .map((profile) => ({
        id: profile.id,
        display_name: profile.display_name,
        city: profile.city,
        category: profile.category,
        available_now: profile.available_now,
        created_at: profile.created_at
      })),
    latest_activity: [...latestActivationPayments, ...(activity.data || [])]
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .slice(0, 12)
  });
}));

adminRouter.get('/client-activation-payments', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('client_activation_payments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ client_activation_payments: data || [] });
}));

adminRouter.get('/audit-log', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ audit_log: data || [] });
}));

adminRouter.get('/activity-logs', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('admin_activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ activity_logs: data || [] });
}));

adminRouter.get('/revenue', asyncHandler(async (_req, res) => {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);

  const [activationPayments, subscriptions] = await Promise.all([
    supabaseAdmin.from('client_activation_payments').select('*').order('created_at', { ascending: false }).limit(1000),
    supabaseAdmin.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(1000)
  ]);

  if (activationPayments.error) return res.status(500).json({ error: activationPayments.error.message });
  if (subscriptions.error) return res.status(500).json({ error: subscriptions.error.message });

  const activationRows = activationPayments.data || [];
  const subscriptionRows = subscriptions.data || [];
  const paidActivationRows = activationRows.filter((payment) => ['paid', 'succeeded', 'active', 'test'].includes(String(payment.status || '')));
  const activeSubscriptionRows = subscriptionRows.filter((row) => ['active', 'trial', 'test'].includes(String(row.status || '')));
  const paymentRows = [
    ...activationRows.map((payment) => ({
      id: payment.id,
      email: payment.email,
      profile: 'Client activation',
      amount: Number(payment.amount_cents || 0) / 100,
      currency: String(payment.currency || 'eur').toUpperCase(),
      provider: payment.provider || 'stripe',
      status: payment.status || 'paid',
      created_at: payment.created_at,
      type: 'client_activation'
    })),
    ...subscriptionRows.map((subscription) => ({
      id: subscription.id,
      email: subscription.email,
      profile: subscription.profile_display_name || subscription.profile_id,
      amount: Number(subscription.amount_eur || 0),
      currency: subscription.currency || 'EUR',
      provider: subscription.provider || 'manual_admin',
      status: subscription.status,
      created_at: subscription.created_at || subscription.requested_at,
      type: 'subscription'
    }))
  ].sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());

  const dailyRevenue = paymentRows
    .filter((row) => row.status !== 'failed' && row.created_at && new Date(row.created_at) >= dayStart)
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const monthlyRevenue = paymentRows
    .filter((row) => row.status !== 'failed' && row.created_at && new Date(row.created_at) >= monthStart)
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  res.json({
    stats: {
      today_revenue: Number(dailyRevenue.toFixed(2)),
      monthly_revenue: Number(monthlyRevenue.toFixed(2)),
      client_activations: paidActivationRows.length,
      escort_subscriptions: activeSubscriptionRows.filter((row) => ['escort', 'private_escort', 'private'].includes(String(row.role || ''))).length,
      business_subscriptions: activeSubscriptionRows.filter((row) => ['business', 'agency', 'club', 'massage_salon', 'live_cam'].includes(String(row.role || ''))).length,
      expired_subscriptions: subscriptionRows.filter((row) => row.status === 'expired').length,
      upcoming_renewals: subscriptionRows.filter((row) => row.current_period_end && new Date(row.current_period_end).getTime() > Date.now()).length
    },
    payments: paymentRows
  });
}));

adminRouter.get('/profiles', asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  let query = supabaseAdmin
    .from('profiles')
    .select('*, profile_images(*)')
    .order('admin_priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300);

  if (phone) {
    query = query.or(`primary_phone.eq.${phone},additional_phones.cs.{${phone}}`);
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  const ownerIds = [...new Set((data || []).map((profile) => profile.user_id).filter(Boolean))];
  const ownerEmailById = new Map<string, string>();
  if (ownerIds.length) {
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    (users.users || []).forEach((user) => {
      if (ownerIds.includes(user.id)) ownerEmailById.set(user.id, user.email || '');
    });
  }

  const rows = (data || []).map((profile) => withAdminImageUrls({
    ...profile,
    owner_email: profile.owner_email || (profile.user_id ? ownerEmailById.get(profile.user_id) || null : null)
  }));
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

adminRouter.get('/moderation', asyncHandler(async (_req, res) => {
  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('*, profile_images(*), reports(id, admin_status)')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  const rows = (profiles || []).map((profile) => {
    const reports = profile.reports || [];
    return withAdminImageUrls({
      ...profile,
      report_count: reports.length,
      open_report_count: reports.filter((report: any) => ['open', 'investigating'].includes(String(report.admin_status || 'open'))).length
    });
  });

  res.json({
    queues: {
      pending: rows.filter((profile) => profile.moderation_status === 'pending'),
      reported: rows.filter((profile) => Number(profile.open_report_count || 0) > 0),
      suspended: rows.filter((profile) => profile.status === 'suspended' || profile.moderation_status === 'suspended'),
      rejected: rows.filter((profile) => profile.status === 'rejected' || profile.moderation_status === 'rejected')
    },
    profiles: rows
  });
}));

adminRouter.post('/profiles', asyncHandler(async (req, res) => {
  const profileData = normalizeAdminProfilePayload(req.body);
  if ('error' in profileData) return res.status(400).json({ error: profileData.error });

  const payload = {
    ...profileData.data,
    slug: `${slugify(String(profileData.data.display_name))}-${Date.now().toString(36)}`,
    subscription_status: profileData.data.subscription_status || 'trial',
    verification_status: profileData.data.verified ? 'verified' : 'pending',
    moderation_status: profileData.data.moderation_status || 'pending',
    verified_at: profileData.data.verified ? new Date().toISOString() : null,
    location_updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .insert(payload)
    .select('*, profile_images(*)')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await upsertManualSubscription(data, req.user?.email || req.user?.id || null);
  await logAdminAction(req.user?.email, 'profile_studio_created', 'profile', data.id, payload);
  res.status(201).json({ profile: withAdminImageUrls(data) });
}));

adminRouter.post('/profiles/seed/berlin', asyncHandler(async (req, res) => {
  const { data: existingSeeds } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('city', 'berlin')
    .eq('is_seed_profile', true)
    .limit(60);

  if ((existingSeeds || []).length >= 24) {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('*, profile_images(*)')
      .eq('city', 'berlin')
      .eq('is_seed_profile', true)
      .order('admin_priority', { ascending: false })
      .limit(60);
    return res.json({ created: 0, profiles: (data || []).map(withAdminImageUrls) });
  }

  const profiles = await createBerlinSeedProfiles();
  await logAdminAction(req.user?.email, 'berlin_seed_profiles_generated', 'profile_seed', null, { count: profiles.length });
  res.status(201).json({ created: profiles.length, profiles });
}));

adminRouter.get('/business-profiles', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*, profile_images(*)')
    .in('account_type', ['agency', 'massage_salon', 'club_party', 'live_cam'])
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ business_profiles: data || [] });
}));

adminRouter.get('/users', asyncHandler(async (_req, res) => {
  const [{ data: authUsers, error: authError }, { data: profiles }, { data: wallets }, { data: activations }, { data: clientProfiles }] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabaseAdmin.from('profiles').select('id, user_id, account_type, public_user_id, referral_code, is_test_account, status, created_at').limit(2000),
    supabaseAdmin.from('wallets').select('*').limit(2000),
    supabaseAdmin.from('client_activations').select('user_id, state, activated_at').limit(2000),
    supabaseAdmin.from('client_profiles').select('user_id, avatar_url').limit(2000)
  ]);

  if (authError) return res.status(500).json({ error: authError.message });

  const profileRows = profiles || [];
  const walletRows = wallets || [];
  const activationRows = activations || [];
  const clientProfileRows = clientProfiles || [];
  const users = (authUsers.users || []).map((user) => {
    const userProfiles = profileRows.filter((profile) => profile.user_id === user.id);
    const wallet = walletRows.find((row) => row.user_id === user.id);
    const activation = activationRows.find((row) => row.user_id === user.id);
    const clientProfile = clientProfileRows.find((row) => row.user_id === user.id);
    const primaryProfile = userProfiles[0];
    return {
      id: user.id,
      email: user.email,
      role: user.app_metadata?.role || 'user',
      account_type: primaryProfile?.account_type || user.app_metadata?.auth_account_type || 'private',
      public_user_id: primaryProfile?.public_user_id || null,
      referral_code: primaryProfile?.referral_code || null,
      token_balance: Number(wallet?.escort_token_balance || 0),
      wallet_id: wallet?.id || null,
      wallet_frozen: Boolean(wallet?.frozen),
      client_state: activation?.state || user.app_metadata?.client_state || user.app_metadata?.client_activation_state || 'client_free',
      client_activated_at: activation?.activated_at || null,
      avatar_url: clientProfile?.avatar_url || null,
      profile_count: userProfiles.length,
      is_test_account: userProfiles.some((profile) => profile.is_test_account) || String(user.email || '').includes('+test'),
      created_at: user.created_at,
      status: user.banned_until ? 'suspended' : 'active'
    };
  });

  res.json({ users });
}));

adminRouter.get('/users/:id', asyncHandler(async (req, res) => {
  const [{ data: authUser, error: authError }, { data: profiles }, { data: wallet }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(req.params.id),
    supabaseAdmin.from('profiles').select('*, profile_images(*)').eq('user_id', req.params.id).limit(20),
    supabaseAdmin.from('wallets').select('*').eq('user_id', req.params.id).maybeSingle()
  ]);

  if (authError || !authUser.user) return res.status(404).json({ error: authError?.message || 'User not found' });

  res.json({
    user: {
      id: authUser.user.id,
      email: authUser.user.email,
      app_metadata: authUser.user.app_metadata,
      created_at: authUser.user.created_at,
      banned_until: authUser.user.banned_until,
      status: authUser.user.banned_until ? 'suspended' : 'active'
    },
    profiles: profiles || [],
    wallet: wallet || null
  });
}));

adminRouter.patch('/users/:id', asyncHandler(async (req, res) => {
  const patch: Record<string, unknown> = {};
  const email = optionalText(req.body.email, 320);
  const password = optionalText(req.body.password, 200);
  const phone = optionalText(req.body.phone, 80);

  if (email) patch.email = email;
  if (password) patch.password = password;
  if (phone) patch.phone = phone;
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'No valid user fields provided' });

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, patch);
  if (error) return res.status(400).json({ error: error.message });

  await logAdminAction(req.user?.email, 'user_updated', 'auth_user', req.params.id, patch);
  res.json({ user: data.user });
}));

adminRouter.patch('/users/:id/role', asyncHandler(async (req, res) => {
  const role = String(req.body.role || '').trim();
  if (!['client', 'escort', 'business', 'moderator', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const { data: existing, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
  if (fetchError || !existing.user) return res.status(404).json({ error: fetchError?.message || 'User not found' });

  const appMetadata: Record<string, unknown> = {
    ...existing.user.app_metadata,
    role,
    admin: role === 'admin'
  };

  if (['client', 'escort', 'business'].includes(role)) {
    appMetadata.auth_account_type = role;
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, { app_metadata: appMetadata });
  if (error) return res.status(400).json({ error: error.message });

  await logAdminAction(req.user?.email, 'user_role_updated', 'auth_user', req.params.id, { role });
  res.json({ user: data.user });
}));

adminRouter.patch('/users/:id/suspend', asyncHandler(async (req, res) => {
  const suspended = req.body.suspended !== false;
  const banDuration = suspended ? optionalText(req.body.ban_duration, 40) || '876000h' : 'none';
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, { ban_duration: banDuration });
  if (error) return res.status(400).json({ error: error.message });

  await logAdminAction(req.user?.email, suspended ? 'user_suspended' : 'user_unsuspended', 'auth_user', req.params.id, {
    suspended,
    ban_duration: banDuration,
    reason: optionalText(req.body.reason, 1000)
  });
  res.json({ user: data.user });
}));

adminRouter.get('/subscriptions', asyncHandler(async (_req, res) => {
  const [profilesResult, subscriptionsResult, activationPaymentsResult, usersResult] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, user_id, owner_email, display_name, city, account_type, profile_type, category, listing_plan, listing_price, listing_currency, currency, subscription_status, subscription_started_at, subscription_expires_at, subscription_plan, subscription_start, subscription_end, subscription_requested_at, subscription_managed_by, subscription_note, is_test_account, premium_tier, created_at')
      .order('created_at', { ascending: false })
      .limit(800),
    supabaseAdmin
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabaseAdmin
      .from('client_activation_payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(800),
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ]);

  if (profilesResult.error) return res.status(500).json({ error: profilesResult.error.message });
  if (subscriptionsResult.error) return res.status(500).json({ error: subscriptionsResult.error.message });
  if (activationPaymentsResult.error) return res.status(500).json({ error: activationPaymentsResult.error.message });

  const emailById = new Map<string, string>();
  (usersResult.data?.users || []).forEach((user) => emailById.set(user.id, user.email || ''));
  const subscriptionByProfileId = new Map<string, any>();
  (subscriptionsResult.data || []).forEach((subscription) => {
    if (subscription.profile_id) subscriptionByProfileId.set(subscription.profile_id, subscription);
  });
  const now = Date.now();
  const profileRows = (profilesResult.data || []).map((profile) => {
    const subscription = subscriptionByProfileId.get(profile.id);
    const start = subscription?.current_period_start || profile.subscription_start || profile.subscription_started_at || null;
    const end = subscription?.current_period_end || profile.subscription_end || profile.subscription_expires_at || null;
    const status = String(subscription?.status || profile.subscription_status || 'free');
    return {
      id: subscription?.id || profile.id,
      type: 'profile_subscription',
      email: subscription?.email || profile.owner_email || (profile.user_id ? emailById.get(profile.user_id) || null : null),
      user_id: profile.user_id,
      profile_id: profile.id,
      profile: subscription?.profile_display_name || profile.display_name,
      city: profile.city,
      plan: subscription?.plan || profile.subscription_plan || profile.listing_plan || 'escort_monthly',
      role: subscription?.role || profile.profile_type || profile.account_type || 'escort',
      status,
      requested_at: profile.subscription_requested_at || profile.created_at,
      start,
      end,
      subscription_start: profile.subscription_start || profile.subscription_started_at || null,
      subscription_end: profile.subscription_end || profile.subscription_expires_at || null,
      current_period_start: subscription?.current_period_start || null,
      current_period_end: subscription?.current_period_end || null,
      progress: subscriptionProgress(start, end),
      payment_provider: subscription?.provider || (status === 'test' ? 'manual_admin' : 'manual'),
      amount_eur: Number(subscription?.amount_eur ?? profile.listing_price ?? 49.99),
      currency: subscription?.currency || profile.currency || profile.listing_currency || 'EUR',
      premium_tier: profile.premium_tier || 'standard',
      note: subscription?.admin_note || profile.subscription_note || null
    };
  });

  const clientActivationRows = (activationPaymentsResult.data || []).map((payment) => ({
    id: payment.id,
    type: 'client_activation',
    email: payment.email,
    user_id: payment.user_id,
    profile_id: null,
    profile: 'Client activation 0.99 EUR',
    plan: 'client_activation_099',
    role: 'client',
    status: payment.status || 'paid',
    requested_at: payment.created_at,
    start: payment.paid_at || payment.created_at,
    end: null,
    progress: payment.status === 'paid' ? 100 : 0,
    payment_provider: payment.provider || 'stripe',
    amount_eur: Number(payment.amount_cents || 0) / 100,
    currency: String(payment.currency || 'eur').toUpperCase(),
    stripe_session_id: payment.stripe_session_id
  }));

  const subscriptions = [...profileRows, ...clientActivationRows].sort((left, right) => new Date(right.requested_at || 0).getTime() - new Date(left.requested_at || 0).getTime());
  const profileSubscriptions = profileRows;

  res.json({
    subscriptions,
    stats: {
      requested: profileSubscriptions.filter((row) => ['free', 'trial', 'pending', 'requested'].includes(row.status)).length,
      trial: profileSubscriptions.filter((row) => row.status === 'trial').length,
      future: profileSubscriptions.filter((row) => row.start && new Date(row.start).getTime() > now).length,
      active: profileSubscriptions.filter((row) => row.status === 'active' && (!row.end || new Date(row.end).getTime() > now)).length,
      expired: profileSubscriptions.filter((row) => row.status === 'expired' || Boolean(row.end && new Date(row.end).getTime() <= now)).length,
      suspended: profileSubscriptions.filter((row) => row.status === 'suspended').length,
      incomplete: profileSubscriptions.filter((row) => ['past_due', 'incomplete', 'cancelled'].includes(row.status)).length,
      monthly_revenue: profileSubscriptions.filter((row) => row.status === 'active').reduce((sum, row) => sum + Number(row.amount_eur || 0), 0),
      client_activations_099: clientActivationRows.filter((row) => row.status === 'paid').length,
      escort_subscriptions: profileSubscriptions.filter((row) => ['escort', 'private', 'private_escort'].includes(String(row.role))).length,
      business_subscriptions: profileSubscriptions.filter((row) => ['business', 'agency', 'club', 'massage_salon', 'live_cam'].includes(String(row.role))).length
    }
  });
}));

adminRouter.patch('/subscriptions/:id', asyncHandler(async (req, res) => {
  const status = String(req.body.subscription_status || req.body.status || '');
  if (!['free', 'requested', 'trial', 'active', 'past_due', 'incomplete', 'cancelled', 'canceled', 'expired', 'suspended', 'test'].includes(status)) return res.status(400).json({ error: 'Invalid subscription status' });

  const patch = {
    subscription_status: status,
    listing_plan: optionalText(req.body.listing_plan || req.body.plan, 80),
    plan: optionalText(req.body.plan || req.body.listing_plan, 80),
    subscription_started_at: optionalText(req.body.subscription_started_at, 80),
    subscription_expires_at: optionalText(req.body.subscription_expires_at, 80),
    admin_note: optionalText(req.body.admin_note, 4000),
    subscription_note: optionalText(req.body.admin_note || req.body.subscription_note, 4000)
  };

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await upsertManualSubscription(data, req.user?.email || req.user?.id || null);
  await logAdminAction(req.user?.email, 'subscription_updated', 'profile_subscription', req.params.id, patch);
  res.json({ subscription: data });
}));

adminRouter.post('/subscriptions/:id/activate', asyncHandler(async (req, res) => {
  const days = Number(req.body.days || 30);
  const start = parseAdminDate(req.body.start || req.body.subscription_start) || new Date();
  const end = parseAdminDate(req.body.end || req.body.subscription_end) || new Date(start.getTime() + Math.max(1, Math.min(days, 365)) * 24 * 60 * 60 * 1000);
  const plan = optionalText(req.body.plan || req.body.subscription_plan, 80) || 'escort_monthly';
  const patch = subscriptionPatch({
    status: 'active',
    plan,
    start,
    end,
    managedBy: req.user?.email || req.user?.id,
    note: optionalText(req.body.note || req.body.subscription_note, 2000)
  });
  const profile = await updateProfileSubscription(req.params.id, patch);
  await logAdminAction(req.user?.email, 'subscription_activated_manually', 'profile', req.params.id, patch);
  res.json({ subscription: profile });
}));

adminRouter.post('/subscriptions/:id/extend', asyncHandler(async (req, res) => {
  const days = Number(req.body.days || 30);
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('subscription_expires_at, subscription_end')
    .eq('id', req.params.id)
    .single();
  if (fetchError || !existing) return res.status(404).json({ error: fetchError?.message || 'Subscription not found' });

  const base = new Date(existing.subscription_end || existing.subscription_expires_at || Date.now());
  const startBase = base.getTime() > Date.now() ? base : new Date();
  const end = new Date(startBase.getTime() + Math.max(1, Math.min(days, 365)) * 24 * 60 * 60 * 1000);
  const patch = subscriptionPatch({
    status: 'active',
    end,
    managedBy: req.user?.email || req.user?.id,
    note: optionalText(req.body.note, 2000)
  });
  const profile = await updateProfileSubscription(req.params.id, patch);
  await logAdminAction(req.user?.email, 'subscription_extended', 'profile', req.params.id, { days, ...patch });
  res.json({ subscription: profile });
}));

adminRouter.post('/subscriptions/:id/set-dates', asyncHandler(async (req, res) => {
  console.info('[admin subscriptions set-dates]', {
    id: req.params.id,
    start: req.body.start || req.body.subscription_start || null,
    end: req.body.end || req.body.subscription_end || null,
    status: req.body.status || req.body.subscription_status || null
  });
  const start = parseAdminDate(req.body.start || req.body.subscription_start);
  const end = parseAdminDate(req.body.end || req.body.subscription_end);
  const status = normalizeAdminSubscriptionStatus(req.body.status || req.body.subscription_status || 'active');
  if (!start || !end) {
    console.info('[admin subscriptions set-dates] error reason=invalid_dates');
    return res.status(400).json({ error: 'Valid start and end dates are required' });
  }
  if (end.getTime() <= start.getTime()) {
    console.info('[admin subscriptions set-dates] error reason=end_before_start');
    return res.status(400).json({ error: 'End date must be after start date' });
  }

  const note = optionalText(req.body.note || req.body.admin_note || req.body.subscription_note, 2000);
  const { data: existingSubscription } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .or(`id.eq.${req.params.id},profile_id.eq.${req.params.id}`)
    .maybeSingle();
  const profileId = existingSubscription?.profile_id || req.params.id;
  const patch = subscriptionPatch({
    status,
    start,
    end,
    managedBy: req.user?.email || req.user?.id,
    note
  });

  const profile = await updateProfileSubscription(profileId, patch);
  const subscriptionPatchRow = {
    user_id: profile.user_id || existingSubscription?.user_id || null,
    profile_id: profile.id,
    email: profile.owner_email || existingSubscription?.email || null,
    profile_display_name: profile.display_name || existingSubscription?.profile_display_name || null,
    role: profile.profile_type || profile.account_type || profile.category || existingSubscription?.role || 'escort',
    plan: profile.subscription_plan || profile.listing_plan || existingSubscription?.plan || 'escort_monthly',
    status,
    provider: existingSubscription?.provider || 'manual_admin',
    amount_eur: Number(existingSubscription?.amount_eur ?? profile.listing_price ?? 49.99),
    currency: existingSubscription?.currency || profile.currency || profile.listing_currency || 'EUR',
    current_period_start: start.toISOString(),
    current_period_end: end.toISOString(),
    managed_by: req.user?.email || req.user?.id || existingSubscription?.managed_by || null,
    admin_note: note,
    metadata: {
      ...(existingSubscription?.metadata || {}),
      source: 'admin_set_dates',
      updated_by: req.user?.email || req.user?.id || null
    }
  };
  const { data: subscription, error: subscriptionError } = await supabaseAdmin
    .from('subscriptions')
    .upsert(subscriptionPatchRow, { onConflict: 'profile_id' })
    .select()
    .single();
  if (subscriptionError) {
    console.info('[admin subscriptions set-dates] error reason=', subscriptionError.message);
    return res.status(400).json({ error: subscriptionError.message });
  }

  await logAdminAction(req.user?.email, 'subscription_dates_set', 'profile_subscription', profile.id, {
    ...patch,
    note
  });
  console.info('[admin subscriptions set-dates] success', {
    id: subscription.id,
    profile_id: subscription.profile_id,
    start: subscription.current_period_start,
    end: subscription.current_period_end,
    status: subscription.status
  });
  res.json({ subscription });
}));

adminRouter.post('/subscriptions/:id/expire', asyncHandler(async (req, res) => {
  const patch = subscriptionPatch({
    status: 'expired',
    end: new Date(),
    managedBy: req.user?.email || req.user?.id,
    note: optionalText(req.body.note, 2000)
  });
  const profile = await updateProfileSubscription(req.params.id, patch);
  await logAdminAction(req.user?.email, 'subscription_expired', 'profile', req.params.id, patch);
  res.json({ subscription: profile });
}));

adminRouter.post('/subscriptions/:id/cancel', asyncHandler(async (req, res) => {
  const patch = subscriptionPatch({
    status: 'cancelled',
    end: new Date(),
    managedBy: req.user?.email || req.user?.id,
    note: optionalText(req.body.note, 2000)
  });
  const profile = await updateProfileSubscription(req.params.id, patch);
  await logAdminAction(req.user?.email, 'subscription_cancelled', 'profile', req.params.id, patch);
  res.json({ subscription: profile });
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

adminRouter.put('/profiles/:id', asyncHandler(async (req, res) => {
  const profileData = normalizeAdminProfilePayload(req.body);
  if ('error' in profileData) return res.status(400).json({ error: profileData.error });

  const patch = {
    ...profileData.data,
    verification_status: profileData.data.verified ? 'verified' : 'pending',
    verified_at: profileData.data.verified ? new Date().toISOString() : null,
    location_updated_at: new Date().toISOString()
  };
  if (!Object.prototype.hasOwnProperty.call(req.body, 'services')) {
    delete (patch as Record<string, unknown>).services;
    delete (patch as Record<string, unknown>).service_menu;
  }
  if (!Object.prototype.hasOwnProperty.call(req.body, 'status')) delete (patch as Record<string, unknown>).status;
  if (!Object.prototype.hasOwnProperty.call(req.body, 'moderation_status')) delete (patch as Record<string, unknown>).moderation_status;

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(patch)
    .eq('id', req.params.id)
    .select('*, profile_images(*)')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await upsertManualSubscription(data, req.user?.email || req.user?.id || null);
  await logAdminAction(req.user?.email, 'profile_studio_updated', 'profile', req.params.id, patch);
  res.json({ profile: withAdminImageUrls(data) });
}));

adminRouter.patch('/profiles/:id/publish', asyncHandler(async (req, res) => {
  const isPublished = req.body.is_published !== false && req.body.published !== false;
  const patch: Record<string, unknown> = {
    is_published: isPublished,
    status: isPublished ? 'active' : 'active'
  };
  if (isPublished) {
    patch.moderation_status = 'approved';
    patch.reviewed_by = req.user?.email || req.user?.id || null;
    patch.reviewed_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(patch)
    .eq('id', req.params.id)
    .select('*, profile_images(*)')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, isPublished ? 'profile_published' : 'profile_unpublished', 'profile', req.params.id, patch);
  res.json({ profile: withAdminImageUrls(data) });
}));

adminRouter.post('/profiles/:id/images', adminUpload.single('image'), asyncHandler(async (req, res) => {
  logAdminProfileImageUpload('start', req, { profile_id: req.params.id, file_mime: req.file?.mimetype || null, file_size: req.file?.size || null });
  if (!req.file) {
    logAdminProfileImageUpload('error', req, { profile_id: req.params.id, reason: 'missing_file' });
    return res.status(400).json({ error: 'image file is required' });
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
    logAdminProfileImageUpload('error', req, { profile_id: req.params.id, reason: 'unsupported_mime_type', file_mime: req.file.mimetype, file_size: req.file.size });
    return res.status(415).json({ error: 'Unsupported image format. Use JPG, PNG, or WEBP.' });
  }

  const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('id', req.params.id).single();
  if (!profile) {
    logAdminProfileImageUpload('error', req, { profile_id: req.params.id, reason: 'profile_not_found' });
    return res.status(404).json({ error: 'Profile not found' });
  }

  const processed = await sharp(req.file.buffer)
    .rotate()
    .resize({ width: 1600, height: 2200, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();

  const storagePath = `admin-profiles/${req.params.id}/${crypto.randomUUID()}.jpg`;
  const uploadResult = await supabaseAdmin.storage
    .from(config.storageBucket)
    .upload(storagePath, processed, { contentType: 'image/jpeg' });

  if (uploadResult.error) {
    logAdminProfileImageUpload('error', req, { profile_id: req.params.id, reason: uploadResult.error.message, file_mime: req.file.mimetype, file_size: req.file.size });
    return res.status(400).json({ error: uploadResult.error.message });
  }

  const { count } = await supabaseAdmin
    .from('profile_images')
    .select('id', { count: 'exact' })
    .eq('profile_id', req.params.id);

  const { data, error } = await supabaseAdmin
    .from('profile_images')
    .insert({
      profile_id: req.params.id,
      storage_path: storagePath,
      is_primary: (count || 0) === 0 || req.body.is_cover === 'true',
      moderation_status: 'approved',
      sort_order: count || 0
    })
    .select()
    .single();

  if (error) {
    logAdminProfileImageUpload('error', req, { profile_id: req.params.id, reason: error.message, file_mime: req.file.mimetype, file_size: req.file.size });
    return res.status(400).json({ error: error.message });
  }
  if (data.is_primary) await supabaseAdmin.from('profile_images').update({ is_primary: false }).eq('profile_id', req.params.id).neq('id', data.id);

  const image = withPublicImageUrl(data);
  logAdminProfileImageUpload('success', req, { profile_id: req.params.id, image_id: data.id, file_mime: req.file.mimetype, file_size: req.file.size });
  await logAdminAction(req.user?.email, 'profile_image_uploaded_by_admin', 'profile_image', data.id, { profile_id: req.params.id });
  res.status(201).json({ image });
}));

adminRouter.post('/profiles/bulk', asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body.profile_ids)
    ? req.body.profile_ids.map((id: unknown) => String(id)).filter(Boolean).slice(0, 200)
    : [];
  const operation = String(req.body.operation || req.body.action || '');
  if (!ids.length) return res.status(400).json({ error: 'profile_ids are required' });

  const patch: Record<string, unknown> = {};
  if (operation === 'approve') {
    patch.moderation_status = 'approved';
    patch.status = 'active';
    patch.reviewed_by = req.user?.email || req.user?.id || null;
    patch.reviewed_at = new Date().toISOString();
  } else if (operation === 'publish') {
    patch.is_published = true;
  } else if (operation === 'unpublish') {
    patch.is_published = false;
  } else if (operation === 'suspend') {
    patch.status = 'suspended';
    patch.moderation_status = 'suspended';
    patch.suspended_at = new Date().toISOString();
    patch.suspended_reason = optionalText(req.body.note || req.body.reason, 1000);
  } else if (operation === 'premium_tier') {
    const tier = String(req.body.premium_tier || '');
    if (!premiumTiers.includes(tier)) return res.status(400).json({ error: 'Invalid premium tier' });
    patch.premium_tier = tier;
  } else if (operation === 'subscription_status') {
    const status = normalizeAdminSubscriptionStatus(req.body.subscription_status);
    patch.subscription_status = status;
    patch.subscription_managed_by = req.user?.email || req.user?.id || null;
    patch.subscription_note = optionalText(req.body.note, 2000);
  } else if (operation === 'delete') {
    const { data: images } = await supabaseAdmin.from('profile_images').select('storage_path').in('profile_id', ids);
    const storagePaths = (images || []).map((image) => image.storage_path).filter(Boolean);
    if (storagePaths.length) await supabaseAdmin.storage.from(config.storageBucket).remove(storagePaths);
    const { error } = await supabaseAdmin.from('profiles').delete().in('id', ids);
    if (error) return res.status(400).json({ error: error.message });
    await logAdminAction(req.user?.email, 'profiles_bulk_deleted', 'profile', null, { profile_ids: ids, note: optionalText(req.body.note, 1000) });
    return res.json({ updated: ids.length, operation });
  } else {
    return res.status(400).json({ error: 'Invalid bulk operation' });
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(patch)
    .in('id', ids)
    .select('*, profile_images(*)');
  if (error) return res.status(400).json({ error: error.message });
  if (operation === 'subscription_status') {
    await Promise.all((data || []).map((profile) => upsertManualSubscription(profile, req.user?.email || req.user?.id || null)));
  }
  await logAdminAction(req.user?.email, `profiles_bulk_${operation}`, 'profile', null, { profile_ids: ids, ...patch });
  res.json({ updated: data?.length || 0, operation, profiles: (data || []).map(withAdminImageUrls) });
}));

adminRouter.patch('/profiles/:profileId/images/reorder', asyncHandler(async (req, res) => {
  const imageIds: string[] = Array.isArray(req.body.image_ids) ? req.body.image_ids.map((item: unknown) => String(item)).filter(Boolean) : [];
  if (!imageIds.length) return res.status(400).json({ error: 'image_ids are required' });

  await Promise.all(imageIds.map((id, index) => supabaseAdmin.from('profile_images').update({ sort_order: index }).eq('id', id).eq('profile_id', req.params.profileId)));
  const { data, error } = await supabaseAdmin
    .from('profile_images')
    .select('*')
    .eq('profile_id', req.params.profileId)
    .order('sort_order', { ascending: true });

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'profile_images_reordered', 'profile', req.params.profileId, { image_ids: imageIds });
  res.json({ images: (data || []).map(withPublicImageUrl) });
}));

adminRouter.patch('/profiles/:profileId/images/:imageId', asyncHandler(async (req, res) => {
  const patch: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(req.body, 'is_hidden')) patch.is_hidden = Boolean(req.body.is_hidden);
  if (Object.prototype.hasOwnProperty.call(req.body, 'is_private')) patch.is_private = Boolean(req.body.is_private);
  if (Object.prototype.hasOwnProperty.call(req.body, 'sort_order')) patch.sort_order = optionalInteger(req.body.sort_order, 0, 10000);
  if (Object.prototype.hasOwnProperty.call(req.body, 'admin_note')) patch.admin_note = optionalText(req.body.admin_note, 1000);
  if (req.body.moderation_status || req.body.status) {
    const status = String(req.body.moderation_status || req.body.status);
    if (!['pending', 'approved', 'rejected', 'blocked'].includes(status)) return res.status(400).json({ error: 'Invalid photo status' });
    patch.moderation_status = status;
  }
  if (req.body.is_cover === true || req.body.is_primary === true) {
    await supabaseAdmin.from('profile_images').update({ is_primary: false }).eq('profile_id', req.params.profileId);
    patch.is_primary = true;
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'No valid image fields provided' });

  const { data, error } = await supabaseAdmin
    .from('profile_images')
    .update(patch)
    .eq('id', req.params.imageId)
    .eq('profile_id', req.params.profileId)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'profile_image_updated_by_admin', 'profile_image', req.params.imageId, { profile_id: req.params.profileId, ...patch });
  res.json({ image: withPublicImageUrl(data) });
}));

adminRouter.patch('/profiles/:profileId/images/:imageId/cover', asyncHandler(async (req, res) => {
  await supabaseAdmin.from('profile_images').update({ is_primary: false }).eq('profile_id', req.params.profileId);
  const { data, error } = await supabaseAdmin
    .from('profile_images')
    .update({ is_primary: true })
    .eq('id', req.params.imageId)
    .eq('profile_id', req.params.profileId)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'profile_cover_set_by_admin', 'profile_image', req.params.imageId, { profile_id: req.params.profileId });
  res.json({ image: withPublicImageUrl(data) });
}));

adminRouter.delete('/profiles/:profileId/images/:imageId', asyncHandler(async (req, res) => {
  const { data: image, error: fetchError } = await supabaseAdmin
    .from('profile_images')
    .select('*')
    .eq('id', req.params.imageId)
    .eq('profile_id', req.params.profileId)
    .single();

  if (fetchError || !image) return res.status(404).json({ error: fetchError?.message || 'Image not found' });

  if (image.storage_path) await supabaseAdmin.storage.from(config.storageBucket).remove([image.storage_path]);
  const { error } = await supabaseAdmin.from('profile_images').delete().eq('id', req.params.imageId);
  if (error) return res.status(400).json({ error: error.message });

  const { data: remaining } = await supabaseAdmin
    .from('profile_images')
    .select('*')
    .eq('profile_id', req.params.profileId)
    .order('sort_order', { ascending: true })
    .limit(1);
  if (image.is_primary && remaining?.[0]) {
    await supabaseAdmin.from('profile_images').update({ is_primary: true }).eq('id', remaining[0].id);
  }

  await logAdminAction(req.user?.email, 'profile_image_deleted_by_admin', 'profile_image', req.params.imageId, { profile_id: req.params.profileId });
  res.status(204).send();
}));

adminRouter.get('/profiles/:id', asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*, profile_images(*)')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: error.message });
  res.json({ profile: withAdminImageUrls(data) });
}));

adminRouter.patch('/profiles/:id/status', asyncHandler(async (req, res) => {
  const status = String(req.body.status || '');
  if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const patch: Record<string, unknown> = { status };
  if (status === 'suspended') {
    patch.moderation_status = 'suspended';
    patch.suspended_at = new Date().toISOString();
    patch.suspended_reason = optionalText(req.body.suspended_reason || req.body.reason, 1000);
  }
  if (status === 'active') {
    patch.moderation_status = 'approved';
    patch.is_published = true;
    patch.reviewed_by = req.user?.email || req.user?.id || null;
    patch.reviewed_at = new Date().toISOString();
  }

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
    patch.moderation_note = optionalText(req.body.moderation_note || req.body.note, 2000);
    patch.reviewed_by = req.user?.email || req.user?.id || null;
    patch.reviewed_at = new Date().toISOString();
    if (moderationStatus === 'suspended') {
      patch.suspended_at = new Date().toISOString();
      patch.suspended_reason = optionalText(req.body.suspended_reason || req.body.reason, 1000);
    }
    if (moderationStatus === 'rejected') patch.blocked_at = new Date().toISOString();
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

adminRouter.patch('/profiles/:id/moderation', asyncHandler(async (req, res) => {
  const moderationStatus = String(req.body.moderation_status || req.body.status || '');
  if (!allowedModerationStatuses.includes(moderationStatus)) return res.status(400).json({ error: 'Invalid moderation status' });
  const patch: Record<string, unknown> = {
    moderation_status: moderationStatus,
    moderation_note: optionalText(req.body.moderation_note || req.body.note, 2000),
    reviewed_by: req.user?.email || req.user?.id || null,
    reviewed_at: new Date().toISOString()
  };
  if (moderationStatus === 'approved') {
    patch.status = 'active';
    patch.is_published = req.body.is_published === undefined ? true : req.body.is_published !== false;
  }
  if (moderationStatus === 'suspended') {
    patch.status = 'suspended';
    patch.suspended_at = new Date().toISOString();
    patch.suspended_reason = optionalText(req.body.suspended_reason || req.body.reason, 1000);
  }
  if (moderationStatus === 'rejected') {
    patch.status = 'rejected';
    patch.is_published = false;
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(patch)
    .eq('id', req.params.id)
    .select('*, profile_images(*)')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'profile_moderation_updated', 'profile', req.params.id, patch);
  res.json({ profile: withAdminImageUrls(data) });
}));

adminRouter.patch('/profiles/:id/verify', asyncHandler(async (req, res) => {
  const verificationStatus = String(req.body.verification_status || req.body.status || 'verified');
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
    patch.reviewed_by = req.user?.email || req.user?.id || null;
    patch.reviewed_at = new Date().toISOString();
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

adminRouter.delete('/profiles/:id', asyncHandler(async (req, res) => {
  const { data: images } = await supabaseAdmin
    .from('profile_images')
    .select('storage_path')
    .eq('profile_id', req.params.id);

  const storagePaths = (images || []).map((image) => image.storage_path).filter(Boolean);
  if (storagePaths.length) await supabaseAdmin.storage.from(config.storageBucket).remove(storagePaths);

  const { error } = await supabaseAdmin.from('profiles').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });

  await logAdminAction(req.user?.email, 'profile_deleted', 'profile', req.params.id, {
    hard_delete: true,
    reason: optionalText(req.body.reason, 1000)
  });
  res.status(204).send();
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

adminRouter.post('/reports', asyncHandler(async (req, res) => {
  const profileId = String(req.body.profile_id || '');
  const reason = optionalText(req.body.reason, 120);
  if (!profileId || !reason) return res.status(400).json({ error: 'profile_id and reason are required' });

  const payload = {
    profile_id: profileId,
    reporter_user_id: optionalText(req.body.reporter_user_id, 80),
    reporter_email: optionalText(req.body.reporter_email, 240),
    reason,
    message: optionalText(req.body.message, 4000),
    status: 'open',
    admin_status: 'open',
    admin_note: optionalText(req.body.admin_note, 4000)
  };

  const { data, error } = await supabaseAdmin
    .from('reports')
    .insert(payload)
    .select('*, profiles(display_name, city, status, moderation_status)')
    .single();
  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'report_created_by_admin', 'report', data.id, payload);
  res.status(201).json({ report: data });
}));

adminRouter.patch('/reports/:id/status', asyncHandler(async (req, res) => {
  const adminStatus = String(req.body.admin_status || req.body.status || '');
  if (!allowedAdminReportStatuses.includes(adminStatus)) return res.status(400).json({ error: 'Invalid report status' });

  const patch: Record<string, unknown> = {
    admin_status: adminStatus,
    status: reportPublicStatus(adminStatus),
    admin_note: optionalText(req.body.admin_note, 4000),
    escalated_to_authorities: Boolean(req.body.escalated_to_authorities)
  };
  if (adminStatus === 'resolved' || adminStatus === 'rejected') {
    patch.resolved_at = new Date().toISOString();
    patch.resolved_by = req.user?.email || req.user?.id || null;
  }

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

adminRouter.patch('/reports/:id', asyncHandler(async (req, res) => {
  const adminStatus = String(req.body.admin_status || req.body.status || '');
  if (adminStatus && !allowedAdminReportStatuses.includes(adminStatus)) return res.status(400).json({ error: 'Invalid report status' });

  const patch: Record<string, unknown> = {
    admin_note: optionalText(req.body.admin_note, 4000)
  };
  if (adminStatus) {
    patch.admin_status = adminStatus;
    patch.status = reportPublicStatus(adminStatus);
  }
  if (adminStatus === 'resolved' || adminStatus === 'rejected') {
    patch.resolved_at = new Date().toISOString();
    patch.resolved_by = req.user?.email || req.user?.id || null;
  }

  const { data, error } = await supabaseAdmin
    .from('reports')
    .update(patch)
    .eq('id', req.params.id)
    .select('*, profiles(display_name, city, status, moderation_status)')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  if (req.body.suspend_profile && data.profile_id) {
    await supabaseAdmin
      .from('profiles')
      .update({
        status: 'suspended',
        moderation_status: 'suspended',
        suspended_at: new Date().toISOString(),
        suspended_reason: optionalText(req.body.suspension_reason || req.body.admin_note, 1000)
      })
      .eq('id', data.profile_id);
  }
  await logAdminAction(req.user?.email, 'report_updated', 'report', req.params.id, { ...patch, suspend_profile: Boolean(req.body.suspend_profile) });
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

adminRouter.patch('/bookings/:id', asyncHandler(async (req, res) => {
  const status = String(req.body.status || '');
  if (!['pending', 'accepted', 'rejected', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid booking status' });
  }

  const patch = {
    status,
    message: optionalText(req.body.message, 2000),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseAdmin
    .from('booking_requests')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'booking_updated', 'booking_request', req.params.id, patch);
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

adminRouter.patch('/wallets/:userId', asyncHandler(async (req, res) => {
  const balance = Number(req.body.escort_token_balance ?? req.body.token_balance);
  const frozen = req.body.frozen === undefined ? undefined : Boolean(req.body.frozen);
  if (!Number.isFinite(balance) || balance < 0) return res.status(400).json({ error: 'Invalid token balance' });

  const { data: existing } = await supabaseAdmin
    .from('wallets')
    .select('*')
    .eq('user_id', req.params.userId)
    .maybeSingle();

  const patch = {
    escort_token_balance: balance,
    ...(frozen === undefined ? {} : { frozen })
  };

  const { data, error } = existing
    ? await supabaseAdmin.from('wallets').update(patch).eq('id', existing.id).select().single()
    : await supabaseAdmin
      .from('wallets')
      .insert({
        user_id: req.params.userId,
        public_wallet_id: `ERW-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        ...patch
      })
      .select()
      .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'wallet_adjusted', 'wallet', data.id, {
    user_id: req.params.userId,
    ...patch
  });
  res.json({ wallet: data });
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

adminRouter.get('/uploads', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profile_images')
    .select('*, profiles(display_name, city, user_id)')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ uploads: data || [] });
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

adminRouter.delete('/uploads/:id', asyncHandler(async (req, res) => {
  const { data: image, error: fetchError } = await supabaseAdmin
    .from('profile_images')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (fetchError || !image) return res.status(404).json({ error: fetchError?.message || 'Upload not found' });

  if (image.storage_path) await supabaseAdmin.storage.from(config.storageBucket).remove([image.storage_path]);
  const { error } = await supabaseAdmin.from('profile_images').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });

  await logAdminAction(req.user?.email, 'upload_deleted', 'profile_image', req.params.id, {
    profile_id: image.profile_id,
    storage_path: image.storage_path,
    reason: optionalText(req.body.reason, 1000)
  });
  res.status(204).send();
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
  await writeAdminAuditLog(adminEmail, action, targetType, targetId, details);
}

function normalizeAdminProfilePayload(body: Record<string, unknown>): { data: Record<string, unknown> } | { error: string } {
  const displayName = optionalText(body.display_name, 80);
  if (!displayName) return { error: 'display_name is required' };
  const ownerEmail = optionalEmail(body.owner_email || body.email);
  if (!ownerEmail) return { error: 'owner_email is required' };

  const city = String(body.city || 'berlin').trim().toLowerCase();
  if (!['berlin', 'hamburg', 'hannover', 'koeln', 'muenchen', 'warszawa'].includes(city)) return { error: 'Unsupported city' };

  const operatorStatus = normalizeAdminOperatorStatus(body.operator_status);
  const services = normalizeAdminServices(body.services);
  if ('error' in services) return services;
  const premiumTier = String(body.premium_tier || 'standard');
  const isPublished = body.is_published !== false;
  const age = optionalInteger(body.age, 18, 99);
  const height = optionalInteger(body.height_cm ?? body.height, 120, 230);
  const category = normalizeAdminCategory(body.category);
  const accountType = normalizeAdminAccountType(body.account_type);
  const profileType = normalizeAdminProfileType(body.profile_type);
  const subscriptionStatus = normalizeAdminSubscriptionStatus(body.subscription_status);
  const subscriptionStart = parseAdminDate(body.subscription_start) || (subscriptionStatus === 'trial' ? new Date() : null);
  const subscriptionEnd = parseAdminDate(body.subscription_end) || (subscriptionStatus === 'trial' && subscriptionStart ? new Date(subscriptionStart.getTime() + 30 * 24 * 60 * 60 * 1000) : null);
  const languages = Array.isArray(body.languages)
    ? body.languages.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
    : ['DE', 'EN'];
  const currency = optionalText(body.currency, 8) || 'EUR';
  const listingPlan = optionalText(body.listing_plan || body.subscription_plan, 80) || 'admin_profile_studio';

  return {
    data: {
      owner_email: ownerEmail,
      primary_phone: optionalText(body.phone || body.primary_phone, 40),
      phone: optionalText(body.phone || body.primary_phone, 40),
      whatsapp: optionalText(body.whatsapp, 80),
      telegram: optionalText(body.telegram, 80),
      account_type: accountType,
      profile_type: profileType,
      display_name: displayName,
      city,
      area: optionalText(body.area, 80),
      work_country: optionalText(body.work_country, 80) || 'DE',
      work_city: optionalText(body.work_city, 100) || adminCityLabel(city),
      work_area: optionalText(body.work_area, 120) || optionalText(body.area, 80),
      category,
      description: optionalText(body.description, 2000) || 'Preview profile generated for marketplace layout and internal quality checks. Replace with verified advertiser content before real publication.',
      languages,
      age,
      height,
      height_cm: height,
      nationality: optionalText(body.nationality, 80),
      business_name: optionalText(body.business_name, 160),
      business_type: optionalText(body.business_type, 120),
      contact_person: optionalText(body.contact_person, 120),
      website: optionalText(body.website, 240),
      opening_hours: normalizeOpeningHours(body.opening_hours),
      price_30min: optionalMoney(body.price_30min),
      price_1h: optionalMoney(body.price_1h) || 180,
      price_2h: optionalMoney(body.price_2h),
      price_night: optionalMoney(body.price_night),
      currency,
      services: services.data,
      service_menu: services.data.map((service) => ({ name: service, enabled: true, included: true, extra_price: null, note: null })),
      visit_types: Array.isArray(body.visit_types) ? body.visit_types.map((item) => String(item)).slice(0, 8) : ['incall', 'hotel'],
      service_tags: Array.isArray(body.service_tags) ? body.service_tags.map((item) => String(item)).slice(0, 16) : ['discreet', 'private-meeting'],
      verified: body.verified !== false,
      is_seed_profile: Boolean(body.is_seed_profile),
      is_test_account: Boolean(body.is_seed_profile) || Boolean(body.is_test_account),
      is_published: isPublished,
      premium_tier: premiumTiers.includes(premiumTier) ? premiumTier : 'standard',
      admin_priority: optionalInteger(body.admin_priority, 0, 10000) || 0,
      status: isPublished ? 'active' : 'active',
      subscription_status: subscriptionStatus,
      subscription_plan: listingPlan,
      subscription_start: subscriptionStart?.toISOString() || null,
      subscription_end: subscriptionEnd?.toISOString() || null,
      subscription_requested_at: new Date().toISOString(),
      subscription_note: optionalText(body.subscription_note, 2000),
      listing_plan: listingPlan,
      listing_price: optionalMoney(body.listing_price) ?? optionalMoney(body.price_1h) ?? 0,
      listing_currency: currency,
      max_photos: 6,
      moderation_status: allowedModerationStatuses.includes(String(body.moderation_status || 'approved')) ? String(body.moderation_status || 'approved') : 'approved',
      moderation_note: optionalText(body.moderation_note, 2000),
      suspended_reason: optionalText(body.suspended_reason, 1000),
      ...operatorStatusPatch(operatorStatus)
    }
  };
}

async function createBerlinSeedProfiles() {
  const rows = Array.from({ length: 24 }, (_, index) => {
    const operatorStatus = index < 8 ? 'ONLINE_NOW' : index < 16 ? 'AVAILABLE_TODAY' : index < 20 ? 'BUSY' : 'OFFLINE';
    const area = berlinSeedAreas[index % berlinSeedAreas.length];
    const premiumTier = ['diamond', 'elite', 'gold', 'standard'][index % 4];
    const services = seedServices(index);
    const category = berlinSeedCategories[index % berlinSeedCategories.length];
    const displayName = `${berlinSeedNames[index % berlinSeedNames.length]} ${area}`;
    const age = 22 + (index % 14);
    const height = 160 + (index % 21);
    const price = 140 + (index % 9) * 25 + (premiumTier === 'diamond' ? 80 : premiumTier === 'elite' ? 45 : 0);

    return {
      display_name: displayName,
      slug: `berlin-preview-${slugify(displayName)}-${index + 1}`,
      city: 'berlin',
      area,
      work_city: 'Berlin',
      work_area: area,
      category,
      description: seedDescription(area, premiumTier),
      languages: ['DE', 'EN', index % 3 === 0 ? 'PL' : ''],
      age,
      height,
      height_cm: height,
      nationality: ['German', 'European', 'Polish', 'Spanish', 'International'][index % 5],
      price_1h: price,
      currency: 'EUR',
      services,
      service_menu: services.map((service) => ({ name: service, enabled: true, included: true, extra_price: null, note: null })),
      visit_types: index % 2 === 0 ? ['incall', 'hotel'] : ['outcall', 'private'],
      service_tags: ['discreet', 'private-meeting', index % 2 === 0 ? 'wellness' : 'conversation'],
      verified: true,
      verification_status: 'verified',
      verified_at: new Date().toISOString(),
      moderation_status: 'approved',
      is_seed_profile: true,
      is_test_account: true,
      is_published: true,
      premium_tier: premiumTier,
      admin_priority: 1000 - index,
      status: 'active',
      subscription_status: 'test',
      listing_plan: 'admin_seed',
      listing_price: 0,
      listing_currency: 'EUR',
      max_photos: 6,
      location_mode: 'approximate',
      latitude: 52.52 + ((index % 7) - 3) * 0.018,
      longitude: 13.405 + ((index % 9) - 4) * 0.021,
      service_radius_km: [10, 15, 20, 25, 50][index % 5],
      approximate_location_area: area,
      location_updated_at: new Date().toISOString(),
      ...operatorStatusPatch(operatorStatus)
    };
  }).map((row) => ({ ...row, languages: row.languages.filter(Boolean) }));

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .insert(rows)
    .select('*, profile_images(*)');

  if (error) throw new Error(error.message);

  const seededProfiles = [];
  for (const [index, profile] of (data || []).entries()) {
    const image = await createSeedImage(profile.id, profile.display_name, index, true);
    seededProfiles.push(withAdminImageUrls({ ...profile, profile_images: image ? [image] : [] }));
  }
  return seededProfiles;
}

async function createSeedImage(profileId: string, displayName: string, index: number, isPrimary: boolean) {
  const buffer = await renderSeedImage(displayName, index);
  const storagePath = `seed-profiles/berlin/${profileId}/${index + 1}.jpg`;
  const uploadResult = await supabaseAdmin.storage
    .from(config.storageBucket)
    .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });

  if (uploadResult.error) return null;

  const { data, error } = await supabaseAdmin
    .from('profile_images')
    .insert({
      profile_id: profileId,
      storage_path: storagePath,
      is_primary: isPrimary,
      is_blurred: false,
      moderation_status: 'approved',
      sort_order: 0
    })
    .select()
    .single();

  if (error) return null;
  return withPublicImageUrl(data);
}

async function renderSeedImage(displayName: string, index: number) {
  const palettes = [
    ['#080808', '#4A1023', '#E8D8B5'],
    ['#111111', '#2F1723', '#D6B08C'],
    ['#0B0B0B', '#1F2937', '#A78BFA'],
    ['#101010', '#164E63', '#14B8A6']
  ];
  const [bg, accent, gold] = palettes[index % palettes.length];
  const initials = displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${accent}"/>
          <stop offset=".48" stop-color="${bg}"/>
          <stop offset="1" stop-color="#171717"/>
        </linearGradient>
        <radialGradient id="r" cx="50%" cy="24%" r="58%">
          <stop offset="0" stop-color="${gold}" stop-opacity=".52"/>
          <stop offset=".62" stop-color="${accent}" stop-opacity=".18"/>
          <stop offset="1" stop-color="${bg}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="1500" fill="url(#g)"/>
      <rect width="1200" height="1500" fill="url(#r)"/>
      <circle cx="600" cy="430" r="170" fill="rgba(232,216,181,.14)" stroke="${gold}" stroke-width="10"/>
      <path d="M265 1280c55-310 615-310 670 0" fill="rgba(232,216,181,.12)" stroke="${gold}" stroke-width="10"/>
      <path d="M210 160h780M210 1340h780" stroke="${gold}" stroke-opacity=".28" stroke-width="3"/>
      <text x="600" y="468" text-anchor="middle" fill="${gold}" font-family="Arial" font-size="118" font-weight="800">${initials}</text>
      <text x="86" y="1400" fill="${gold}" font-family="Arial" font-size="48" font-weight="700">Preview profile</text>
    </svg>`;

  return sharp(Buffer.from(svg)).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}

function seedServices(index: number) {
  const services = [
    berlinSeedServices[index % berlinSeedServices.length],
    berlinSeedServices[(index + 3) % berlinSeedServices.length],
    berlinSeedServices[(index + 6) % berlinSeedServices.length]
  ].filter((service) => allowedServiceKeys.has(service));
  return services.length ? services : ['towarzystwo', 'dyskrecja'];
}

function seedDescription(area: string, premiumTier: string) {
  return `Preview profile for Berlin ${area}. This demo listing uses generated assets and original placeholder copy for marketplace QA. Tier: ${premiumTier}. Replace with verified advertiser content before real onboarding.`;
}

function normalizeAdminOperatorStatus(value: unknown) {
  const status = String(value || 'OFFLINE').toUpperCase();
  return operatorStatuses.includes(status) ? status : 'OFFLINE';
}

function normalizeAdminCategory(value: unknown) {
  const category = String(value || 'ladies');
  return ['ladies', 'gay', 'couples', 'trans', 'massage', 'house_hotel', 'live_cam', 'clubs_parties', 'other'].includes(category) ? category : 'ladies';
}

function normalizeAdminAccountType(value: unknown) {
  const accountType = String(value || 'escort');
  return ['escort', 'business', 'private', 'agency', 'massage_salon', 'club_party', 'live_cam'].includes(accountType) ? accountType : 'escort';
}

function normalizeAdminProfileType(value: unknown) {
  const profileType = String(value || 'private_escort');
  return ['private_escort', 'agency', 'club', 'massage_salon', 'live_cam', 'couple', 'trans', 'gay', 'other'].includes(profileType) ? profileType : 'private_escort';
}

function normalizeAdminSubscriptionStatus(value: unknown) {
  const status = String(value || 'trial');
  return ['free', 'requested', 'trial', 'active', 'past_due', 'incomplete', 'cancelled', 'canceled', 'expired', 'suspended', 'test'].includes(status) ? status : 'trial';
}

function optionalEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 240) : null;
}

function normalizeOpeningHours(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const text = optionalText(value, 1000);
  return text ? { note: text } : {};
}

function adminCityLabel(slug: string) {
  const labels: Record<string, string> = {
    berlin: 'Berlin',
    hamburg: 'Hamburg',
    hannover: 'Hannover',
    koeln: 'Koeln',
    muenchen: 'Muenchen',
    warszawa: 'Warszawa'
  };
  return labels[slug] || slug;
}

function normalizeAdminServices(value: unknown): { data: string[] } | { error: string } {
  if (!Array.isArray(value)) return { data: [] };
  const services = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  const unknown = services.find((service) => !allowedServiceKeys.has(service));
  if (unknown) return { error: `Unknown service key: ${unknown}` };
  return { data: services.slice(0, 24) };
}

function optionalInteger(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(Math.max(Math.round(number), min), max);
}

function optionalMoney(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100) / 100;
}

function operatorStatusPatch(status: string) {
  if (status === 'ONLINE_NOW') return { operator_status: status, availability_status: 'available', available_now: true };
  if (status === 'AVAILABLE_TODAY' || status === 'APPOINTMENT_ONLY') return { operator_status: status, availability_status: 'available', available_now: false };
  if (status === 'BUSY' || status === 'TRAVELING') return { operator_status: status, availability_status: 'busy', available_now: false };
  return { operator_status: 'OFFLINE', availability_status: 'unavailable', available_now: false };
}

function withAdminImageUrls(profile: any) {
  const images = (profile.profile_images || [])
    .map(withPublicImageUrl)
    .sort((left: any, right: any) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
  return { ...profile, profile_images: images, images };
}

function withPublicImageUrl(image: any) {
  const { data } = supabaseAdmin.storage.from(config.storageBucket).getPublicUrl(image.storage_path);
  return { ...image, public_url: data.publicUrl, is_cover: Boolean(image.is_primary) };
}

function logAdminProfileImageUpload(status: 'start' | 'success' | 'error', req: any, extra: Record<string, unknown> = {}) {
  console.info('[admin profiles images]', {
    status,
    profile_id: extra.profile_id || req.params?.id || req.params?.profileId || null,
    admin_id: req.user?.id || req.user?.email || null,
    bucket: config.storageBucket,
    file_mime: extra.file_mime || null,
    file_size: extra.file_size || null,
    reason: extra.reason || null,
    image_id: extra.image_id || null
  });
}

function subscriptionProgress(startValue: unknown, endValue: unknown) {
  if (!startValue || !endValue) return 0;
  const start = new Date(String(startValue)).getTime();
  const end = new Date(String(endValue)).getTime();
  const now = Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
}

function parseAdminDate(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function reportPublicStatus(adminStatus: string) {
  if (adminStatus === 'investigating' || adminStatus === 'escalated') return 'reviewing';
  if (adminStatus === 'rejected') return 'dismissed';
  return adminStatus;
}

function subscriptionPatch(input: { status: string; plan?: string; start?: Date; end?: Date; managedBy?: string | null; note?: string | null }) {
  const patch: Record<string, unknown> = {
    subscription_status: input.status,
    subscription_managed_by: input.managedBy || null,
    subscription_note: input.note || null
  };
  if (input.plan) {
    patch.subscription_plan = input.plan;
    patch.listing_plan = input.plan;
    patch.plan = input.plan;
  }
  if (input.start) {
    patch.subscription_start = input.start.toISOString();
    patch.subscription_started_at = input.start.toISOString();
  }
  if (input.end) {
    patch.subscription_end = input.end.toISOString();
    patch.subscription_expires_at = input.end.toISOString();
  }
  if (input.status === 'active') {
    patch.status = 'active';
    patch.is_published = true;
    patch.moderation_status = 'approved';
  }
  if (['expired', 'cancelled'].includes(input.status)) {
    patch.is_published = false;
  }
  return patch;
}

async function updateProfileSubscription(profileId: string, patch: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(patch)
    .eq('id', profileId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  await upsertManualSubscription(data, String(patch.subscription_managed_by || 'admin'));
  return data;
}

async function upsertManualSubscription(profile: Record<string, any>, managedBy: string | null | undefined) {
  if (!profile?.id) return;
  const start = profile.subscription_start || profile.subscription_started_at || null;
  const end = profile.subscription_end || profile.subscription_expires_at || null;
  const payload = {
    user_id: profile.user_id || null,
    profile_id: profile.id,
    email: profile.owner_email || null,
    profile_display_name: profile.display_name || null,
    role: profile.profile_type || profile.account_type || profile.category || 'escort',
    plan: profile.subscription_plan || profile.listing_plan || profile.plan || 'admin_profile_studio',
    status: profile.subscription_status || 'trial',
    provider: 'manual_admin',
    amount_eur: Number(profile.listing_price || 0),
    currency: profile.currency || profile.listing_currency || 'EUR',
    current_period_start: start,
    current_period_end: end,
    managed_by: managedBy || profile.subscription_managed_by || null,
    admin_note: profile.subscription_note || null,
    metadata: {
      source: 'admin_profile_studio',
      profile_type: profile.profile_type || null,
      is_seed_profile: Boolean(profile.is_seed_profile)
    }
  };

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(payload, { onConflict: 'profile_id' });
  if (error) throw new Error(error.message);
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

function sumPaymentCents(rows: Array<{ amount_cents?: number | null }>) {
  const cents = rows.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  return Number((cents / 100).toFixed(2));
}

function topCounts<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    const value = String(row[key] || '').trim();
    if (!value) return acc;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));
}
