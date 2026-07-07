import { Router, type Request, type Response } from 'express';
import { verifyUser } from '../middleware/auth.js';
import { config } from '../config.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler, optionalText } from '../validation.js';
import { createStripeCheckoutSession, sendStripeError } from '../services/stripePayments.js';
import { buildPaymentReference, manualPaymentProducts, manualPaymentProviders, normalizeManualPaymentProvider, paymentReferenceInstruction, resolveManualPaymentProduct } from '../manualPayments.js';
import { loadBcCoinPackages, toManualPaymentProduct } from '../bcCoinPackages.js';

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

paymentsRouter.post('/client-activation/checkout', verifyUser, asyncHandler(async (req, res) => {
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

paymentsRouter.post('/escort-subscription/checkout', verifyUser, asyncHandler(async (req, res) => {
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

paymentsRouter.post('/business-subscription/checkout', verifyUser, asyncHandler(async (req, res) => {
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

paymentsRouter.post('/coins/checkout', verifyUser, asyncHandler(async (req, res) => {
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
  const managedCoinProducts = (await loadBcCoinPackages({ activeOnly: true })).map(toManualPaymentProduct);
  const products = [
    ...manualPaymentProducts.filter((product) => product.purpose !== 'token_package'),
    ...managedCoinProducts
  ];
  res.json({
    products,
    providers: {
      manual: true,
      bank_transfer: config.manualBankTransferEnabled,
      crypto: config.manualCryptoEnabled,
      ccbill: config.ccbillEnabled,
      paysafe: config.paysafeEnabled
    },
    default_provider: config.paymentDefaultProvider,
    provider_labels: {
      manual: 'Manual confirmation',
      bank_transfer: 'manual bank transfer',
      crypto: 'discreet prepaid payment',
      ccbill: config.ccbillEnabled ? 'CCBill card payments' : 'CCBill card payments - coming soon',
      paysafe: config.paysafeEnabled ? 'Paysafecard/Paysafe' : 'Paysafecard/Paysafe - coming soon'
    },
    bank_transfer: {
      enabled: config.manualBankTransferEnabled,
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

async function createManualPaymentOrder(req: Request, res: Response) {
  const email = String(req.user?.email || '').toLowerCase();
  const userId = String(req.user?.id || '');
  const requestedProvider = optionalText(req.body.provider || req.body.paymentMethod, 40) || config.paymentDefaultProvider;
  const provider = normalizeManualPaymentProvider(requestedProvider);
  const productCode = optionalText(req.body.productCode || req.body.product_code || req.body.product_id, 80) || '';
  if (!email || !email.includes('@') || !userId) return res.status(401).json({ error: 'Authenticated user is required' });
  if (!manualPaymentProviders.includes(requestedProvider as any)) return res.status(400).json({ error: 'Unsupported payment provider' });
  if (provider === 'ccbill' && !config.ccbillEnabled) return res.status(400).json({ error: 'CCBill card payments are coming soon' });
  if (provider === 'paysafe' && !config.paysafeEnabled) return res.status(400).json({ error: 'Paysafe payments are coming soon' });
  if (provider === 'bank_transfer' && !config.manualBankTransferEnabled) return res.status(400).json({ error: 'Bank transfer is currently disabled' });
  if (provider === 'crypto' && !config.manualCryptoEnabled) return res.status(400).json({ error: 'Crypto payment is currently disabled' });

  const product = await resolveManualPaymentProduct(productCode);
  if (!product) return res.status(400).json({ error: 'Unknown payment product' });
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
      profile_id: null,
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
  await supabaseAdmin.from('manual_payment_orders').update({ instructions, metadata: finalMetadata }).eq('id', data.id);
  res.status(201).json({
    order: { ...data, instructions, metadata: finalMetadata, payment_reference: finalPaymentReference },
    instructions,
    payment_reference: finalPaymentReference,
    bank_transfer: {
      enabled: config.manualBankTransferEnabled,
      recipient: config.manualBankTransferRecipient,
      iban: config.manualBankTransferIban,
      bic: config.manualBankTransferBic,
      bank_name: config.manualBankTransferBankName
    },
    support_email: config.supportEmail
  });
}

paymentsRouter.post('/manual-orders', verifyUser, asyncHandler(createManualPaymentOrder));
paymentsRouter.post('/create-order', verifyUser, asyncHandler(createManualPaymentOrder));

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
