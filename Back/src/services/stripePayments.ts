import crypto from 'node:crypto';
import type { Response } from 'express';
import { config } from '../config.js';
import { supabaseAdmin } from '../supabase.js';
import { activateClientAccount, getOrCreateCoinWallet, grantCoins } from './clientActivation.js';
import { coinPackages, escortRadarStripeApp, getCoinPackage, getStripePlan, type StripeTransactionType } from '../stripeProducts.js';

type CheckoutInput = {
  userId: string;
  email?: string;
  transactionType: StripeTransactionType;
  profileId?: string | null;
  businessId?: string | null;
  coinPackageId?: string | null;
  referredByCode?: string | null;
};

type StripeEvent = {
  id: string;
  type: string;
  livemode?: boolean;
  data: { object: Record<string, any> };
};

export const supportedStripeWebhookEvents = [
  'checkout.session.completed',
  'payment_intent.succeeded',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted'
];

export function assertStripeCheckoutReady(priceId: string) {
  if (!config.stripeEnabled || !config.stripeEscortRadarEnabled) {
    const error = new Error('Stripe checkout is disabled for Escort Radar');
    Object.assign(error, { statusCode: 410 });
    throw error;
  }
  if (!config.stripeSecretKey) {
    const error = new Error('Stripe is not configured');
    Object.assign(error, { statusCode: 503 });
    throw error;
  }
  if (!priceId) {
    const error = new Error('Missing Stripe price id');
    Object.assign(error, { statusCode: 503 });
    throw error;
  }
}

export function buildCheckoutMetadata(input: CheckoutInput) {
  const plan = getStripePlan({ transactionType: input.transactionType, coinPackageId: input.coinPackageId || undefined });
  return {
    app: escortRadarStripeApp,
    user_id: input.userId,
    email: input.email || '',
    transaction_type: plan.transaction_type,
    plan: plan.plan,
    amount_cents: String(plan.amount_cents),
    currency: plan.currency,
    profile_id: input.profileId || '',
    business_id: input.businessId || '',
    coins_amount: String('coins_amount' in plan ? plan.coins_amount || 0 : 0),
    referred_by_code: input.referredByCode || ''
  };
}

export function buildCheckoutParams(input: CheckoutInput) {
  const plan = getStripePlan({ transactionType: input.transactionType, coinPackageId: input.coinPackageId || undefined });
  const metadata = buildCheckoutMetadata(input);
  assertStripeCheckoutReady(plan.price_id);

  const successParam = input.transactionType === 'client_activation'
    ? 'activation_session_id'
    : 'stripe_session_id';
  const successUrl = `${config.frontendUrl}/dashboard?${successParam}={CHECKOUT_SESSION_ID}&payment=${encodeURIComponent(plan.transaction_type)}`;
  const cancelUrl = `${config.frontendUrl}/dashboard?payment_cancelled=${encodeURIComponent(plan.transaction_type)}`;
  const params = new URLSearchParams({
    mode: plan.mode,
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: input.email || '',
    client_reference_id: input.userId,
    'line_items[0][quantity]': '1',
    'line_items[0][price]': plan.price_id
  });

  Object.entries(metadata).forEach(([key, value]) => {
    params.set(`metadata[${key}]`, value);
    if (plan.mode === 'subscription') params.set(`subscription_data[metadata][${key}]`, value);
    if (plan.mode === 'payment') params.set(`payment_intent_data[metadata][${key}]`, value);
  });

  return { params, metadata, plan };
}

export async function createStripeCheckoutSession(input: CheckoutInput) {
  const { params } = buildCheckoutParams(input);
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });
  const payload = await response.json() as Record<string, any>;
  if (!response.ok || !payload.url) {
    const error = new Error(payload.error?.message || 'Stripe checkout failed');
    Object.assign(error, { statusCode: 400 });
    throw error;
  }
  return {
    checkout_session_id: String(payload.id || ''),
    checkout_url: String(payload.url)
  };
}

export function verifyStripeWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined) {
  if (!config.stripeEnabled || !config.stripeEscortRadarEnabled) throw new Error('Stripe webhook is disabled for Escort Radar');
  if (!config.stripeWebhookSecret) throw new Error('Stripe webhook is not configured');
  if (!signatureHeader) throw new Error('Missing Stripe signature');
  const parts = Object.fromEntries(signatureHeader.split(',').map((part) => {
    const [key, value] = part.split('=');
    return [key, value];
  }));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error('Invalid Stripe signature');

  const expected = crypto
    .createHmac('sha256', config.stripeWebhookSecret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const signatureBuffer = Buffer.from(signature, 'hex');
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    throw new Error('Invalid Stripe signature');
  }
}

