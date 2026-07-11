import { Router } from 'express';
import { config } from '../config.js';
import { requireAdmin, verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler, optionalText } from '../validation.js';
import {
  activateClientAccount,
  deactivateClientAccount,
  getClientActivationSummary,
  getOrCreateCoinWallet,
  grantCoins,
  recordClientRegistrationAttribution
} from '../services/clientActivation.js';
import { createStripeCheckoutSession, sendStripeError } from '../services/stripePayments.js';
import { bcuToBc, getBcuLedgerForUser, getBcuWalletForUser, getUserEntitlements } from '../services/bcuWallet.js';

export const clientActivationRouter = Router();

clientActivationRouter.post('/referral-click', asyncHandler(async (req, res) => {
  const referralCode = optionalText(req.body.referral_code || req.body.ref, 80);
  if (!referralCode) return res.status(400).json({ error: 'referral_code is required' });

  const { data: referral } = await supabaseAdmin
    .from('client_referrals')
    .select('*')
    .eq('referral_code', referralCode)
    .maybeSingle();

  await supabaseAdmin.from('referral_clicks').insert({
    referral_code: referralCode,
    referrer_user_id: referral?.user_id || null,
    ip_hash: hashValue(req.ip || ''),
    user_agent: optionalText(req.headers['user-agent'], 500),
    landing_path: optionalText(req.body.landing_path, 500)
  });

  if (referral) {
    await supabaseAdmin
      .from('client_referrals')
      .update({ click_count: Number(referral.click_count || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', referral.id);
  }

  res.status(201).json({ ok: true });
}));

clientActivationRouter.use(verifyUser);

clientActivationRouter.get('/dashboard', asyncHandler(async (req, res) => {
  await recordClientRegistrationAttribution(req.user!.id);
  if (config.bcuWalletEnabled) {
    const [activation, wallet, entitlements, ledger] = await Promise.all([
      getClientActivationSummary(req.user!.id),
      getBcuWalletForUser(req.user!.id),
      getUserEntitlements(req.user!.id),
      getBcuLedgerForUser(req.user!.id, 100, 0)
    ]);
    const premiumEntitlement = entitlements.find((item) => item.entitlement_type === 'client_premium') || null;
    return res.json({
      wallet_system: 'bcu',
      activation: {
        state: activation.state,
        activated_at: activation.activated_at
      },
      premium_entitlement: premiumEntitlement ? {
        entitlement_type: premiumEntitlement.entitlement_type,
        status: premiumEntitlement.status,
        starts_at: premiumEntitlement.starts_at,
        ends_at: premiumEntitlement.ends_at,
        product_code: premiumEntitlement.product_code
      } : null,
      wallet: wallet ? {
        public_wallet_id: wallet.public_wallet_id,
        balance_bcu: wallet.balance_bcu,
        balance_bc: bcuToBc(wallet.balance_bcu),
        lifetime_credit_bcu: wallet.lifetime_credit_bcu,
        lifetime_credit_bc: bcuToBc(wallet.lifetime_credit_bcu),
        lifetime_debit_bcu: wallet.lifetime_debit_bcu,
        lifetime_debit_bc: bcuToBc(wallet.lifetime_debit_bcu),
        frozen: wallet.frozen,
        created_at: wallet.created_at,
        updated_at: wallet.updated_at
      } : null,
      ledger: ledger.map((entry) => ({
        amount_bcu: entry.amount_bcu,
        amount_bc: bcuToBc(entry.amount_bcu),
        direction: entry.direction,
        transaction_type: entry.transaction_type,
        status: entry.status,
        created_at: entry.created_at
      })),
      referral: {
        referral_code: activation.referral_code,
        referral_link: activation.referral_link,
        qr_image_url: activation.qr_image_url,
        clicks: activation.clicks,
        registrations: activation.registrations,
        activations: activation.activations,
        earned_rewards: activation.earned_rewards
      }
    });
  }

  const legacy = await loadLegacyClientActivationDashboard(req.user!.id);
  return res.json({ wallet_system: 'legacy', ...legacy });
}));

clientActivationRouter.get('/me', asyncHandler(async (req, res) => {
  await recordClientRegistrationAttribution(req.user!.id);
  const legacy = await loadLegacyClientActivationDashboard(req.user!.id);
  res.json(legacy);
}));

async function loadLegacyClientActivationDashboard(userId: string) {
  const [activation, wallet, transactions, sentGifts, receivedGifts] = await Promise.all([
    getClientActivationSummary(userId),
    getOrCreateCoinWallet(userId),
    supabaseAdmin
      .from('coin_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabaseAdmin
      .from('gifts')
      .select('*, profiles(display_name)')
      .eq('sender_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('gifts')
      .select('*, profiles(display_name)')
      .eq('receiver_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
  ]);

  return {
    activation,
    wallet,
    transactions: transactions.data || [],
    gifts_sent: sentGifts.data || [],
    gifts_received: receivedGifts.data || []
  };
}

clientActivationRouter.post('/checkout', asyncHandler(async (req, res) => {
  if (!config.stripeEnabled || !config.stripeEscortRadarEnabled) return res.status(410).json({ error: 'Stripe checkout is disabled for Escort Radar. Use manual payment orders.' });
  try {
    const checkout = await createStripeCheckoutSession({
      userId: req.user!.id,
      email: req.user!.email,
      transactionType: 'client_activation',
      referredByCode: optionalText(req.body.referred_by_code, 80)
    });
    res.status(201).json(checkout);
  } catch (error) {
    sendStripeError(res, error);
  }
}));

clientActivationRouter.post('/confirm', asyncHandler(async (req, res) => {
  if (!config.stripeEnabled || !config.stripeEscortRadarEnabled) return res.status(410).json({ error: 'Stripe checkout is disabled for Escort Radar. Use manual payment orders.' });
  if (!config.stripeSecretKey) return res.status(503).json({ error: 'Stripe is not configured' });
  const sessionId = optionalText(req.body.checkout_session_id || req.body.session_id, 200);
  if (!sessionId) return res.status(400).json({ error: 'checkout_session_id is required' });

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${config.stripeSecretKey}` }
  });
  const session = await response.json() as Record<string, any>;
  if (!response.ok) return res.status(400).json({ error: session.error?.message || 'Stripe session lookup failed' });
  if (session.metadata?.user_id !== req.user!.id || session.metadata?.purpose !== 'client_activation') {
    return res.status(403).json({ error: 'Checkout session does not belong to this user' });
  }
  if (session.payment_status !== 'paid') return res.status(400).json({ error: 'Payment is not completed' });

  const stripeSessionId = String(session.id || sessionId);
  const { data: existingPayment } = await supabaseAdmin
    .from('client_activation_payments')
    .select('id')
    .eq('stripe_session_id', stripeSessionId)
    .maybeSingle();

  if (existingPayment) {
    if (config.bcuWalletEnabled) {
      await activateClientAccount(req.user!.id, {
        stripe_checkout_session_id: stripeSessionId,
        stripe_payment_intent_id: session.payment_intent ? String(session.payment_intent) : null,
        referred_by_code: optionalText(session.metadata?.referred_by_code, 80)
      });
    }
    return res.json({ activation: await getClientActivationSummary(req.user!.id) });
  }

  await activateClientAccount(req.user!.id, {
    stripe_checkout_session_id: stripeSessionId,
    stripe_payment_intent_id: session.payment_intent ? String(session.payment_intent) : null,
    referred_by_code: optionalText(session.metadata?.referred_by_code, 80)
  });

  const { error: paymentError } = await supabaseAdmin.from('client_activation_payments').insert({
    user_id: req.user!.id,
    email: req.user?.email || null,
    amount_cents: Number(session.amount_total || config.clientActivationPriceCents),
    currency: String(session.currency || 'eur').toLowerCase(),
    status: 'paid',
    payment_status: 'paid',
    transaction_type: 'client_activation',
    provider: 'stripe',
    stripe_session_id: stripeSessionId,
    stripe_checkout_session_id: stripeSessionId,
    livemode: session.livemode,
    stripe_payment_intent_id: session.payment_intent ? String(session.payment_intent) : null
  });
  if (paymentError && paymentError.code !== '23505') return res.status(400).json({ error: paymentError.message });

  res.json({ activation: await getClientActivationSummary(req.user!.id) });
}));

clientActivationRouter.post('/gifts', asyncHandler(async (req, res) => {
  const profileId = optionalText(req.body.profile_id, 80);
  const giftType = optionalText(req.body.gift_type, 80) || 'rose';
  const coinCost = Number(req.body.coin_cost || 10);
  if (!profileId || !Number.isFinite(coinCost) || coinCost <= 0) return res.status(400).json({ error: 'profile_id and coin_cost are required' });

  const activation = await getClientActivationSummary(req.user!.id);
  if (activation.state !== 'client_activated') return res.status(403).json({ error: 'Client activation required' });

  const { data: profile } = await supabaseAdmin.from('profiles').select('id, user_id').eq('id', profileId).single();
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const wallet = await getOrCreateCoinWallet(req.user!.id);
  await grantCoins(wallet.id, req.user!.id, -coinCost, 'gift_sent', { profile_id: profileId, gift_type: giftType });

  const { data: gift, error } = await supabaseAdmin
    .from('gifts')
    .insert({
      sender_user_id: req.user!.id,
      receiver_profile_id: profileId,
      receiver_user_id: profile.user_id,
      gift_type: giftType,
      coin_cost: coinCost,
      message: optionalText(req.body.message, 500)
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  res.status(201).json({ gift });
}));

clientActivationRouter.post('/vip-gallery-unlocks', asyncHandler(async (req, res) => {
  const profileId = optionalText(req.body.profile_id, 80);
  const coinCost = Number(req.body.coin_cost || 25);
  if (!profileId || !Number.isFinite(coinCost) || coinCost < 0) return res.status(400).json({ error: 'profile_id and coin_cost are required' });

  const activation = await getClientActivationSummary(req.user!.id);
  if (activation.state !== 'client_activated') return res.status(403).json({ error: 'Client activation required' });

  const wallet = await getOrCreateCoinWallet(req.user!.id);
  if (coinCost > 0) await grantCoins(wallet.id, req.user!.id, -coinCost, 'vip_gallery_unlock', { profile_id: profileId });

  const { data, error } = await supabaseAdmin
    .from('vip_gallery_unlocks')
    .upsert({
      user_id: req.user!.id,
      profile_id: profileId,
      coin_cost: coinCost,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }, { onConflict: 'user_id,profile_id' })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ unlock: data });
}));

clientActivationRouter.patch('/admin/users/:userId/activation', requireAdmin, asyncHandler(async (req, res) => {
  const state = String(req.body.state || '');
  if (state === 'client_activated') await activateClientAccount(req.params.userId);
  else if (state === 'client_free') await deactivateClientAccount(req.params.userId);
  else return res.status(400).json({ error: 'Invalid activation state' });
  res.json({ activation: await getClientActivationSummary(req.params.userId) });
}));

clientActivationRouter.patch('/admin/users/:userId/coins', requireAdmin, asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: 'amount is required' });
  const wallet = await getOrCreateCoinWallet(req.params.userId);
  await grantCoins(wallet.id, req.params.userId, amount, amount > 0 ? 'admin_credit' : 'admin_debit', {
    note: optionalText(req.body.note, 1000)
  }, req.user?.email);
  res.json({ wallet: await getOrCreateCoinWallet(req.params.userId) });
}));

clientActivationRouter.get('/admin/referral-stats', requireAdmin, asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('client_referrals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ referrals: data || [] });
}));

function hashValue(value: string) {
  if (!value) return null;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  }
  return String(hash);
}
