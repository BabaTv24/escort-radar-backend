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
  normalizeProfileEthnicity,
  normalizeProfileGender,
  normalizeProfileOrientation,
  normalizeProfileCategory,
  normalizeProfileTravels,
  normalizeOperatorStatus,
  optionalDecimalRange,
  optionalText,
  slugify
} from '../validation.js';
import { normalizePhone } from '../utils/identity.js';
import { writeAdminAuditLog } from '../services/adminAudit.js';
import { config } from '../config.js';
import { signAdminToken } from '../utils/adminJwt.js';
import { allowedServiceKeys } from '../serviceCatalog.js';
import { activateClientAccount, deactivateClientAccount, getOrCreateCoinWallet, grantCoins } from '../services/clientActivation.js';
import { applyManualPaymentOrder } from '../manualPayments.js';
import {
  buildAdminClient,
  enrichClientActivationPayments,
  enrichTokenPurchaseRequests,
  enrichTokenTransactionsWithEmails,
  filterSortPaginateClients,
  isClientUser,
  importantLiveTestClientEmail,
  normalizeClientPayment,
  paymentMatchesClient
} from '../adminClients.js';
import {
  isBusinessRole,
  isRealPaidSubscription,
  isRealRevenueTransaction,
  revenueAmount,
  subscriptionTransactionType,
  sumRealRevenue
} from '../revenue.js';
import { explainProfileVisibility } from '../profileVisibility.js';

export const adminRouter = Router();

const adminUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});
const adminImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const premiumTiers = ['standard', 'gold', 'elite', 'diamond'];
const operatorStatuses = ['ONLINE_NOW', 'AVAILABLE_TODAY', 'BUSY', 'APPOINTMENT_ONLY', 'TRAVELING', 'OFFLINE'];

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

adminRouter.get('/location-catalog', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('location_catalog')
    .select('*')
    .order('country_code', { ascending: true })
    .order('city', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) {
    console.info('[admin location catalog] fallback reason=', error.message);
    return res.json({ locations: [] });
  }
  res.json({ locations: data || [] });
}));

adminRouter.post('/location-catalog', asyncHandler(async (req, res) => {
  const countryCode = String(req.body.country_code || '').trim().toUpperCase();
  const countryName = optionalText(req.body.country_name, 120);
  const city = optionalText(req.body.city, 120);
  if (!/^[A-Z]{2}$/.test(countryCode)) return res.status(400).json({ error: 'Valid country_code is required' });
  if (!countryName || !city) return res.status(400).json({ error: 'country_name and city are required' });

  const row = {
    country_code: countryCode,
    country_name: countryName,
    city,
    district: optionalText(req.body.district, 120),
    postal_code: optionalText(req.body.postal_code, 40),
    is_active: req.body.is_active !== false,
    sort_order: optionalInteger(req.body.sort_order, 0, 10000) || 0
  };
  const { data, error } = await supabaseAdmin
    .from('location_catalog')
    .insert(row)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'location_catalog_created', 'location_catalog', data.id, row);
  res.status(201).json({ location: data });
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
    supabaseAdmin.from('client_activation_payments').select('*').order('created_at', { ascending: false }).limit(1000),
    supabaseAdmin.from('client_activations').select('id, state').limit(5000)
  ]);

  if (profiles.error) return res.status(500).json({ error: profiles.error.message });
  if (reports.error) return res.status(500).json({ error: reports.error.message });
  if (bookings.error) return res.status(500).json({ error: bookings.error.message });
  if (activationPayments.error) return res.status(500).json({ error: activationPayments.error.message });

  const profileRows = profiles.data || [];
  const reportRows = reports.data || [];
  const bookingRows = bookings.data || [];
  const activationPaymentRows: Record<string, any>[] = (activationPayments.data || []).map(normalizeClientPayment).map((payment: Record<string, any>) => ({
    ...payment,
    transaction_type: 'client_activation',
    payment_status: payment.payment_status || payment.status || 'paid',
    stripe_checkout_session_id: payment.stripe_checkout_session_id || payment.stripe_session_id || null,
    amount: revenueAmount(payment)
  }));
  const realActivationPaymentRows = activationPaymentRows.filter(isRealRevenueTransaction);
  const activationRows = activations.data || [];
  const dailyClientActivationRevenue = sumRealRevenue(realActivationPaymentRows.filter((row) => new Date(row.created_at) >= dayStart));
  const monthlyClientActivationRevenue = sumRealRevenue(realActivationPaymentRows.filter((row) => new Date(row.created_at) >= monthStart));
  const activatedClientCount = activationRows.filter((activation) => activation.state === 'client_activated').length;
  const registeredClientCount = activationRows.length;
  const latestActivationPayments = realActivationPaymentRows.slice(0, 12).map((payment) => ({
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
      client_activation_revenue_eur: sumRealRevenue(realActivationPaymentRows),
      client_activation_transactions: realActivationPaymentRows.length,
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
  const [paymentsResult, usersResult] = await Promise.all([
    supabaseAdmin
      .from('client_activation_payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500),
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ]);

  if (paymentsResult.error) return res.status(500).json({ error: paymentsResult.error.message });
  if (usersResult.error) return res.status(500).json({ error: usersResult.error.message });
  res.json({ client_activation_payments: enrichClientActivationPayments(paymentsResult.data || [], usersResult.data.users || []) });
}));

adminRouter.get('/manual-payment-orders', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('manual_payment_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    orders: (data || []).map((order) => ({
      ...order,
      payment_reference: order.metadata?.payment_reference || ''
    }))
  });
}));

adminRouter.post('/manual-payment-orders/:id/approve', asyncHandler(async (req, res) => {
  const { data: order, error } = await supabaseAdmin
    .from('manual_payment_orders')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error || !order) return res.status(404).json({ error: error?.message || 'Manual payment order not found' });
  if (!['pending', 'paid'].includes(String(order.status || 'pending'))) return res.status(409).json({ error: 'Manual payment order cannot be approved from current status' });
  if (!order.applied_at) await applyManualPaymentOrder(order, req.user?.email);
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('manual_payment_orders')
    .update({
      status: 'paid',
      approved_at: new Date().toISOString(),
      applied_at: order.applied_at || new Date().toISOString(),
      admin_email: req.user?.email || null,
      rejection_reason: null
    })
    .eq('id', req.params.id)
    .select()
    .single();
  if (updateError) return res.status(400).json({ error: updateError.message });
  await logAdminAction(req.user?.email, 'manual_payment_order_approved', 'manual_payment_order', req.params.id, { purpose: order.purpose, product_id: order.product_id });
  res.json({ order: updated });
}));

