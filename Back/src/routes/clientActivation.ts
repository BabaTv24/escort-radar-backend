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

clientActivationRouter.get('/me', asyncHandler(async (req, res) => {
  await recordClientRegistrationAttribution(req.user!.id);
  const [activation, wallet, transactions, sentGifts, receivedGifts] = await Promise.all([
    getClientActivationSummary(req.user!.id),
    getOrCreateCoinWallet(req.user!.id),
    supabaseAdmin
      .from('coin_transactions')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabaseAdmin
      .from('gifts')
      .select('*, profiles(display_name)')
      .eq('sender_user_id', req.user!.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('gifts')
      .select('*, profiles(display_name)')
      .eq('receiver_user_id', req.user!.id)
      .order('created_at', { ascending: false })
      .limit(50)
  ]);

  res.json({
    activation,
    wallet,
    transactions: transactions.data || [],
    gifts_sent: sentGifts.data || [],
    gifts_received: receivedGifts.data || []
  });
}));

clientActivationRouter.post('/checkout', asyncHandler(async (req, res) => {
  if (!config.stripeSecretKey) return res.status(503).json({ error: 'Stripe is not configured' });

  const referredByCode = optionalText(req.body.referred_by_code, 80);
  const params = new URLSearchParams({
    mode: 'payment',
    success_url: `${config.frontendUrl}/dashboard?activation_session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.frontendUrl}/dashboard?activation_cancelled=1`,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(config.clientActivationPriceCents),
    'line_items[0][price_data][product_data][name]': 'Escort Radar Client Activation',
    'metadata[user_id]': req.user!.id,
    'metadata[purpose]': 'client_activation',
    'metadata[referred_by_code]': referredByCode || ''
  });

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });
  const payload = await response.json() as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !payload.url) return res.status(400).json({ error: payload.error?.message || 'Stripe checkout failed' });

  res.status(201).json({ checkout_session_id: payload.id, checkout_url: payload.url });
}));

clientActivationRouter.post('/confirm', asyncHandler(async (req, res) => {
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
    provider: 'stripe',
    stripe_session_id: stripeSessionId,
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