export async function handleStripeWebhook(rawBody: Buffer, signatureHeader: string | undefined) {
  verifyStripeWebhookSignature(rawBody, signatureHeader);
  const event = JSON.parse(rawBody.toString('utf8')) as StripeEvent;
  const object = event.data.object || {};
  const metadata = readMetadata(object);
  if (metadata.app !== escortRadarStripeApp) return { ignored: true, event_id: event.id };

  const inserted = await insertStripePaymentEvent(event, object, metadata);
  if (!inserted) return { duplicate: true, event_id: event.id };

  if (event.type === 'checkout.session.completed') await handleCheckoutCompleted(object, metadata);
  if (event.type === 'payment_intent.succeeded') await handlePaymentIntentSucceeded(object, metadata);
  if (event.type === 'invoice.payment_succeeded') await handleInvoicePaymentSucceeded(object, metadata);
  if (event.type === 'invoice.payment_failed') await handleInvoicePaymentFailed(object, metadata);
  if (event.type.startsWith('customer.subscription.')) await handleSubscriptionEvent(event.type, object, metadata);

  return { received: true, event_id: event.id };
}

export function sendStripeError(res: Response, error: unknown) {
  const statusCode = Number((error as any)?.statusCode || 500);
  res.status(statusCode).json({ error: error instanceof Error ? error.message : 'Stripe request failed' });
}

function readMetadata(object: Record<string, any>) {
  const direct = object.metadata && typeof object.metadata === 'object' ? object.metadata : {};
  const subscriptionDetails = object.subscription_details?.metadata && typeof object.subscription_details.metadata === 'object' ? object.subscription_details.metadata : {};
  return { ...subscriptionDetails, ...direct } as Record<string, string>;
}

async function insertStripePaymentEvent(event: StripeEvent, object: Record<string, any>, metadata: Record<string, string>) {
  const amountCents = Number(object.amount_total ?? object.amount_paid ?? object.amount_received ?? metadata.amount_cents ?? 0);
  const stripeSubscriptionId = stringOrNull(object.subscription || object.id && String(object.object) === 'subscription' ? object.id : null);
  const stripePaymentIntentId = stringOrNull(object.payment_intent || object.id && String(object.object) === 'payment_intent' ? object.id : null);
  const row = {
    stripe_event_id: event.id,
    event_type: event.type,
    user_id: metadata.user_id || null,
    email: metadata.email || object.customer_email || object.customer_details?.email || null,
    provider: 'stripe',
    transaction_type: metadata.transaction_type || null,
    plan: metadata.plan || null,
    profile_id: metadata.profile_id || null,
    business_id: metadata.business_id || null,
    coins_amount: Number(metadata.coins_amount || 0) || null,
    amount_cents: amountCents || null,
    amount_eur: amountCents ? amountCents / 100 : null,
    currency: String(object.currency || metadata.currency || 'eur').toLowerCase(),
    payment_status: object.payment_status || object.status || (event.type.endsWith('succeeded') ? 'paid' : null),
    status: object.status || object.payment_status || null,
    stripe_checkout_session_id: stringOrNull(object.id && String(object.object) === 'checkout.session' ? object.id : object.checkout_session),
    stripe_payment_intent_id: stripePaymentIntentId,
    stripe_subscription_id: stripeSubscriptionId,
    stripe_customer_id: stringOrNull(object.customer),
    livemode: Boolean(event.livemode ?? object.livemode),
    metadata: { stripe_object: object.object, raw_metadata: metadata }
  };

  const { error } = await supabaseAdmin.from('stripe_payment_events').insert(row);
  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
}

async function handleCheckoutCompleted(session: Record<string, any>, metadata: Record<string, string>) {
  if (metadata.transaction_type === 'client_activation' && session.payment_status === 'paid') {
    await recordClientActivation(session, metadata);
  }
  if (metadata.transaction_type === 'coins_purchase' && session.payment_status === 'paid') {
    await recordCoinsPurchase(session, metadata);
  }
  if (['escort_subscription', 'business_subscription'].includes(metadata.transaction_type)) {
    await upsertStripeSubscription({
      subscriptionId: stringOrNull(session.subscription),
      customerId: stringOrNull(session.customer),
      status: 'active',
      metadata,
      livemode: Boolean(session.livemode)
    });
  }
}

async function handlePaymentIntentSucceeded(intent: Record<string, any>, metadata: Record<string, string>) {
  if (metadata.transaction_type === 'client_activation') await recordClientActivation(intent, metadata);
  if (metadata.transaction_type === 'coins_purchase') await recordCoinsPurchase(intent, metadata);
}

