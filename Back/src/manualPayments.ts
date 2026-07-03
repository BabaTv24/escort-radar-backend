import { supabaseAdmin } from './supabase.js';
import { config } from './config.js';
import { activateClientAccount, adjustTokenWalletBalance, getOrCreateTokenWallet } from './services/clientActivation.js';

export const manualPaymentProviders = ['manual', 'bank_transfer', 'crypto', 'ccbill', 'paysafe', 'paysafecard'] as const;
export const manualPaymentPurposes = ['client_activation', 'advertiser_subscription', 'agency_subscription', 'token_package'] as const;

export type ManualPaymentPurpose = typeof manualPaymentPurposes[number];

export const manualPaymentProducts = [
  { id: 'client_activation', purpose: 'client_activation', label: 'Client Activation', amount_cents: 99, currency: 'EUR' },
  { id: 'advertiser_30d', purpose: 'advertiser_subscription', label: 'Solo Advertiser Premium Listing', amount_cents: 4999, currency: 'EUR', days: 30 },
  { id: 'agency_30d', purpose: 'agency_subscription', label: 'Agency / Business Plan', amount_cents: 49900, currency: 'EUR', days: 30 },
  { id: 'tokens_120', purpose: 'token_package', label: '120 tokens', amount_cents: 1800, currency: 'EUR', tokens: 120 },
  { id: 'tokens_520', purpose: 'token_package', label: '520 tokens', amount_cents: 7800, currency: 'EUR', tokens: 520 },
  { id: 'tokens_1200', purpose: 'token_package', label: '1,200 tokens', amount_cents: 18000, currency: 'EUR', tokens: 1200 },
  { id: 'tokens_2560', purpose: 'token_package', label: '2,560 tokens', amount_cents: 38400, currency: 'EUR', tokens: 2560 },
  { id: 'tokens_5200', purpose: 'token_package', label: '5,200 tokens', amount_cents: 78000, currency: 'EUR', tokens: 5200 },
  { id: 'tokens_10200', purpose: 'token_package', label: '10,200 tokens', amount_cents: 153000, currency: 'EUR', tokens: 10200 }
] as const;

export function normalizeManualPaymentProvider(provider: string) {
  return provider === 'paysafecard' ? 'paysafe' : provider;
}

export function findManualPaymentProduct(productId: string, purpose?: string) {
  return manualPaymentProducts.find((product) => product.id === productId)
    || manualPaymentProducts.find((product) => product.purpose === purpose)
    || null;
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
    const product = findManualPaymentProduct(order.product_id || '', order.purpose);
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
  const amount = Number(product.tokens || order.tokens_amount || 0);
  if (!amount) return;
  const wallet = await getOrCreateTokenWallet(userId);
  await adjustTokenWalletBalance(wallet.id, userId, amount, 'manual_payment_tokens', {
    manual_payment_order_id: order.id,
    product_id: product.id
  }, adminEmail);
}