adminRouter.post('/manual-payment-orders/:id/reject', asyncHandler(async (req, res) => {
  const { data: existing, error: readError } = await supabaseAdmin
    .from('manual_payment_orders')
    .select('id, status, applied_at')
    .eq('id', req.params.id)
    .single();
  if (readError || !existing) return res.status(404).json({ error: readError?.message || 'Manual payment order not found' });
  if (existing.applied_at || ['paid', 'rejected', 'refunded'].includes(String(existing.status || '').toLowerCase())) {
    return res.status(409).json({ error: 'Manual payment order cannot be rejected from current status' });
  }
  const { data, error } = await supabaseAdmin
    .from('manual_payment_orders')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      admin_email: req.user?.email || null,
      rejection_reason: optionalText(req.body.reason, 1000)
    })
    .eq('id', req.params.id)
    .eq('status', 'pending')
    .is('applied_at', null)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, 'manual_payment_order_rejected', 'manual_payment_order', req.params.id, { reason: optionalText(req.body.reason, 1000) });
  res.json({ order: data });
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

  const [activationPayments, subscriptions, stripeEvents] = await Promise.all([
    supabaseAdmin.from('client_activation_payments').select('*').order('created_at', { ascending: false }).limit(1000),
    supabaseAdmin.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(1000),
    supabaseAdmin.from('stripe_payment_events').select('*').order('created_at', { ascending: false }).limit(2000)
  ]);

  if (activationPayments.error) return res.status(500).json({ error: activationPayments.error.message });
  if (subscriptions.error) return res.status(500).json({ error: subscriptions.error.message });
  if (stripeEvents.error && stripeEvents.error.code !== '42P01') return res.status(500).json({ error: stripeEvents.error.message });

  const activationRows = (activationPayments.data || []).map(normalizeClientPayment);
  const subscriptionRows = subscriptions.data || [];
  const stripeEventRows = stripeEvents.data || [];
  const sponsoredProfileCount = await countSponsoredProfiles();
  const paymentRows = [
    ...activationRows.map((payment) => ({
      id: payment.id,
      email: payment.email,
      profile: 'Client activation',
      amount: revenueAmount(payment),
      currency: String(payment.currency || 'eur').toUpperCase(),
      provider: payment.provider || 'stripe',
      status: payment.status || 'paid',
      payment_status: payment.payment_status || payment.status || 'paid',
      created_at: payment.created_at,
      type: 'client_activation',
      transaction_type: 'client_activation',
      stripe_checkout_session_id: payment.stripe_checkout_session_id || payment.stripe_session_id || null,
      stripe_payment_intent_id: payment.stripe_payment_intent_id || null,
      livemode: payment.livemode
    })),
    ...subscriptionRows.map((subscription) => ({
      id: subscription.id,
      email: subscription.email,
      profile: subscription.profile_display_name || subscription.profile_id,
      amount: Number(subscription.amount_eur || 0),
      currency: subscription.currency || 'EUR',
      provider: subscription.provider || 'manual_admin',
      status: subscription.status,
      payment_status: subscription.payment_status || subscription.status,
      created_at: subscription.created_at || subscription.requested_at,
      type: 'subscription',
      transaction_type: subscription.transaction_type || subscriptionTransactionType(subscription),
      role: subscription.role,
      stripe_checkout_session_id: subscription.stripe_checkout_session_id || null,
      stripe_payment_intent_id: subscription.stripe_payment_intent_id || null,
      livemode: subscription.livemode,
      current_period_end: subscription.current_period_end
    }))
  ].sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());

  const realStripeEventRows = stripeEventRows
    .map((event) => ({
      ...event,
      amount: revenueAmount(event),
      provider: event.provider || 'stripe',
      payment_status: event.payment_status || event.status,
      stripe_ref: event.stripe_payment_intent_id || event.stripe_checkout_session_id || event.stripe_subscription_id
    }))
    .filter(isRealRevenueTransaction);
  const realPaymentRows = realStripeEventRows.length ? realStripeEventRows : paymentRows.filter(isRealRevenueTransaction);
  const realSubscriptionRows = subscriptionRows
    .map((subscription) => ({
      ...subscription,
      transaction_type: subscription.transaction_type || subscriptionTransactionType(subscription),
      payment_status: subscription.payment_status || subscription.status
    }))
    .filter(isRealPaidSubscription);
  const realActiveSubscriptionRows = realSubscriptionRows.filter((row) => row.status === 'active');
  const dailyRevenue = realPaymentRows
    .filter((row) => row.created_at && new Date(row.created_at) >= dayStart)
    .reduce((sum, row) => sum + revenueAmount(row), 0);
  const monthlyRevenue = realPaymentRows
    .filter((row) => row.created_at && new Date(row.created_at) >= monthStart)
    .reduce((sum, row) => sum + revenueAmount(row), 0);

  res.json({
    stats: {
      today_revenue: Number(dailyRevenue.toFixed(2)),
      monthly_revenue: Number(monthlyRevenue.toFixed(2)),
      client_activations: realPaymentRows.filter((row) => row.transaction_type === 'client_activation').length,
      client_activation_revenue: sumRealRevenue(realPaymentRows.filter((row) => row.transaction_type === 'client_activation')),
      escort_subscriptions_revenue: sumRealRevenue(realPaymentRows.filter((row) => row.transaction_type === 'escort_subscription')),
      business_subscriptions_revenue: sumRealRevenue(realPaymentRows.filter((row) => row.transaction_type === 'business_subscription')),
      coins_revenue: sumRealRevenue(realPaymentRows.filter((row) => row.transaction_type === 'coins_purchase')),
      escort_subscriptions: realActiveSubscriptionRows.filter((row) => !isBusinessRole(row.role)).length,
      business_subscriptions: realActiveSubscriptionRows.filter((row) => isBusinessRole(row.role)).length,
      sponsored_profiles: sponsoredProfileCount,
      expired_subscriptions: realSubscriptionRows.filter((row) => row.status === 'expired').length,
      upcoming_renewals: realActiveSubscriptionRows.filter((row) => row.current_period_end && new Date(row.current_period_end).getTime() > Date.now()).length
    },
    payments: realPaymentRows
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

  const visibilityContext = { country: req.query.country, city: req.query.city, category: req.query.category };
  const rows = (data || []).map((profile) => withAdminImageUrls({
    ...profile,
    owner_email: profile.owner_email || (profile.user_id ? ownerEmailById.get(profile.user_id) || null : null),
    visibility_audit: explainProfileVisibility(profile, visibilityContext)
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

adminRouter.get('/profiles/visibility-audit', asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, owner_email, city, work_city, work_country, area, work_area, postal_code, latitude, longitude, category, status, moderation_status, is_published, shadowbanned, subscription_status, is_seed_profile, is_sponsored, acquisition_source, admin_priority, created_at')
    .order('admin_priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });

  const context = { country: req.query.country, city: req.query.city, category: req.query.category };
  res.json({
    context,
    profiles: (data || []).map((profile) => ({
      id: profile.id,
      display_name: profile.display_name,
      owner_email: profile.owner_email,
      city: profile.city,
      work_city: profile.work_city,
      work_country: profile.work_country,
      category: profile.category,
      visibility: explainProfileVisibility(profile, context)
    }))
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
  if (req.body.password && req.body.password !== req.body.confirm_password) return res.status(400).json({ error: 'Passwords do not match' });

  const starter = starterPackagePatch(req.body.starter_package, String(profileData.data.account_type || 'escort'));
  let authUser: any = null;
  let authUserCreated = false;
  try {
    const accountResult = await resolveAdminProfileUser({
      email: String(profileData.data.owner_email || ''),
      password: optionalText(req.body.password, 200),
      accountType: String(profileData.data.account_type || 'escort'),
      plan: starter.listing_plan,
      subscriptionStatus: starter.subscription_status
    });
    authUser = accountResult.user;
    authUserCreated = accountResult.created;
  } catch (accountError) {
    return res.status(400).json({ error: accountError instanceof Error ? accountError.message : 'Could not create login account' });
  }

  const payload: Record<string, any> = {
    ...profileData.data,
    ...starter,
    user_id: authUser?.id || null,
    slug: `${slugify(String(profileData.data.display_name))}-${Date.now().toString(36)}`,
    verification_status: profileData.data.verified ? 'verified' : 'pending',
    status: profileData.data.is_published ? 'active' : profileData.data.status,
    moderation_status: profileData.data.is_published ? 'approved' : profileData.data.moderation_status,
    verified_at: profileData.data.verified ? new Date().toISOString() : null,
    location_updated_at: new Date().toISOString()
  };
  const limitError = await validateBusinessProfileLimit(payload);
  if (limitError) return res.status(409).json({ error: limitError });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .insert(payload)
    .select('*, profile_images(*)')
    .single();

  if (error) {
    if (authUserCreated && authUser?.id) await supabaseAdmin.auth.admin.deleteUser(authUser.id);
    return res.status(400).json({ error: error.message });
  }
  await upsertManualSubscription(data, req.user?.email || req.user?.id || null);
  if (authUser?.id) {
    await logAccountAccess(req, data.id, authUser.id, authUserCreated ? 'admin_created_account' : 'admin_linked_user');
  }
  await logAdminAction(req.user?.email, 'profile_studio_created', 'profile', data.id, payload);
  res.status(201).json({ profile: withAdminImageUrls(data), account_created: authUserCreated, user_linked: Boolean(authUser) });
}));

adminRouter.post('/profiles/import', adminImportUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV or XLSX file is required' });
  const rows = await parseProfileImport(req.file);
  const report: { created: number; skipped: number; failed: number; errors: Array<{ row: number; email?: string; error: string }> } = {
    created: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };

  for (let index = 0; index < rows.length; index += 1) {
    const row = normalizeImportRow(rows[index]);
    try {
      if (!row.email || !row.display_name) throw new Error('email and display_name are required');
      const existingProfile = await findProfileByOwnerEmail(row.email);
      if (existingProfile) {
        report.skipped += 1;
        report.errors.push({ row: index + 2, email: row.email, error: 'Profile already exists' });
        continue;
      }
      const normalized = normalizeAdminProfilePayload(row);
      if ('error' in normalized) throw new Error(normalized.error);
      const starter = starterPackagePatch(row.starter_package || row.plan, String(normalized.data.account_type || 'escort'));
      const account = await resolveAdminProfileUser({
        email: row.email,
        password: optionalText(row.password, 200),
        accountType: String(normalized.data.account_type || 'escort'),
        plan: starter.listing_plan,
        subscriptionStatus: starter.subscription_status
      });
      const payload: Record<string, any> = {
        ...normalized.data,
        ...starter,
        user_id: account.user?.id || null,
        slug: `${slugify(String(normalized.data.display_name))}-${Date.now().toString(36)}-${index}`,
        verification_status: row.verified ? 'verified' : 'pending',
        moderation_status: row.verified ? 'approved' : 'pending',
        verified: Boolean(row.verified),
        is_published: Boolean(row.published),
        verified_at: row.verified ? new Date().toISOString() : null,
        location_updated_at: new Date().toISOString()
      };
      const { data, error } = await supabaseAdmin.from('profiles').insert(payload).select().single();
      if (error) {
        if (account.created && account.user?.id) await supabaseAdmin.auth.admin.deleteUser(account.user.id);
        throw new Error(error.message);
      }
      await upsertManualSubscription(data, req.user?.email || req.user?.id || null);
      if (account.user?.id) await logAccountAccess(req, data.id, account.user.id, account.created ? 'admin_created_account' : 'admin_linked_user');
      report.created += 1;
    } catch (rowError) {
      report.failed += 1;
      report.errors.push({ row: index + 2, email: row.email || undefined, error: rowError instanceof Error ? rowError.message : 'Import failed' });
    }
  }

  await logAdminAction(req.user?.email, 'profiles_imported', 'profile', null, {
    created: report.created,
    skipped: report.skipped,
    failed: report.failed
  });
  res.json({ report });
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

adminRouter.get('/clients', asyncHandler(async (req, res) => {
  const { clients, bigbaba } = await loadAdminClients();
  const page = filterSortPaginateClients(clients, req.query as Record<string, unknown>);
  res.json({
    clients: page.rows,
    total: page.total,
    page: page.page,
    page_size: page.page_size,
    bigbaba
  });
}));

adminRouter.get('/clients/:id', asyncHandler(async (req, res) => {
  const { clients } = await loadAdminClients();
  const client = clients.find((row) => row.id === req.params.id || String(row.email || '').toLowerCase() === req.params.id.toLowerCase());
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const [{ data: transactions }, { data: rewards }, { data: referrals }] = await Promise.all([
    supabaseAdmin.from('coin_transactions').select('*').eq('user_id', client.id).order('created_at', { ascending: false }).limit(200),
    supabaseAdmin.from('client_rewards').select('*').eq('user_id', client.id).order('created_at', { ascending: false }).limit(200),
    supabaseAdmin.from('client_referrals').select('*').or(`user_id.eq.${client.id},referred_by_code.eq.${client.referral_code || ''}`).limit(200)
  ]);

  res.json({
    client,
    payments: client.payments || [],
    coin_transactions: transactions || [],
    rewards: rewards || [],
    referrals: referrals || []
  });
}));

adminRouter.patch('/clients/:id/activation', asyncHandler(async (req, res) => {
  const state = String(req.body.state || '');
  if (state === 'client_activated') await activateClientAccount(req.params.id);
  else if (state === 'client_free') await deactivateClientAccount(req.params.id);
  else return res.status(400).json({ error: 'Invalid activation state' });
  const { clients } = await loadAdminClients();
  res.json({ client: clients.find((row) => row.id === req.params.id) || null });
}));

adminRouter.patch('/clients/:id/block', asyncHandler(async (req, res) => {
  const blocked = req.body.blocked !== false;
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, {
    ban_duration: blocked ? '876000h' : 'none'
  });
  if (error) return res.status(400).json({ error: error.message });
  await logAdminAction(req.user?.email, blocked ? 'client_blocked' : 'client_unblocked', 'auth_user', req.params.id, { blocked });
  res.json({ user: data.user });
}));

adminRouter.patch('/clients/:id/coins', asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: 'amount is required' });
  const wallet = await getOrCreateCoinWallet(req.params.id);
  await grantCoins(wallet.id, req.params.id, amount, amount > 0 ? 'admin_credit' : 'admin_debit', {
    note: optionalText(req.body.note, 1000),
    source: 'admin_clients'
  }, req.user?.email);
  res.json({ wallet: await getOrCreateCoinWallet(req.params.id) });
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
      .select('id, user_id, owner_email, display_name, city, account_type, profile_type, category, listing_plan, listing_price, listing_currency, currency, subscription_status, subscription_started_at, subscription_expires_at, subscription_plan, subscription_start, subscription_end, subscription_requested_at, subscription_managed_by, subscription_note, is_test_account, is_sponsored, acquisition_source, premium_tier, created_at')
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
      amount_eur: Number(subscription?.amount_eur ?? (profile.is_sponsored ? 0 : profile.listing_price) ?? 0),
      currency: subscription?.currency || profile.currency || profile.listing_currency || 'EUR',
      is_sponsored: Boolean(profile.is_sponsored),
      acquisition_source: profile.acquisition_source || null,
      transaction_type: subscription?.transaction_type || subscriptionTransactionType(subscription || profile),
      payment_status: subscription?.payment_status || subscription?.status || status,
      stripe_checkout_session_id: subscription?.stripe_checkout_session_id || null,
      stripe_payment_intent_id: subscription?.stripe_payment_intent_id || null,
      livemode: subscription?.livemode,
      premium_tier: profile.premium_tier || 'standard',
      note: subscription?.admin_note || profile.subscription_note || null
    };
  });

  const activationPaymentRows = enrichClientActivationPayments(activationPaymentsResult.data || [], usersResult.data?.users || []);
  const clientActivationRows = activationPaymentRows.map((payment) => ({
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
    amount_eur: revenueAmount(payment),
    currency: String(payment.currency || 'eur').toUpperCase(),
    stripe_session_id: payment.stripe_session_id,
    stripe_checkout_session_id: payment.stripe_checkout_session_id || payment.stripe_session_id || null,
    stripe_payment_intent_id: payment.stripe_payment_intent_id || null,
    payment_status: payment.payment_status || payment.status || 'paid',
    transaction_type: 'client_activation',
    livemode: payment.livemode
  }));

  const subscriptions = [...profileRows, ...clientActivationRows].sort((left, right) => new Date(right.requested_at || 0).getTime() - new Date(left.requested_at || 0).getTime());
  const profileSubscriptions = profileRows;
  const realProfileSubscriptions = profileSubscriptions.filter(isRealPaidSubscription);
  const realActiveProfileSubscriptions = realProfileSubscriptions.filter((row) => row.status === 'active' && (!row.end || new Date(row.end).getTime() > now));
  const realClientActivationRows = clientActivationRows.filter(isRealRevenueTransaction);

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
      monthly_revenue: sumRealRevenue(realProfileSubscriptions),
      client_activations_099: realClientActivationRows.length,
      escort_subscriptions: realActiveProfileSubscriptions.filter((row) => !isBusinessRole(row.role)).length,
      business_subscriptions: realActiveProfileSubscriptions.filter((row) => isBusinessRole(row.role)).length,
      sponsored_profiles: profileSubscriptions.filter((row) => row.is_sponsored || row.acquisition_source === 'admin_sponsored' || row.payment_provider === 'manual_admin').length
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
    amount_eur: existingSubscription?.provider && existingSubscription.provider !== 'manual_admin' ? Number(existingSubscription?.amount_eur || 0) : 0,
    currency: existingSubscription?.currency || profile.currency || profile.listing_currency || 'EUR',
    payment_status: existingSubscription?.provider && existingSubscription.provider !== 'manual_admin' ? existingSubscription?.payment_status || null : null,
    transaction_type: existingSubscription?.transaction_type || subscriptionTransactionType(profile),
    livemode: existingSubscription?.provider && existingSubscription.provider !== 'manual_admin' ? existingSubscription?.livemode ?? null : false,
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
  const limitError = await validateBusinessProfileLimit(patch, req.params.id);
  if (limitError) return res.status(409).json({ error: limitError });

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

adminRouter.post('/profiles/:id/create-account', asyncHandler(async (req, res) => {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', req.params.id)
    .single();
  logAdminAccount('create_account', profile, 'start');
  if (error || !profile) {
    logAdminAccount('create_account', { id: req.params.id }, 'error reason=profile_not_found');
    return res.status(404).json({ error: 'profile_not_found' });
  }
  if (profile.user_id) {
    logAdminAccount('create_account', profile, 'error reason=auth_user_exists');
    return res.status(409).json({ error: 'auth_user_exists' });
  }
  const email = optionalEmail(req.body.email || profile.owner_email);
  const password = optionalText(req.body.password, 200);
  if (!email) {
    logAdminAccount('create_account', profile, 'error reason=owner_email_required');
    return res.status(400).json({ error: 'owner_email_required' });
  }
  const existingAuthUser = await findAuthUserByEmail(email);
  if (!existingAuthUser && (!password || password.length < 8)) {
    logAdminAccount('create_account', profile, 'error reason=password_too_short');
    return res.status(400).json({ error: 'password_too_short' });
  }
  if (!existingAuthUser && password !== req.body.confirm_password) {
    logAdminAccount('create_account', profile, 'error reason=passwords_do_not_match');
    return res.status(400).json({ error: 'passwords_do_not_match' });
  }

  const plan = String(profile.subscription_plan || profile.listing_plan || 'admin_profile_studio');
  const subscriptionStatus = String(profile.subscription_status || 'trial');
  let account: Awaited<ReturnType<typeof resolveAdminProfileUser>>;
  try {
    account = await resolveAdminProfileUser({
      email,
      password: existingAuthUser ? null : password,
      accountType: String(profile.account_type || 'escort'),
      plan,
      subscriptionStatus
    });
  } catch (accountError) {
    const reason = accountError instanceof Error ? accountError.message : 'account_creation_failed';
    logAdminAccount('create_account', profile, `error reason=${reason}`);
    return res.status(400).json({ error: reason });
  }
  if (!account.user?.id) {
    logAdminAccount('create_account', profile, 'error reason=auth_user_missing');
    return res.status(400).json({ error: 'auth_user_missing' });
  }

  const { data: updatedProfile, error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ user_id: account.user.id, owner_email: email })
    .eq('id', profile.id)
    .select('*, profile_images(*)')
    .single();
  if (updateError) {
    if (account.created) await supabaseAdmin.auth.admin.deleteUser(account.user.id);
    logAdminAccount('create_account', profile, `error reason=${updateError.message}`);
    return res.status(400).json({ error: updateError.message });
  }

  await upsertManualSubscription(updatedProfile, req.user?.email || req.user?.id || null);
  await logAccountAccess(req, profile.id, account.user.id, account.created ? 'admin_created_account' : 'admin_linked_user');
  await logAdminAction(req.user?.email, account.created ? 'profile_login_account_created' : 'profile_auth_user_linked', 'profile', profile.id, { user_id: account.user.id });
  logAdminAccount('create_account', updatedProfile, 'success');
  res.json({ profile: withAdminImageUrls(updatedProfile), account_created: account.created, user_linked: !account.created });
}));

adminRouter.post('/profiles/:id/set-temp-password', asyncHandler(async (req, res) => {
  const { data: profile, error } = await supabaseAdmin.from('profiles').select('*').eq('id', req.params.id).single();
  logAdminAccount('set_temp_password', profile || { id: req.params.id }, 'start');
  if (error || !profile) return res.status(404).json({ error: 'profile_not_found' });
  const password = optionalText(req.body.password, 200);
  if (!password || password.length < 8) {
    logAdminAccount('set_temp_password', profile, 'error reason=password_too_short');
    return res.status(400).json({ error: 'password_too_short' });
  }
  if (password !== req.body.confirm_password) {
    logAdminAccount('set_temp_password', profile, 'error reason=passwords_do_not_match');
    return res.status(400).json({ error: 'passwords_do_not_match' });
  }
  const email = optionalEmail(profile.owner_email);
  if (!email) {
    logAdminAccount('set_temp_password', profile, 'error reason=owner_email_required');
    return res.status(400).json({ error: 'owner_email_required' });
  }

  let target = await resolveProfileAuthUser(profile);
  if ('error' in target && target.error === 'auth_user_missing') {
    const account = await resolveAdminProfileUser({
      email,
      password,
      accountType: String(profile.account_type || 'escort'),
      plan: String(profile.subscription_plan || profile.listing_plan || 'admin_profile_studio'),
      subscriptionStatus: String(profile.subscription_status || 'trial')
    });
    if (!account.user?.id) return res.status(400).json({ error: 'auth_user_missing' });
    const { data: linked, error: linkError } = await supabaseAdmin
      .from('profiles')
      .update({ user_id: account.user.id, owner_email: email })
      .eq('id', profile.id)
      .select('*, profile_images(*)')
      .single();
    if (linkError) {
      if (account.created) await supabaseAdmin.auth.admin.deleteUser(account.user.id);
      return res.status(400).json({ error: linkError.message });
    }
    target = { profile: linked, user: account.user };
  }
  if ('error' in target) return res.status(target.status || 400).json({ error: target.error });

  const { data: updatedUser, error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(target.user.id, {
    password,
    app_metadata: {
      ...(target.user.app_metadata || {}),
      auth_account_type: profile.account_type || 'escort',
      plan: profile.subscription_plan || profile.listing_plan || 'admin_profile_studio',
      subscription_status: profile.subscription_status || 'trial'
    }
  });
  if (passwordError || !updatedUser.user) {
    logAdminAccount('set_temp_password', profile, `error reason=${passwordError?.message || 'password_update_failed'}`);
    return res.status(400).json({ error: passwordError?.message || 'password_update_failed' });
  }
  await upsertManualSubscription(target.profile, req.user?.email || req.user?.id || null);
  await logAccountAccess(req, target.profile.id, target.user.id, 'temporary_password_set');
  await logAdminAction(req.user?.email, 'profile_temporary_password_set', 'profile', target.profile.id, { user_id: target.user.id });
  logAdminAccount('set_temp_password', target.profile, 'success');
  res.json({ profile: withAdminImageUrls(target.profile), user_id: target.user.id });
}));

adminRouter.get('/profiles/:id/security', asyncHandler(async (req, res) => {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, user_id, owner_email')
    .eq('id', req.params.id)
    .single();
  logAdminAccount('security', profile || { id: req.params.id }, 'start');
  if (error || !profile) return res.status(404).json({ error: 'profile_not_found' });
  const target = await resolveProfileAuthUser(profile);
  if ('error' in target) {
    logAdminAccount('security', profile, `error reason=${target.error}`);
    return res.status(target.status || 400).json({ error: target.error });
  }
  const user = target.user;
  const { data: logs } = await supabaseAdmin
    .from('account_access_logs')
    .select('*')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(20);

  logAdminAccount('security', profile, 'success');
  res.json({
    security: {
      user_id: user.id,
      email: user.email || profile.owner_email || null,
      last_login: user.last_sign_in_at || null,
      last_sign_in_at: user.last_sign_in_at || null,
      account_created_at: user.created_at || null,
      created_at: user.created_at || null,
      email_confirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
      banned_until: user.banned_until || null,
      banned: Boolean(user.banned_until && new Date(user.banned_until).getTime() > Date.now()),
      suspended: Boolean(user.banned_until && new Date(user.banned_until).getTime() > Date.now()),
      last_ip: null,
      user_agent: null,
      logs: logs || []
    }
  });
}));

adminRouter.post('/profiles/:id/magic-link', asyncHandler(async (req, res) => {
  const target = await getAdminProfileAuthTarget(req.params.id);
  if ('error' in target) {
    logAdminAccount('magic_link', target.profile, `error reason=${target.error}`);
    return res.status(target.status || 400).json({ error: target.error });
  }
  logAdminAccount('magic_link', target.profile, 'start');
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: target.email,
    options: { redirectTo: `${config.frontendUrl}/dashboard` }
  });
  if (error) {
    logAdminAccount('magic_link', target.profile, `error reason=${error.message}`);
    return res.status(400).json({ error: error.message });
  }
  const link = data.properties?.action_link;
  if (!link) {
    logAdminAccount('magic_link', target.profile, 'error reason=magic_link_not_generated');
    return res.status(500).json({ error: 'magic_link_not_generated' });
  }
  await logAccountAccess(req, target.profileId, target.userId, 'magic_link_generated');
  await logAdminAction(req.user?.email, 'profile_magic_link_generated', 'profile', target.profileId, { user_id: target.userId });
  logAdminAccount('magic_link', target.profile, 'success');
  res.json({ link });
}));