async function handleInvoicePaymentSucceeded(invoice: Record<string, any>, metadata: Record<string, string>) {
  if (!['escort_subscription', 'business_subscription'].includes(metadata.transaction_type)) return;
  await upsertStripeSubscription({
    subscriptionId: stringOrNull(invoice.subscription),
    customerId: stringOrNull(invoice.customer),
    status: 'active',
    metadata,
    livemode: Boolean(invoice.livemode),
    periodStart: invoice.lines?.data?.[0]?.period?.start ? unixToIso(invoice.lines.data[0].period.start) : null,
    periodEnd: invoice.lines?.data?.[0]?.period?.end ? unixToIso(invoice.lines.data[0].period.end) : null
  });
}

async function handleInvoicePaymentFailed(invoice: Record<string, any>, metadata: Record<string, string>) {
  if (!['escort_subscription', 'business_subscription'].includes(metadata.transaction_type)) return;
  await upsertStripeSubscription({
    subscriptionId: stringOrNull(invoice.subscription),
    customerId: stringOrNull(invoice.customer),
    status: 'past_due',
    metadata,
    livemode: Boolean(invoice.livemode)
  });
}

async function handleSubscriptionEvent(eventType: string, subscription: Record<string, any>, fallbackMetadata: Record<string, string>) {
  const metadata = { ...fallbackMetadata, ...readMetadata(subscription) };
  if (!['escort_subscription', 'business_subscription'].includes(metadata.transaction_type)) return;
  const deleted = eventType === 'customer.subscription.deleted';
  await upsertStripeSubscription({
    subscriptionId: stringOrNull(subscription.id),
    customerId: stringOrNull(subscription.customer),
    status: deleted ? 'cancelled' : String(subscription.status || 'active'),
    metadata,
    livemode: Boolean(subscription.livemode),
    periodStart: subscription.current_period_start ? unixToIso(subscription.current_period_start) : null,
    periodEnd: subscription.current_period_end ? unixToIso(subscription.current_period_end) : null,
    cancelledAt: subscription.cancel_at || subscription.canceled_at ? unixToIso(subscription.cancel_at || subscription.canceled_at) : null
  });
}

async function recordClientActivation(object: Record<string, any>, metadata: Record<string, string>) {
  const userId = metadata.user_id;
  if (!userId) return;
  const stripeCheckoutSessionId = stringOrNull(object.object === 'checkout.session' ? object.id : object.checkout_session);
  const stripePaymentIntentId = stringOrNull(object.payment_intent || object.id && object.object === 'payment_intent' ? object.id : null);
  await activateClientAccount(userId, {
    stripe_checkout_session_id: stripeCheckoutSessionId,
    stripe_payment_intent_id: stripePaymentIntentId,
    referred_by_code: metadata.referred_by_code || null
  });
  await supabaseAdmin.from('client_activation_payments').upsert({
    user_id: userId,
    email: metadata.email || object.customer_email || object.receipt_email || null,
    amount_cents: Number(object.amount_total ?? object.amount_received ?? metadata.amount_cents ?? 99),
    currency: String(object.currency || metadata.currency || 'eur').toLowerCase(),
    status: 'paid',
    payment_status: 'paid',
    transaction_type: 'client_activation',
    provider: 'stripe',
    stripe_session_id: stripeCheckoutSessionId || `pi:${stripePaymentIntentId}`,
    stripe_checkout_session_id: stripeCheckoutSessionId,
    stripe_payment_intent_id: stripePaymentIntentId,
    livemode: Boolean(object.livemode)
  }, { onConflict: 'stripe_session_id' });
}

