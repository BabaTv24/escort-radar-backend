import { supabaseAdmin } from './supabase.js';
import { config } from './config.js';
import { activateClientAccount, adjustTokenWalletBalance, getOrCreateTokenWallet } from './services/clientActivation.js';
import { resolveBcCoinManualPaymentProduct } from './bcCoinPackages.js';

export const manualPaymentProviders = ['manual', 'bank_transfer', 'crypto', 'ccbill', 'paysafe', 'paysafecard'] as const;
export const manualPaymentPurposes = ['client_activation', 'advertiser_subscription', 'agency_subscription', 'token_package'] as const;

export type ManualPaymentPurpose = typeof manualPaymentPurposes[number];

export const bcCoinPackages = [
  { id: 'bc_66', coins: 66, bonusCoins: 0, totalCoins: 66, priceEur: 9.99, label: '66 BC Coins' },
  { id: 'bc_166', coins: 166, bonusCoins: 20, totalCoins: 186, priceEur: 24.99, label: '166 BC Coins' },
  { id: 'bc_666', coins: 666, bonusCoins: 150, totalCoins: 816, priceEur: 99.99, label: '666 BC Coins' },
  { id: 'bc_1200', coins: 1200, bonusCoins: 450, totalCoins: 1650, priceEur: 180, label: '1200 BC Coins' },
  { id: 'bc_2560', coins: 2560, bonusCoins: 700, totalCoins: 3260, priceEur: 384, label: '2560 BC Coins' },
  { id: 'bc_5200', coins: 5200, bonusCoins: 1500, totalCoins: 6700, priceEur: 780, label: '5200 BC Coins' },
  { id: 'bc_10200', coins: 10200, bonusCoins: 3133, totalCoins: 13333, priceEur: 1530, label: '10200 BC Coins' }
] as const;

export const manualPaymentProducts = [
  { id: 'client_activation', purpose: 'client_activation', label: 'Client Activation', amount_cents: 99, currency: 'EUR' },
  { id: 'advertiser_30d', purpose: 'advertiser_subscription', label: 'Solo Advertiser Premium Listing', amount_cents: 4999, currency: 'EUR', days: 30 },
  { id: 'agency_30d', purpose: 'agency_subscription', label: 'Agency / Business Plan', amount_cents: 49900, currency: 'EUR', days: 30 },
  ...bcCoinPackages.map((coinPackage) => ({
    id: coinPackage.id,
    purpose: 'token_package',
    label: coinPackage.label,
    amount_cents: Math.round(coinPackage.priceEur * 100),
    currency: 'EUR',
    tokens: coinPackage.coins,
    bonus_tokens: coinPackage.bonusCoins,
    total_tokens: coinPackage.totalCoins
  }))
] as const;

export function normalizeManualPaymentProvider(provider: string) {
  return provider === 'paysafecard' ? 'paysafe' : provider;
}

export function findManualPaymentProduct(productId: string, purpose?: string) {
  return manualPaymentProducts.find((product) => product.id === productId)
    || manualPaymentProducts.find((product) => product.purpose === purpose)
    || null;
}

export async function resolveManualPaymentProduct(productId: string, purpose?: string) {
  if (productId.startsWith('bc_') || purpose === 'token_package') {
    const dynamicProduct = productId ? await resolveBcCoinManualPaymentProduct(productId) : null;
    if (dynamicProduct) return dynamicProduct;
  }
  const staticProduct = findManualPaymentProduct(productId, purpose);
  if (staticProduct) return staticProduct;
  return null;
}

export function paymentReferenceInstruction(orderId: string) {
  return `Please include your account email and order number in the payment reference. Your order will be activated after manual confirmation. Order number: ${orderId}`;
}

export function buildPaymentReference(orderId: string, userEmail: string, template = config.manualBankTransferReferenceTemplate) {
  return template
    .replaceAll('{orderId}', orderId)
    .replaceAll('{userEmail}', userEmail);
}

export async function resolveOrderUser(order: Record<string, any>) {
  if (order.user_id) return { id: order.user_id, email: order.email || order.user_email || null, app_metadata: {} as Record<string, any> };
  const email = String(order.email || order.user_email || '').toLowerCase();
  if (!email) return null;
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data.users.find((item) => String(item.email || '').toLowerCase() === email);
  return user ? { id: user.id, email: user.email || email, app_metadata: user.app_metadata || {} } : null;
}