adminRouter.post('/profiles/:id/password-reset', asyncHandler(async (req, res) => {
  const target = await getAdminProfileAuthTarget(req.params.id);
  if ('error' in target) {
    logAdminAccount('password_reset', target.profile, `error reason=${target.error}`);
    return res.status(target.status || 400).json({ error: target.error });
  }
  logAdminAccount('password_reset', target.profile, 'start');
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: target.email,
    options: { redirectTo: `${config.frontendUrl}/dashboard` }
  });
  if (error) {
    logAdminAccount('password_reset', target.profile, `error reason=${error.message}`);
    return res.status(400).json({ error: error.message });
  }
  const link = data.properties?.action_link;
  if (!link) {
    logAdminAccount('password_reset', target.profile, 'error reason=password_reset_not_generated');
    return res.status(500).json({ error: 'password_reset_not_generated' });
  }
  await logAccountAccess(req, target.profileId, target.userId, 'password_reset_generated');
  await logAdminAction(req.user?.email, 'profile_password_reset_generated', 'profile', target.profileId, { user_id: target.userId });
  logAdminAccount('password_reset', target.profile, 'success');
  res.json({ link });
}));

adminRouter.post('/profiles/:id/send-login-email', asyncHandler(async (req, res) => {
  const target = await getAdminProfileAuthTarget(req.params.id);
  if ('error' in target) {
    logAdminAccount('send_login_email', target.profile, `error reason=${target.error}`);
    return res.status(target.status || 400).json({ error: target.error });
  }
  logAdminAccount('send_login_email', target.profile, 'start');
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: target.email,
    options: { redirectTo: `${config.frontendUrl}/dashboard` }
  });
  if (error || !data.properties?.action_link) {
    logAdminAccount('send_login_email', target.profile, `error reason=${error?.message || 'magic_link_not_generated'}`);
    return res.status(400).json({ error: error?.message || 'magic_link_not_generated' });
  }
  const delivery = buildAdminEmailFallback('login', target.email, data.properties.action_link);
  await logAccountAccess(req, target.profileId, target.userId, 'login_email_prepared');
  await logAdminAction(req.user?.email, 'profile_login_email_prepared', 'profile', target.profileId, { user_id: target.userId, sent: false });
  logAdminAccount('send_login_email', target.profile, 'success');
  res.json(delivery);
}));