async function recordCoinsPurchase(object: Record<string, any>, metadata: Record<string, string>) {
  const userId = metadata.user_id;
  if (!userId) return;
  const tokenPackage = getCoinPackage(metadata.plan) || coinPackages.find((item) => item.coins === Number(metadata.coins_amount)) || coinPackages[0];
  const wallet = await getOrCreateMarketplaceWallet(userId);
  const stripeCheckoutSessionId = stringOrNull(object.object === 'checkout.session' ? object.id : object.checkout_session);
  const stripePaymentIntentId = stringOrNull(object.payment_intent || object.id && object.object === 'payment_intent' ? object.id : null);
  const amount = tokenPackage.coins;
  const existingTransaction = await supabaseAdmin
    .from('token_transactions')
    .select('id')
    .contains('metadata', { stripe_payment_intent_id: stripePaymentIntentId, stripe_checkout_session_id: stripeCheckoutSessionId })
    .maybeSingle();
  if (!existingTransaction.data) {
    await supabaseAdmin
      .from('wallets')
      .update({
        escort_token_balance: Number(wallet.escort_token_balance || 0) + amount,
        eur_spent: Number(wallet.eur_spent || 0) + tokenPackage.amount_cents / 100,
        updated_at: new Date().toISOString()
      })
      .eq('id', wallet.id);
    await supabaseAdmin.from('token_transactions').insert({
      to_wallet_id: wallet.id,
      amount,
      transaction_type: 'coins_purchase',
      status: 'completed',
      metadata: {
        package_id: tokenPackage.id,
        eur_price: tokenPackage.amount_cents / 100,
        stripe_checkout_session_id: stripeCheckoutSessionId,
        stripe_payment_intent_id: stripePaymentIntentId
      }
    });
  }
  await supabaseAdmin.from('token_purchase_requests').upsert({
    user_id: userId,
    wallet_id: wallet.id,
    token_amount: amount,
    eur_price: tokenPackage.amount_cents / 100,
    bonus_tokens: 0,
    status: 'approved',
    provider: 'stripe',
    transaction_type: 'coins_purchase',
    payment_status: 'paid',
    amount_cents: tokenPackage.amount_cents,
    currency: tokenPackage.currency,
    stripe_checkout_session_id: stripeCheckoutSessionId,
    stripe_payment_intent_id: stripePaymentIntentId,
    livemode: Boolean(object.livemode),
    metadata: { package_id: tokenPackage.id }
  }, { onConflict: 'stripe_checkout_session_id' });

  const coinWallet = await getOrCreateCoinWallet(userId);
  await grantCoins(coinWallet.id, userId, amount, 'coins_purchase', {
    stripe_checkout_session_id: stripeCheckoutSessionId,
    stripe_payment_intent_id: stripePaymentIntentId,
    package_id: tokenPackage.id
  });
}

async function upsertStripeSubscription(input: {
  subscriptionId: string | null;
  customerId: string | null;
  status: string;
  metadata: Record<string, string>;
  livemode: boolean;
  periodStart?: string | null;
  periodEnd?: string | null;
  cancelledAt?: string | null;
}) {
  const userId = input.metadata.user_id || null;
  const profileId = input.metadata.profile_id || null;
  const transactionType = input.metadata.transaction_type as StripeTransactionType;
  const plan = getStripePlan({ transactionType });
  const normalizedStatus = ['active', 'trialing'].includes(input.status) ? 'active' : input.status === 'past_due' ? 'past_due' : input.status === 'canceled' ? 'cancelled' : input.status;
  const subscription = {
    user_id: userId,
    profile_id: profileId || null,
    plan: plan.plan,
    role: transactionType === 'business_subscription' ? 'business' : 'escort',
    status: normalizedStatus,
    provider: 'stripe',
    external_subscription_id: input.subscriptionId,
    stripe_subscription_id: input.subscriptionId,
    stripe_customer_id: input.customerId,
    amount_eur: plan.amount_cents / 100,
    amount_cents: plan.amount_cents,
    currency: plan.currency.toUpperCase(),
    current_period_start: input.periodStart || null,
    current_period_end: input.periodEnd || null,
    cancelled_at: input.cancelledAt || null,
    payment_status: normalizedStatus === 'active' ? 'paid' : normalizedStatus,
    transaction_type: transactionType,
    livemode: input.livemode,
    metadata: { app: escortRadarStripeApp, ...input.metadata },
    updated_at: new Date().toISOString()
  };
  await supabaseAdmin.from('subscriptions').upsert(subscription, { onConflict: 'external_subscription_id' });

  if (profileId) {
    await supabaseAdmin.from('profiles').update({
      subscription_status: normalizedStatus,
      subscription_plan: plan.plan,
      listing_plan: plan.plan,
      listing_price: plan.amount_cents / 100,
      listing_currency: 'EUR',
      subscription_started_at: input.periodStart || undefined,
      subscription_expires_at: input.periodEnd || undefined,
      subscription_start: input.periodStart || undefined,
      subscription_end: input.periodEnd || undefined,
      provider: 'stripe',
      transaction_type: transactionType,
      max_profiles: transactionType === 'business_subscription' ? 30 : undefined
    }).eq('id', profileId);
  }
  if (userId) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...data.user?.app_metadata,
        subscription_status: normalizedStatus,
        plan: plan.plan,
        auth_account_type: transactionType === 'business_subscription' ? 'business' : 'escort'
      }
    });
  }
}

async function getOrCreateMarketplaceWallet(userId: string) {
  const { data } = await supabaseAdmin.from('wallets').select('*').eq('user_id', userId).maybeSingle();
  if (data) return data;
  const { data: wallet, error } = await supabaseAdmin
    .from('wallets')
    .insert({ user_id: userId, public_wallet_id: `ERW-${crypto.randomUUID().slice(0, 8).toUpperCase()}` })
    .select()
    .single();
  if (error) throw error;
  return wallet;
}

function stringOrNull(value: unknown) {
  const text = String(value || '').trim();
  return text || null;
}

function unixToIso(value: number) {
  return new Date(value * 1000).toISOString();
}