export async function applyManualPaymentOrder(order: Record<string, any>, adminEmail?: string) {
  if (order.applied_at) return { applied: false, reason: 'already_applied' };
  const { error: claimError } = await supabaseAdmin
    .from('manual_payment_order_applications')
    .insert({ order_id: order.id, admin_email: adminEmail || null });
  if (claimError) {
    if (claimError.code === '23505') return { applied: false, reason: 'already_applied' };
    throw claimError;
  }

  try {
    const user = await resolveOrderUser(order);
    if (!user) throw new Error('User not found for manual payment order');
    const product = await resolveManualPaymentProduct(order.product_id || '', order.purpose);
    if (!product) throw new Error('Unknown manual payment product');

    if (order.purpose === 'client_activation') {
      await activateClientAccount(user.id);
    } else if (order.purpose === 'advertiser_subscription' || order.purpose === 'agency_subscription') {
      await applyManualSubscription(user.id, order, product, order.purpose === 'agency_subscription');
    } else if (order.purpose === 'token_package') {
      await applyManualTokenPackage(user.id, order, product, adminEmail);
    }
  } catch (error) {
    await supabaseAdmin.from('manual_payment_order_applications').delete().eq('order_id', order.id);
    throw error;
  }

  return { applied: true };
}

async function applyManualSubscription(userId: string, order: Record<string, any>, product: Record<string, any>, agency: boolean) {
  const now = new Date();
  let readQuery = supabaseAdmin
    .from('profiles')
    .select('id, premium_valid_until')
    .eq('user_id', userId);
  if (order.profile_id) readQuery = readQuery.eq('id', order.profile_id);
  const { data: existingProfile, error: readError } = await readQuery
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) throw readError;
  const existingValidUntil = existingProfile?.premium_valid_until ? new Date(String(existingProfile.premium_valid_until)) : null;
  const baseDate = existingValidUntil && Number.isFinite(existingValidUntil.getTime()) && existingValidUntil > now ? existingValidUntil : now;
  const validUntil = new Date(baseDate.getTime() + Number(product.days || 30) * 24 * 60 * 60 * 1000);
  const plan = agency ? 'business_manual_30d' : 'advertiser_manual_30d';
  const patch = {
    subscription_status: 'active',
    subscription_plan: plan,
    listing_plan: plan,
    subscription_start: now.toISOString(),
    subscription_end: validUntil.toISOString(),
    subscription_started_at: now.toISOString(),
    subscription_expires_at: validUntil.toISOString(),
    premium_tier: agency ? 'diamond' : 'gold',
    premium_valid_until: validUntil.toISOString(),
    advertiser_premium: !agency,
    agency_premium: agency,
    provider: order.provider || 'manual',
    revenue_amount: 0,
    max_profiles: agency ? 30 : undefined
  };
  const query = supabaseAdmin.from('profiles').update(patch).eq('user_id', userId);
  if (order.profile_id) query.eq('id', order.profile_id);
  const { error } = await query;
  if (error) throw error;
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...data.user?.app_metadata,
      subscription_status: 'active',
      plan: agency ? 'business_monthly' : 'escort_monthly',
      auth_account_type: agency ? 'business' : (data.user?.app_metadata?.auth_account_type || 'escort')
    }
  });
}

async function applyManualTokenPackage(userId: string, order: Record<string, any>, product: Record<string, any>, adminEmail?: string) {
  const baseAmount = Number(product.tokens || order.tokens_amount || 0);
  const bonusAmount = Number(product.bonus_tokens || 0);
  const amount = Number(product.total_tokens || (baseAmount + bonusAmount));
  if (!amount) return;
  const wallet = await getOrCreateTokenWallet(userId);
  await adjustTokenWalletBalance(wallet.id, userId, amount, 'manual_payment_tokens', {
    manual_payment_order_id: order.id,
    product_id: product.id,
    base_tokens: baseAmount,
    bonus_tokens: bonusAmount,
    total_tokens: amount
  }, adminEmail);
}