adminRouter.post('/profiles/:id/send-reset-email', asyncHandler(async (req, res) => {
  const target = await getAdminProfileAuthTarget(req.params.id);
  if ('error' in target) {
    logAdminAccount('send_reset_email', target.profile, `error reason=${target.error}`);
    return res.status(target.status || 400).json({ error: target.error });
  }
  logAdminAccount('send_reset_email', target.profile, 'start');
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: target.email,
    options: { redirectTo: `${config.frontendUrl}/dashboard` }
  });
  if (error || !data.properties?.action_link) {
    logAdminAccount('send_reset_email', target.profile, `error reason=${error?.message || 'password_reset_not_generated'}`);
    return res.status(400).json({ error: error?.message || 'password_reset_not_generated' });
  }
  const delivery = buildAdminEmailFallback('reset', target.email, data.properties.action_link);
  await logAccountAccess(req, target.profileId, target.userId, 'reset_email_prepared');
  await logAdminAction(req.user?.email, 'profile_reset_email_prepared', 'profile', target.profileId, { user_id: target.userId, sent: false });
  logAdminAccount('send_reset_email', target.profile, 'success');
  res.json(delivery);
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
  const [transactionsResult, walletsResult, usersResult] = await Promise.all([
    supabaseAdmin
      .from('token_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500),
    supabaseAdmin.from('wallets').select('id, user_id').limit(5000),
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ]);

  if (transactionsResult.error) return res.status(500).json({ error: transactionsResult.error.message });
  if (walletsResult.error) return res.status(500).json({ error: walletsResult.error.message });
  if (usersResult.error) return res.status(500).json({ error: usersResult.error.message });
  res.json({
    transactions: enrichTokenTransactionsWithEmails(transactionsResult.data || [], walletsResult.data || [], usersResult.data.users || [])
  });
}));

