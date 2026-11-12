import { Router, type Request, type Response } from 'express';
import { getAuthAccountType, verifyUser } from '../middleware/auth.js';
import { isCommercialOperationsEnabled, requireCommercialOperations } from '../commercialOperations.js';
import { config } from '../config.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler, optionalText } from '../validation.js';
import { createStripeCheckoutSession, sendStripeError } from '../services/stripePayments.js';
import {
  buildPaymentReference,
  CUSTOMER_PAYMENT_PROVIDERS,
  isBankTransferConfigured,
  isCustomerOrderableProduct,
  manualPaymentProducts,
  manualPaymentProviders,
  normalizeManualPaymentProvider,
  paymentReferenceInstruction,
  resolveManualPaymentProduct
} from '../manualPayments.js';

export const paymentsRouter = Router();

function stripeDisabled(res: Response) {
  return res.status(410).json({ error: 'Stripe checkout is disabled for Escort Radar. Use manual payment orders.' });
}

paymentsRouter.get('/plans', (_req, res) => {
  res.json({
    plans: [
      {
        id: 'premium-monthly',
        name: 'Premium Profile',
        price_eur: 49.99,
        interval: 'month',
        status: 'coming_soon'
      }
    ],
    todo: 'Connect subscription billing for advertiser profiles before paid launch.'
  });
});