adminRouter.get('/token-purchase-requests', asyncHandler(async (_req, res) => {
  const [purchasesResult, walletsResult, usersResult] = await Promise.all([
    supabaseAdmin
      .from('token_purchase_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500),
    supabaseAdmin.from('wallets').select('id, user_id').limit(5000),
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ]);

  if (purchasesResult.error) return res.status(500).json({ error: purchasesResult.error.message });
  if (walletsResult.error) return res.status(500).json({ error: walletsResult.error.message });
  if (usersResult.error) return res.status(500).json({ error: usersResult.error.message });
  res.json({
    purchase_requests: enrichTokenPurchaseRequests(purchasesResult.data || [], walletsResult.data || [], usersResult.data.users || [])
  });
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
    .select('*, profiles(id, display_name, owner_email, city, user_id)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });
  const photos = await Promise.all((data || []).map(withAdminPhotoRow));
  res.json({ photos });
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

async function countSponsoredProfiles() {
  const { count } = await supabaseAdmin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .or('is_sponsored.eq.true,acquisition_source.eq.admin_sponsored,provider.eq.manual_admin');
  return count || 0;
}

async function loadAdminClients() {
  const [
    usersResult,
    activationResult,
    paymentResult,
    walletResult,
    referralResult,
    accessLogResult
  ] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabaseAdmin.from('client_activations').select('*').limit(5000),
    supabaseAdmin.from('client_activation_payments').select('*').order('created_at', { ascending: false }).limit(5000),
    supabaseAdmin.from('coin_wallets').select('*').limit(5000),
    supabaseAdmin.from('client_referrals').select('*').limit(5000),
    supabaseAdmin.from('account_access_logs').select('*').eq('action', 'login').order('created_at', { ascending: false }).limit(5000)
  ]);

  if (usersResult.error) throw new Error(usersResult.error.message);
  if (activationResult.error) throw new Error(activationResult.error.message);
  if (paymentResult.error) throw new Error(paymentResult.error.message);
  if (walletResult.error) throw new Error(walletResult.error.message);
  if (referralResult.error) throw new Error(referralResult.error.message);

  const activationsByUser = new Map<string, any>();
  (activationResult.data || []).forEach((row) => activationsByUser.set(row.user_id, row));
  const paymentRows = (paymentResult.data || []).map(normalizeClientPayment);
  const walletsByUser = new Map<string, any>();
  (walletResult.data || []).forEach((row) => walletsByUser.set(row.user_id, row));
  const referralsByUser = new Map<string, any>();
  (referralResult.data || []).forEach((row) => referralsByUser.set(row.user_id, row));
  const lastAccessByUser = new Map<string, any>();
  (accessLogResult.data || []).forEach((row) => {
    if (row.user_id && !lastAccessByUser.has(row.user_id)) lastAccessByUser.set(row.user_id, row);
  });

  const clients = (usersResult.data.users || [])
    .filter(isClientUser)
    .map((user) => {
      return buildAdminClient({
        user,
        activation: activationsByUser.get(user.id),
        payments: paymentRows.filter((payment) => paymentMatchesClient(payment, user)),
        wallet: walletsByUser.get(user.id),
        referral: referralsByUser.get(user.id),
        lastAccess: lastAccessByUser.get(user.id)
      });
    });

  return {
    clients,
    bigbaba: clients.find((client) => String(client.email || '').toLowerCase() === importantLiveTestClientEmail) || null
  };
}

export async function validateBusinessProfileLimit(input: Record<string, any>, excludeProfileId?: string) {
  const businessId = optionalText(input.business_id, 80);
  if (!businessId) return null;
  const maxProfiles = optionalInteger(input.max_profiles, 1, 30) || 30;
  let query = supabaseAdmin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);
  if (excludeProfileId) query = query.neq('id', excludeProfileId);
  const { count, error } = await query;
  if (error) return error.message;
  if ((count || 0) >= maxProfiles) return `Business profile limit reached (${maxProfiles})`;
  return null;
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
  const weight = optionalInteger(body.weight_kg, 35, 200);
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
  const isSponsored = body.is_sponsored !== false && body.acquisition_source !== 'paid_advertiser';
  const businessType = normalizeBusinessType(body.business_type);
  const travels = normalizeProfileTravels(body.travels ?? body.travel);

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
      postal_code: optionalText(body.postal_code, 20),
      work_place_label: optionalText(body.work_place_label, 180),
      category,
      description: optionalText(body.description, 2000) || 'Preview profile generated for marketplace layout and internal quality checks. Replace with verified advertiser content before real publication.',
      languages,
      gender: normalizeProfileGender(body.gender) || optionalText(body.gender, 40),
      orientation: normalizeProfileOrientation(body.orientation) || optionalText(body.orientation, 80),
      age,
      height,
      height_cm: height,
      weight_kg: weight,
      bust: optionalText(body.bust, 40),
      eyes: optionalText(body.eyes, 40),
      hair: optionalText(body.hair, 60),
      travel: optionalText(body.travel, 120) || (travels === null ? null : travels ? 'yes' : 'no'),
      travels,
      ethnicity: normalizeProfileEthnicity(body.ethnicity) || optionalText(body.ethnicity, 80),
      penis_length_cm: optionalDecimalRange(body.penis_length_cm, 5, 35),
      penis_diameter_cm: optionalDecimalRange(body.penis_diameter_cm, 1, 10),
      nationality: optionalText(body.nationality, 80),
      zodiac_sign: optionalText(body.zodiac_sign, 40),
      business_name: optionalText(body.business_name, 160),
      business_type: businessType,
      business_phone: optionalText(body.business_phone || body.phone || body.primary_phone, 40),
      exact_address: optionalText(body.exact_address, 240),
      business_id: optionalText(body.business_id, 80),
      max_profiles: optionalInteger(body.max_profiles, 1, 30) || 30,
      contact_person: optionalText(body.contact_person, 120),
      website: optionalText(body.website, 240),
      opening_hours: normalizeOpeningHours(body.opening_hours),
      price_30min: optionalMoney(body.price_30min),
      price_1h: optionalMoney(body.price_1h) || 180,
      price_2h: optionalMoney(body.price_2h),
      price_3h: optionalMoney(body.price_3h),
      price_night: optionalMoney(body.price_night),
      currency,
      services: services.data,
      service_pricing: normalizeAdminServicePricing(body.service_pricing, services.data),
      service_menu: services.data.map((service) => ({ name: service, enabled: true, included: true, extra_price: null, note: null })),
      visit_types: Array.isArray(body.visit_types) ? body.visit_types.map((item) => String(item)).slice(0, 8) : ['incall', 'hotel'],
      service_tags: Array.isArray(body.service_tags) ? body.service_tags.map((item) => String(item)).slice(0, 16) : ['discreet', 'private-meeting'],
      verified: body.verified !== false,
      is_seed_profile: false,
      is_test_account: Boolean(body.is_test_account),
      is_sponsored: isSponsored,
      acquisition_source: isSponsored ? 'admin_sponsored' : 'paid_advertiser',
      provider: 'manual_admin',
      revenue_amount: 0,
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
      listing_price: isSponsored ? 0 : optionalMoney(body.listing_price) ?? optionalMoney(body.price_1h) ?? 0,
      listing_currency: currency,
      max_photos: 6,
      latitude: optionalCoordinate(body.latitude, -90, 90),
      longitude: optionalCoordinate(body.longitude, -180, 180),
      location_mode: ['exact_hidden', 'approximate', 'city_only'].includes(String(body.location_mode || 'city_only')) ? String(body.location_mode || 'city_only') : 'city_only',
      location_visibility: normalizeAdminLocationVisibility(body.location_visibility || body.location_mode),
      service_radius_km: optionalInteger(body.service_radius_km, 1, 100) || 25,
      moderation_status: allowedModerationStatuses.includes(String(body.moderation_status || 'approved')) ? String(body.moderation_status || 'approved') : 'approved',
      moderation_note: optionalText(body.moderation_note, 2000),
      suspended_reason: optionalText(body.suspended_reason, 1000),
      ...operatorStatusPatch(operatorStatus)
    }
  };
}

function normalizeAdminOperatorStatus(value: unknown) {
  const status = normalizeOperatorStatus(value);
  return operatorStatuses.includes(status) ? status : 'OFFLINE';
}

function normalizeAdminCategory(value: unknown) {
  const category = normalizeProfileCategory(value || 'ladies');
  return ['ladies', 'men', 'gay', 'couples', 'trans', 'massage', 'home_hotel', 'live_cam', 'clubs_parties', 'bdsm', 'onlyfans', 'sex_phone', 'films', 'offers', 'other'].includes(category) ? category : 'ladies';
}

function normalizeBusinessType(value: unknown) {
  const type = String(value || '').trim().toLowerCase();
  if (['brothel', 'massage_salon', 'agency'].includes(type)) return type;
  return type || null;
}

function normalizeAdminAccountType(value: unknown) {
  const accountType = String(value || 'escort');
  return ['escort', 'business', 'private', 'agency', 'massage_salon', 'club_party', 'live_cam'].includes(accountType) ? accountType : 'escort';
}

function normalizeAdminProfileType(value: unknown) {
  const profileType = String(value || 'private_escort');
  return ['private_escort', 'agency', 'club', 'massage_salon', 'live_cam', 'couple', 'trans', 'gay', 'male_escort', 'other'].includes(profileType) ? profileType : 'private_escort';
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
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(Math.max(Math.round(number), min), max);
}