paymentsRouter.post('/client-activation/checkout', verifyUser, requireCommercialOperations, asyncHandler(async (req, res) => {
  if (!config.stripeEnabled || !config.stripeEscortRadarEnabled) return stripeDisabled(res);
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

paymentsRouter.post('/escort-subscription/checkout', verifyUser, requireCommercialOperations, asyncHandler(async (req, res) => {
  if (!config.stripeEnabled || !config.stripeEscortRadarEnabled) return stripeDisabled(res);
  try {
    const checkout = await createStripeCheckoutSession({
      userId: req.user!.id,
      email: req.user!.email,
      transactionType: 'escort_subscription',
      profileId: optionalText(req.body.profile_id, 80)
    });
    res.status(201).json(checkout);
  } catch (error) {
    sendStripeError(res, error);
  }
}));

paymentsRouter.post('/business-subscription/checkout', verifyUser, requireCommercialOperations, asyncHandler(async (req, res) => {
  if (!config.stripeEnabled || !config.stripeEscortRadarEnabled) return stripeDisabled(res);
  try {
    const checkout = await createStripeCheckoutSession({
      userId: req.user!.id,
      email: req.user!.email,
      transactionType: 'business_subscription',
      profileId: optionalText(req.body.profile_id, 80),
      businessId: optionalText(req.body.business_id, 80)
    });
    res.status(201).json(checkout);
  } catch (error) {
    sendStripeError(res, error);
  }
}));

paymentsRouter.post('/coins/checkout', verifyUser, requireCommercialOperations, asyncHandler(async (req, res) => {
  if (!config.stripeEnabled || !config.stripeEscortRadarEnabled) return stripeDisabled(res);
  try {
    const checkout = await createStripeCheckoutSession({
      userId: req.user!.id,
      email: req.user!.email,
      transactionType: 'coins_purchase',
      coinPackageId: optionalText(req.body.package_id || req.body.plan, 80)
    });
    res.status(201).json(checkout);
  } catch (error) {
    sendStripeError(res, error);
  }
}));

paymentsRouter.get('/manual-products', asyncHandler(async (_req, res) => {
  // Only products and payment methods a customer can complete today are offered; none during the public preview.
  const commercial = isCommercialOperationsEnabled();
  const products = commercial ? manualPaymentProducts.filter((product) => isCustomerOrderableProduct(product.id)) : [];
  const bankTransferReady = commercial && isBankTransferConfigured();
  res.json({
    commercial_operations_enabled: commercial,
    products,
    providers: {
      manual: false,
      bank_transfer: bankTransferReady,
      crypto: false,
      ccbill: false,
      paysafe: false
    },
    default_provider: 'bank_transfer',
    provider_labels: {
      manual: 'Manual confirmation',
      bank_transfer: 'manual bank transfer',
      crypto: 'discreet prepaid payment',
      ccbill: config.ccbillEnabled ? 'CCBill card payments' : 'CCBill card payments - coming soon',
      paysafe: config.paysafeEnabled ? 'Paysafecard/Paysafe' : 'Paysafecard/Paysafe - coming soon'
    },
    bank_transfer: {
      enabled: bankTransferReady,
      recipient: config.manualBankTransferRecipient,
      iban: config.manualBankTransferIban,
      bic: config.manualBankTransferBic,
      bank_name: config.manualBankTransferBankName,
      reference_template: config.manualBankTransferReferenceTemplate
    },
    support_email: config.supportEmail,
    operator: config.legalOperatorName
  });
}));

function bankTransferDetails() {
  return {
    enabled: isBankTransferConfigured(),
    recipient: config.manualBankTransferRecipient,
    iban: config.manualBankTransferIban,
    bic: config.manualBankTransferBic,
    bank_name: config.manualBankTransferBankName
  };
}

function orderResponse(order: Record<string, any>, reused: boolean) {
  const paymentReference = String(order.metadata?.payment_reference || '');
  return {
    order: { ...order, payment_reference: paymentReference },
    reused,
    instructions: order.instructions || paymentReferenceInstruction(order.id),
    payment_reference: paymentReference,
    bank_transfer: bankTransferDetails(),
    operator: config.legalOperatorName,
    support_email: config.supportEmail
  };
}

/** Checks that the buyer can actually receive the product. Returns the advertiser profile to bind, if any. */
async function checkOrderEligibility(req: Request, productId: string): Promise<{ error?: { status: number; code: string; message: string }; profileId?: string | null }> {
  const userId = String(req.user!.id);
  if (productId === 'client_activation') {
    const { data: activation, error } = await supabaseAdmin.from('client_activations').select('state').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (activation?.state === 'client_activated') return { error: { status: 409, code: 'ALREADY_ACTIVE', message: 'Premium is already active for this account' } };
    return { profileId: null };
  }
  if (productId === 'advertiser_30d') {
    if (getAuthAccountType(req.user) === 'client') return { error: { status: 409, code: 'ADVERTISER_ACCOUNT_REQUIRED', message: 'An advertiser account is required for this subscription' } };
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!profile) return { error: { status: 409, code: 'PROFILE_REQUIRED', message: 'Create your advertiser profile before ordering the subscription' } };
    return { profileId: String(profile.id) };
  }
  return { error: { status: 409, code: 'PRODUCT_NOT_AVAILABLE', message: 'This product is not available' } };
}

async function createManualPaymentOrder(req: Request, res: Response) {
  const email = String(req.user?.email || '').toLowerCase();
  const userId = String(req.user?.id || '');
  const requestedProvider = optionalText(req.body.provider || req.body.paymentMethod, 40) || config.paymentDefaultProvider;
  const provider = normalizeManualPaymentProvider(requestedProvider);
  const productCode = optionalText(req.body.productCode || req.body.product_code || req.body.product_id, 80) || '';
  if (!email || !email.includes('@') || !userId) return res.status(401).json({ error: 'Authenticated user is required' });
  if (!manualPaymentProviders.includes(requestedProvider as any)) return res.status(400).json({ error: 'Unsupported payment provider' });
  if (!CUSTOMER_PAYMENT_PROVIDERS.includes(provider)) return res.status(400).json({ error: 'This payment method is not available', code: 'PAYMENT_METHOD_NOT_AVAILABLE' });
  if (!isBankTransferConfigured()) return res.status(503).json({ error: 'Bank transfer is not configured', code: 'PAYMENT_NOT_CONFIGURED' });

  const product = await resolveManualPaymentProduct(productCode);
  if (!product) return res.status(400).json({ error: 'Unknown payment product' });
  if (!isCustomerOrderableProduct(product.id)) return res.status(409).json({ error: 'This product is not available', code: 'PRODUCT_NOT_AVAILABLE' });
  const eligibility = await checkOrderEligibility(req, product.id);
  if (eligibility.error) return res.status(eligibility.error.status).json({ error: eligibility.error.message, code: eligibility.error.code });

  // One open order per product: a repeated click shows the same reference instead of a second order to pay.
  const { data: openOrder, error: openOrderError } = await supabaseAdmin
    .from('manual_payment_orders')
    .select('*')
    .eq('user_id', userId)
    .eq('product_id', product.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openOrderError) return res.status(500).json({ error: openOrderError.message });
  if (openOrder) return res.status(200).json(orderResponse(openOrder, true));

  const paymentReference = buildPaymentReference('pending', email);
  const { data, error } = await supabaseAdmin
    .from('manual_payment_orders')
    .insert({
      user_id: userId,
      email,
      provider,
      purpose: product.purpose,
      product_id: product.id,
      product_label: product.label,
      amount_cents: product.amount_cents,
      amount_eur: product.amount_cents / 100,
      currency: product.currency,
      tokens_amount: 'total_tokens' in product ? product.total_tokens : ('tokens' in product ? product.tokens : null),
      profile_id: eligibility.profileId || null,
      business_id: null,
      status: 'pending',
      instructions: '',
      metadata: {
        payment_reference_template: config.manualBankTransferReferenceTemplate,
        payment_reference: paymentReference,
        base_tokens: 'tokens' in product ? product.tokens : null,
        bonus_tokens: 'bonus_tokens' in product ? product.bonus_tokens : null,
        total_tokens: 'total_tokens' in product ? product.total_tokens : null
      }
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  const instructions = paymentReferenceInstruction(data.id);
  const finalPaymentReference = buildPaymentReference(data.id, email);
  const finalMetadata = {
    ...(data.metadata || {}),
    payment_reference: finalPaymentReference,
    payment_reference_template: config.manualBankTransferReferenceTemplate
  };
  const { error: finalizeError } = await supabaseAdmin.from('manual_payment_orders').update({ instructions, metadata: finalMetadata }).eq('id', data.id);
  if (finalizeError) return res.status(500).json({ error: finalizeError.message });
  res.status(201).json(orderResponse({ ...data, instructions, metadata: finalMetadata }, false));
}

paymentsRouter.post('/manual-orders', verifyUser, requireCommercialOperations, asyncHandler(createManualPaymentOrder));
paymentsRouter.post('/create-order', verifyUser, requireCommercialOperations, asyncHandler(createManualPaymentOrder));

paymentsRouter.get('/my-orders', verifyUser, asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('manual_payment_orders')
    .select('id, product_id, product_label, provider, amount_eur, currency, status, approved_at, applied_at, created_at, metadata')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    orders: (data || []).map((order) => ({
      orderId: order.id,
      productCode: order.product_id,
      product: order.product_label,
      provider: order.provider,
      amount: order.amount_eur,
      currency: order.currency,
      status: order.status,
      paymentReference: order.metadata?.payment_reference || '',
      createdAt: order.created_at,
      paidAt: order.approved_at,
      appliedAt: order.applied_at
    }))
  });
}));