function optionalMoney(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100) / 100;
}

function normalizeAdminServicePricing(value: unknown, selectedServices: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const selected = new Set(selectedServices);
  return Object.fromEntries(Object.entries(value as Record<string, any>)
    .filter(([key]) => selected.has(key))
    .map(([key, raw]) => {
      const item = raw && typeof raw === 'object' ? raw : {};
      const mode = item.mode === 'extra' ? 'extra' : 'included';
      return [key, { mode, extra_price: mode === 'extra' ? optionalMoney(item.extra_price) : null }];
    }));
}

function normalizeAdminLocationVisibility(value: unknown) {
  const mode = String(value || 'postal_area');
  if (['exact', 'postal_area', 'city_only', 'hidden'].includes(mode)) return mode;
  if (mode === 'exact_hidden') return 'hidden';
  if (mode === 'approximate') return 'postal_area';
  return 'postal_area';
}

function optionalCoordinate(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(Math.max(number, min), max);
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
    .sort((left: any, right: any) => {
      if (Boolean(left.is_cover) !== Boolean(right.is_cover)) return left.is_cover ? -1 : 1;
      const sortDiff = Number(left.sort_order || 0) - Number(right.sort_order || 0);
      if (sortDiff !== 0) return sortDiff;
      return new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime();
    });
  return { ...profile, profile_images: images, images };
}

function withPublicImageUrl(image: any) {
  const { data } = supabaseAdmin.storage.from(config.storageBucket).getPublicUrl(image.storage_path);
  return {
    ...image,
    public_url: data.publicUrl,
    url: data.publicUrl,
    image_url: data.publicUrl,
    is_cover: Boolean(image.is_primary),
    is_hidden: Boolean(image.is_hidden),
    is_private: Boolean(image.is_private),
    moderation_status: image.moderation_status || 'approved',
    sort_order: Number(image.sort_order || 0)
  };
}

async function withAdminPhotoRow(image: any) {
  const hydrated = withPublicImageUrl(image);
  const signed = image.storage_path
    ? await supabaseAdmin.storage.from(config.storageBucket).createSignedUrl(image.storage_path, 60 * 60).catch(() => ({ data: null }))
    : { data: null };
  const profile = image.profiles || {};
  const imageType = image.is_avatar ? 'avatar' : image.is_primary || image.is_cover ? 'cover' : 'gallery';
  return {
    ...hydrated,
    signed_url: signed.data?.signedUrl || null,
    image_url: signed.data?.signedUrl || hydrated.image_url,
    url: signed.data?.signedUrl || hydrated.url,
    profile_id: image.profile_id,
    profile_display_name: profile.display_name || '',
    owner_email: profile.owner_email || '',
    city: profile.city || '',
    image_type: imageType
  };
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
    amount_eur: 0,
    currency: profile.currency || profile.listing_currency || 'EUR',
    payment_status: null,
    transaction_type: subscriptionTransactionType(profile),
    livemode: false,
    current_period_start: start,
    current_period_end: end,
    managed_by: managedBy || profile.subscription_managed_by || null,
    admin_note: profile.subscription_note || null,
    metadata: {
      source: 'admin_profile_studio',
      acquisition_source: profile.acquisition_source || (profile.is_sponsored ? 'admin_sponsored' : null),
      is_sponsored: Boolean(profile.is_sponsored),
      profile_type: profile.profile_type || null,
      is_seed_profile: Boolean(profile.is_seed_profile)
    }
  };

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(payload, { onConflict: 'profile_id' });
  if (error) throw new Error(error.message);
}

function starterPackagePatch(value: unknown, accountType: string): Record<string, any> {
  const starterPackage = String(value || 'trial_30').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const now = new Date();
  const premiumPlan = accountType === 'business' ? 'business_monthly' : 'escort_monthly';
  const addDays = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const base = {
    subscription_start: now.toISOString(),
    subscription_started_at: now.toISOString(),
    subscription_managed_by: 'manual_admin'
  };
  if (['free', 'inactive'].includes(starterPackage)) {
    return { ...base, subscription_status: 'free', subscription_end: null, subscription_expires_at: null, listing_plan: 'free', subscription_plan: 'free', premium_tier: 'standard', is_published: false };
  }
  if (['trial_7', 'trial_7_days'].includes(starterPackage)) {
    return { ...base, subscription_status: 'trial', subscription_end: addDays(7), subscription_expires_at: addDays(7), listing_plan: 'trial_7', subscription_plan: 'trial_7', premium_tier: 'standard' };
  }
  if (['premium_30', 'premium_30_days'].includes(starterPackage)) {
    return { ...base, subscription_status: 'active', subscription_end: addDays(30), subscription_expires_at: addDays(30), listing_plan: premiumPlan, subscription_plan: premiumPlan, premium_tier: 'gold' };
  }
  if (['vip_30', 'vip_30_days'].includes(starterPackage)) {
    return { ...base, subscription_status: 'active', subscription_end: addDays(30), subscription_expires_at: addDays(30), listing_plan: `${premiumPlan}_vip`, subscription_plan: `${premiumPlan}_vip`, premium_tier: 'diamond' };
  }
  if (starterPackage === 'lifetime') {
    const lifetimeEnd = '2099-12-31T23:59:59.000Z';
    return { ...base, subscription_status: 'active', subscription_end: lifetimeEnd, subscription_expires_at: lifetimeEnd, listing_plan: `${premiumPlan}_lifetime`, subscription_plan: `${premiumPlan}_lifetime`, premium_tier: 'diamond' };
  }
  return { ...base, subscription_status: 'trial', subscription_end: addDays(30), subscription_expires_at: addDays(30), listing_plan: 'trial_30', subscription_plan: 'trial_30', premium_tier: 'standard' };
}

async function findAuthUserByEmail(emailValue: unknown) {
  const email = optionalEmail(emailValue);
  if (!email) return null;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const user = data.users.find((item) => item.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function findProfileByOwnerEmail(emailValue: unknown) {
  const email = optionalEmail(emailValue);
  if (!email) return null;
  const { data } = await supabaseAdmin.from('profiles').select('id, user_id, owner_email').ilike('owner_email', email).limit(1).maybeSingle();
  return data || null;
}

async function resolveAdminProfileUser(input: { email: string; password: string | null; accountType: string; plan: string; subscriptionStatus: string }) {
  const email = optionalEmail(input.email);
  if (!email) throw new Error('Valid owner email is required');
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    const { data: linkedProfile } = await supabaseAdmin.from('profiles').select('id').eq('user_id', existing.id).limit(1).maybeSingle();
    if (linkedProfile) throw new Error('User already exists and is linked to another profile');
    await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      app_metadata: {
        ...(existing.app_metadata || {}),
        auth_account_type: input.accountType,
        plan: input.plan,
        subscription_status: input.subscriptionStatus
      }
    });
    return { user: existing, created: false };
  }
  if (!input.password) return { user: null, created: false };
  if (input.password.length < 8) throw new Error('Password must contain at least 8 characters');
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    app_metadata: {
      auth_account_type: input.accountType,
      plan: input.plan,
      subscription_status: input.subscriptionStatus
    }
  });
  if (error || !data.user) throw new Error(error?.message || 'Could not create login account');
  return { user: data.user, created: true };
}

type ResolvedProfileAuthUser =
  | { profile: Record<string, any>; user: any }
  | { error: string; status: number };

type AdminProfileAuthTarget =
  | { profileId: string; userId: string; email: string; profile: Record<string, any> }
  | { error: string; status: number; profile: Record<string, any> };

async function getAdminProfileAuthTarget(profileId: string): Promise<AdminProfileAuthTarget> {
  const { data: profile, error } = await supabaseAdmin.from('profiles').select('id, user_id, owner_email').eq('id', profileId).single();
  if (error || !profile) return { error: 'profile_not_found', status: 404, profile: { id: profileId, user_id: null, owner_email: null } };
  const target = await resolveProfileAuthUser(profile);
  if ('error' in target) return { ...target, profile };
  if (!target.user.email) return { error: 'owner_email_required', status: 400, profile };
  return { profileId: target.profile.id, userId: target.user.id, email: target.user.email, profile: target.profile };
}

async function resolveProfileAuthUser(profile: Record<string, any>): Promise<ResolvedProfileAuthUser> {
  const email = optionalEmail(profile.owner_email);
  if (profile.user_id) {
    const result = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
    if (result.data.user) return { profile, user: result.data.user };
  }
  if (!email) return { error: 'owner_email_required', status: 400 };
  const user = await findAuthUserByEmail(email);
  if (!user) return { error: 'auth_user_missing', status: 409 };
  const { data: linkedProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .neq('id', profile.id)
    .limit(1)
    .maybeSingle();
  if (linkedProfile) return { error: 'auth_user_linked_elsewhere', status: 409 };
  const { data: updatedProfile, error } = await supabaseAdmin
    .from('profiles')
    .update({ user_id: user.id, owner_email: user.email || email })
    .eq('id', profile.id)
    .select('*, profile_images(*)')
    .single();
  if (error) return { error: error.message, status: 400 };
  return { profile: updatedProfile, user };
}

function buildAdminEmailFallback(type: 'login' | 'reset', email: string, link: string) {
  const login = type === 'login';
  const subject = login ? 'Escort Radar - login access' : 'Escort Radar - password reset';
  const emailBody = login
    ? `Hello,\n\nUse this secure link to sign in to your Escort Radar account:\n${link}\n\nDo not share this link with anyone.`
    : `Hello,\n\nUse this secure link to set a new password for your Escort Radar account:\n${link}\n\nIf you did not request this change, contact support.`;
  return {
    sent: false,
    provider: null,
    email_to: email,
    subject,
    email_body: emailBody,
    link,
    reason: 'mail_provider_not_configured'
  };
}

function logAdminAccount(action: string, profile: Record<string, any> | null | undefined, result: string) {
  console.info(
    `[admin account] action=${action} profile_id=${profile?.id || '-'} has_user_id=${Boolean(profile?.user_id)} owner_email=${profile?.owner_email || '-'} ${result}`
  );
}

async function logAccountAccess(req: any, profileId: string, userId: string, action: string) {
  const ip = String(req.ip || req.headers?.['x-forwarded-for'] || '').slice(0, 200) || null;
  const userAgent = optionalText(req.headers?.['user-agent'], 500);
  const { error } = await supabaseAdmin.from('account_access_logs').insert({
    user_id: userId,
    profile_id: profileId,
    action,
    ip,
    user_agent: userAgent
  });
  if (error) console.info('[account access log] skipped reason=', error.message);
}

async function parseProfileImport(file: Express.Multer.File) {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.csv') || file.mimetype.includes('csv')) return parseCsv(file.buffer.toString('utf8'));
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  }
  throw new Error('Unsupported import format. Use CSV or XLSX.');
}

function parseCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  const headers = (rows.shift() || []).map((header) => header.trim().toLowerCase());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ''])));
}

function normalizeImportRow(input: Record<string, unknown>): Record<string, any> {
  const booleanValue = (value: unknown) => ['1', 'true', 'yes', 'y', 'tak', 'ja'].includes(String(value || '').trim().toLowerCase());
  return {
    ...input,
    email: String(input.email || '').trim().toLowerCase(),
    owner_email: String(input.email || '').trim().toLowerCase(),
    display_name: String(input.display_name || '').trim(),
    phone: String(input.phone || '').trim(),
    work_country: String(input.country || input.work_country || 'DE').trim(),
    work_city: String(input.city || input.work_city || 'Berlin').trim(),
    city: String(input.city || 'berlin').trim().toLowerCase(),
    work_area: String(input.area || input.work_area || '').trim(),
    services: String(input.services || '').split(/[;,|]/).map((item) => item.trim()).filter(Boolean),
    price_1h: Number(input.price_1h || 0),
    published: booleanValue(input.published),
    verified: booleanValue(input.verified)
  };
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
